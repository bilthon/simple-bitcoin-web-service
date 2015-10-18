var mongoose = require('mongoose');
var pass = require('./pass');
var bitcore = require('bitcore');
var connection = require('./db').connection;
var serverEnv = require('./server-env');
var Mnemonic = require('bitcore-mnemonic');
var util = require('util');
var Insight = require('bitcore-explorers').Insight;

/* If the environment variable NODE_ENV is 'production' we use the livenet, in case it is 'debug' we use the testnet */
var network = process.env.NODE_ENV == 'production' ? bitcore.Networks.livenet : bitcore.Networks.testnet;

var network_argument = network == bitcore.Networks.livenet ? { private: 0x80 } : { private: 0xef };

var UserSchema = new mongoose.Schema({
    username: String,
    salt: String,               // Salt for the hashed password
    hashed_password: String,    // Hashed password
    user_account: Number,       // The number of the user account 
    wallet_count: Number        // The amount of wallets generated for this user
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
                wallet_count: 0
            }).save();
            promise.onResolve(function(err, user){
                onUserSaved(err, user, fn);
                incrementWalletCount(user);
            });
        });
    });
}

function incrementWalletCount(user, fn){
    User.update({username: user.username}, {wallet_count: user.wallet_count + 1}, {multi: false}, function(err, raw){
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
        address: createAddress(user)
    };
    fn(err, userData);
}

/**
 * Creates a fresh wallet for a given user.
 * @param {Object} User object retrieved from the collection
 * @param {Boolean} Whether to create an external (or internal) address
 * @return {String} A fresh new address
 */
function createAddress(user, external){
    var change = 0;
    if(external != undefined && external == true)
        change = 1;

    var coin = process.env.NODE_ENV == 'production' ? 0 : 1;
    var address = serverEnv.secret_key
        .derive(util.format("m/44'/%d'/%d'/%d/%d", coin, user.user_account, change, user.wallet_count))
        .privateKey
        .toAddress()
        .toString();
    return address;
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
                        address: createAddress(user),
                        balance: balance
                    };
                    if( hash == user.hashed_password)
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
        incrementWalletCount(user, function(err, raw){
            if(err) return fn(err);

            calculateBalance(user, function(err, balance){
                var userData = {
                    username: user.username, 
                    address: createAddress(user),
                    balance: String(balance)
                };
                fn(err, userData);
            });
        });
    });
}

function calculateBalance(user, fn){
    var addresses = getUsedAddresses(user);
    var insight = new Insight(network);
    insight.getUnspentUtxos(addresses, function(err, utxos){
        var balance = 0;
        for(var i in utxos){
            if(utxos[i].toObject()['amount'] != undefined)
                balance += utxos[i].toObject()['amount'];
        }
        fn(err, balance);
    });
}

function getUsedAddresses(user){
    var addresses = [];
    var coin = process.env.NODE_ENV == 'production' ? 0 : 1;
    for(var i = 0; i < user.wallet_count; i++){
        var address = serverEnv.secret_key
            .derive(util.format("m/44'/%d'/%d'/%d/%d", coin, user.user_account, 0, i))
            .privateKey
            .toAddress()
            .toString();
        addresses.push(address);
    }
    return addresses;
}

module.exports = {
    createUser: createUser,
    authenticate: authenticate,
    requiredAuthentication: requiredAuthentication,
    userExist: userExist,
    User: User,
    connection: connection,
    refreshAddress: refreshAddress
}