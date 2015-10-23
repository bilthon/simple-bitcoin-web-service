var mongoose = require('mongoose');
var pass = require('./pass');
var bitcore = require('bitcore');
var connection = require('./db').connection;
var serverEnv = require('./server-env');
var Mnemonic = require('bitcore-mnemonic');
var util = require('util');
var Insight = require('bitcore-explorers').Insight;
var lodash = require('lodash');

/* If the environment variable NODE_ENV is 'production' we use the livenet, in case it is 'debug' we use the testnet */
var network = process.env.NODE_ENV == 'production' ? bitcore.Networks.livenet : bitcore.Networks.testnet;

var network_argument = network == bitcore.Networks.livenet ? { private: 0x80 } : { private: 0xef };

var UserSchema = new mongoose.Schema({
    username: String,
    salt: String,               // Salt for the hashed password
    hashed_password: String,    // Hashed password
    user_account: Number,       // The number of the user account 
    external_count: Number,     // The number of external wallets generated for this user
    internal_count: Number      // The number of internal wallets generated for this user 
});

var User = connection.model('users', UserSchema);

function createUser(username, password, fn){
    pass.hash(password, function (err, salt, hash) {
    if (err) throw err;
        User.count({}, function(err, count){
            if(err) new Error('Error while counting users');

            var promise = new User({
                username: username,
                salt: salt,
                hashed_password: hash,
                user_account: count,     // Using the user count as the account number
                external_count: 0,
                internal_count: 0
            }).save();
            promise.onResolve(function(err, user){
                onUserSaved(err, user, fn);
                incrementExternalWalletCount(user);
            });
        });
    });
}

function incrementInternalWalletCount(user, fn){
    incrementWalletCount(user, false, fn);
}

function incrementExternalWalletCount(user, fn){
    incrementWalletCount(user, true, fn);
}

/**
* @param {object} User object from mongodb
* @param {boolean} True if the wallet to be incremented is the external one, false otherwise
* @param {function} Callback function with the following signature: function(error, raw_mongodb_response)
*/
function incrementWalletCount(user, external, fn){
    if(external)
        var updated = {external_count: user.external_count + 1};
    else
        var updated = {internal_count: user.internal_count + 1};
    User.update({username: user.username}, updated, {multi: false}, function(err, raw){
        if(err) console.error(err);
        if(fn != undefined)
            fn(err, raw);
    });
}

function onUserSaved(err, user, fn){
    if(err) return fn(new Error('Error saving user'));

    /* User data object that will be used by the jade template engine to render stuff */
    var userData = {
        username: user.username,
        address: getExternalAddress(user)
    };
    fn(err, userData);
}

/**
 * Creates a fresh internal (or change) address for a given user.
 * @param {Object} User object retrieved from the collection
 * @return {String} A fresh new address
 */
function getInternalAddress(user){
    return createAddress(user, 1, user.internal_count);
}

/**
 * Gets the latest created external address for a given user.
 * @param {object|string} Either a user object retrieved from the collection or a user name
 * @return {string} A fresh new address
 */
function getExternalAddress(arg){
    if ( typeof(arg) == 'string' ){
        User.findOne({username: arg}, function(err, user){
            return createAddress(user, 0, user.external_count);
        });
    }
    var user = arg;
    return createAddress(user, 0, user.external_count);
}

function createAddress(user, change, index){
    var coin = process.env.NODE_ENV == 'production' ? 0 : 1;
    var address = getPrivateKey(user, change, index)
        .toAddress()
        .toString();
    return address;
}

function getPrivateKey(user, change, index){
    var coin = process.env.NODE_ENV == 'production' ? 0 : 1;
    var privateKey = serverEnv.secret_key
        .derive(util.format("m/44'/%d'/%d'/%d/%d", coin, user.user_account, change, index))
        .privateKey;
    return privateKey;
}

function getPrivateKeys(user, utxos){
    var privateKeys = [];
    for(var i in utxos){
        var limits = [user.external_count, user.internal_count];
        for(j = 0; j < limits.length; j++){
            for(var k = 0; k < limits[j]; k++){
                var pk = getPrivateKey(user, j, k);
                if(pk.toAddress().toString() == utxos[i]['address']){
                    privateKeys.push(pk);
                }
            }
        }
    }
    console.log('found '+privateKeys.length+' private keys for '+utxos.length+' utxos');
    return privateKeys;
}

/**
* Authenticates user
* @param {String} User name
* @param {String} User password
* @param {Function} Callback function
*/
function authenticate(name, password, fn) {

    User.findOne({
        username: name
    },

    function (err, user) {
        if (user) {
            if (err) return fn(new Error('cannot find user'));
            pass.hash(password, user.salt, function (err, hash) {
                if (err) return fn(err);
                calculateBalance(user, function(err, balance){
                    var userData = {
                        username: user.username, 
                        address: getExternalAddress(user),
                        balance: String(balance)
                    };
                    console.log('sending user data: '+JSON.stringify(userData));
                    if(hash == user.hashed_password)
                        fn(null, userData)
                    else
                        fn(new Error('invalid password'));
                })
            });
        } else {
            fn(new Error('cannot find user'));
        }
    });

}

function welcome(username, fn){
    calculateBalance(username, function(err, balance){
        if (err) return fn(err);
        var userData = {
            username: username, 
            address: getExternalAddress(user),
            balance: String(balance)
        };
        fn(null, userData);
    });
}

function requiredAuthentication(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        req.session.error = 'Access denied!';
        res.redirect('/login');
    }
}

function userExist(req, res, next) {
    User.count({
        username: req.body.username
    }, function (err, count) {
        if (count === 0) {
            next();
        } else {
            req.session.error = "User Exist"
            res.render("signup", { error : req.session.error });
        }
    });
}

function refreshAddress(user, fn){
    User.findOne({
        username: user.username
    }, function(err, user){
        incrementExternalWalletCount(user, function(err, raw){
            if(err) return fn(err);

            calculateBalance(user, function(err, balance){
                var userData = {
                    username: user.username, 
                    address: getExternalAddress(user),
                    balance: String(balance)
                };
                fn(err, userData);
            });
        });
    });
}

/**
* Asyncronous call to retrieve all unspent transaction outputs
* @param {string} user object
* @param {function} callback
*/
function getUtxos(user, fn){
    var addresses = getUsedAddresses(user);
    var insight = new Insight(network);
    insight.getUnspentUtxos(addresses, fn);    
}

/**
* Function that will return an array of unspent transaction outputs that have to be combined
* in order to satisfy a given required amount.
* @param {array} Array of UnspentUtxos objects
* @param {number} The target amount
* @return {array} An array containing the unspent transaction outputs to be used. Or an empty
* array if there are not enough funds to satisfy the given target.
*/
function getSpendableUtxos(utxos, targetAmount){
    var utxosObj = lodash.invoke(utxos, 'toObject');
    var spendableUtxos = [];
    var i = 0;
    console.log('sum of all utxos: '+utxosObj);
    while(lodash.sum(spendableUtxos, 'amount') < targetAmount && i < utxos.length){
        spendableUtxos.push(utxosObj[i]);
        i++;
    }
    console.log('sum of all necessary utxos: '+lodash.sum( spendableUtxos, 'amount' ));
    if(lodash.sum(spendableUtxos, 'amount') < targetAmount)
        return [];
    else
        return spendableUtxos;
}

/**
* Function that given an array of unspent transaction output objects will add
* all of their values.
* @param {array} Unspent transaction output objects
* @return {number} The total balance associated with the user, in BTC.
*/
function addBalance(utxos){
    var balance = 0;
    for(var i in utxos){
        if(utxos[i].toObject()['amount'] != undefined){
            balance += utxos[i].toObject()['amount'];            
        }
    }
    return balance;
}

/**
* Function that will find all unspent transaction outputs related to a user and 
* return the balance associated with that user.
* @param {string|object} Either a string containing the user name or the user object retrieved from the database.
* @param {function} Callback function with the signature: `function(err, balance)`
*/
function calculateBalance(user, fn){

    /* Handler to be used after the unspent transaction outputs are refrieved */
    var utxosHandler = function(err, utxos){
        var balance = addBalance(utxos);
        console.log('balance: '+balance);
        fn(err, balance);
    }

    if(typeof(user) == 'string'){
        User.findOne({username: user}, function(err, user){
            getUtxos(user, utxosHandler);
        });
    }else{
        getUtxos(user, utxosHandler)
    }
}

/**
* Returns all used addresses, both internal and external.
* @param {object} User object retrieved from the database.
*/
function getUsedAddresses(user){
    var addresses = [];
    var coin = process.env.NODE_ENV == 'production' ? 0 : 1;
    var limits = [user.external_count, user.internal_count];
    for(i = 0; i < limits.length; i++){
        for(var j = 0; j < limits[i]; j++){
            var address = getPrivateKey(user, i, j)
                .toAddress()
                .toString();
            addresses.push(address);
        }
    }
    return addresses;
}

/**
* Send funds to another user.
* @param {object} User object saved in the session
* @param {number} Amount in BTC to be sent
* @param {string} Destination address
* @param {function} Callback with the following signature `function(err, userData)`. 
* Where userData is the user object kept in the session.
*/
function send(user, amount, address, fn){
    User.findOne({
        username: user.username
    }, function(err, user){
        getUtxos(user, function(err, utxos){
            var balance = addBalance(utxos);
            var insight = new Insight(network);
            var spendableUtxos = getSpendableUtxos(utxos, amount);
            if(spendableUtxos.length == 0){
                console.error('Insuficcient funds to make this transaction');
                return fn(new Error('Insuficcient funds to make this transaction'));
            }
            var keys = getPrivateKeys(user, spendableUtxos);
            var transaction = new bitcore.Transaction()
                .from(spendableUtxos)
                .to(address, bitcore.Unit.fromBTC(amount).toSatoshis())
                .change(getInternalAddress(user))
                .sign(keys);

            insight.broadcast(transaction, function(err, returnedTxId){
                console.log('transaction broadcasted. err: '+err+', returnedTxId: '+returnedTxId);
                if(err) return(err, userData);
                incrementInternalWalletCount(user, function(err, raw){
                    var userData = {
                        username: user.username, 
                        address: getExternalAddress(user),
                        balance: String(balance - amount)
                    };                    
                    fn(err, userData);
                })
            })
        });
    });
}

module.exports = {
    createUser: createUser,
    authenticate: authenticate,
    requiredAuthentication: requiredAuthentication,
    userExist: userExist,
    connection: connection,
    refreshAddress: refreshAddress,
    send: send,
    calculateBalance: calculateBalance,
    welcome: welcome
}