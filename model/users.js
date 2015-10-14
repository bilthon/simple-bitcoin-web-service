var mongoose = require('mongoose');
var pass = require('./pass');
var Bip38 = require('bip38');
var bitcore = require('bitcore');
var connection = require('./db').connection;
var serverEnv = require('./server-env');
var Mnemonic = require('bitcore-mnemonic');

/* If the environment variable NODE_ENV is 'production' we use the livenet, in case it is 'debug' we use the testnet */
var network = process.env.NODE_ENV == 'production' ? bitcore.Networks.livenet : bitcore.Networks.testnet;

var network_argument = network == bitcore.Networks.livenet ? { private: 0x80 } : { private: 0xef };

var UserSchema = new mongoose.Schema({
    username: String,
    salt: String,               // Salt for the hashed password
    hashed_password: String,    // Hashed password
    private_key: String,        // Encrypted user private key
    public_key: String,         // Plaintext user public key
    pk_salt: String,            // BIP 38 encryption uses the address as the salt
    multisig_address: String    // The multisig address this user will use to receive funds
});

var User = connection.model('users', UserSchema);

function createEncryptedPrivateKey(password, fn){
    var privateKey = bitcore.PrivateKey.fromRandom(network);
    var privateKeyWif = privateKey.toWIF();
    var address = privateKey.toAddress().toString();
    var bip38 = new Bip38(network_argument);
    var encrypted = bip38.encrypt(privateKeyWif, password, address);
    fn(privateKey, encrypted, address);
}

function decryptPrivateKey(username, password, fn){
    var bip38 = new Bip38(network_argument);
    User.findOne({
        username : username
    },

    function (err, user){
        if(user){
            console.log('string to decrypt: '+user.pk);
            var decrypted = bip38.decrypt(user.pk, password);
            console.log('decrypted: '+decrypted);
            return fn(undefined, {username: user.username, private_key: decrypted });
        }else{
            return fn(new Error('Invalid user'));
        }
    });
}

function createUser(username, password, fn){
    pass.hash(password, function (err, salt, hash) {
        if (err) throw err;
        createEncryptedPrivateKey(password, function(privateKey, encrypted, address){
            var backupKey = createBackupKey();

            var publicServerKey = serverEnv.secret_key.hdPublicKey.derive(1).publicKey;
            var publicClientKey = new bitcore.PublicKey(privateKey);
            var publicBackupKey = backupKey['public_key'];

            var promise = new User({
                username: username,
                salt: salt,
                hashed_password: hash,
                private_key: encrypted,         // Encrypted user private key
                public_key: publicClientKey,    // Plaintext user public key
                pk_salt: address,               // BIP 38 encryption uses the address as the salt
                multisig_address: createMultisigAddress(publicServerKey, publicClientKey, publicBackupKey)
            }).save();
            promise.onResolve(function(err, user){
                onUserSaved(err, user, backupKey, fn);
            })
        });
    });
}

function onUserSaved(err, user, backupKey, fn){
    if(err) throw err;

    /* User data object that will be used by the jade template engine to render stuff */
    var userData = {
        user: user,
        backup_private: backupKey['private_key'],
        backup_public: backupKey['public_key'],
        multisig_address: user.multisig_address,
        mnemonic: backupKey.mnemonic
    };
    fn(err, userData);
}

/*
* Authenticate user
*/
function authenticate(name, pass, fn) {

    User.findOne({
        username: name
    },

    function (err, user) {
        if (user) {
            if (err) return fn(new Error('cannot find user'));
            hash(pass, user.salt, function (err, hash) {
                if (err) return fn(err);
                if (hash == user.hash) return fn(null, user);
                fn(new Error('invalid password'));
            });
        } else {
            return fn(new Error('cannot find user'));
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

function createBackupKey(){
    var code = new Mnemonic(Mnemonic.Words.SPANISH);
    var backupPrivate = code.toHDPrivateKey().derive('m/44\'/0\'/0\'/0');
    var backupPublic = backupPrivate.hdPublicKey.toObject().publicKey;
    return {private_key: backupPrivate.toObject().privateKey, public_key: backupPublic, mnemonic: code.toString()};
}

function createMultisigAddress(serverKey, userKey, backupKey){
    console.log(serverKey+', '+userKey+', '+backupKey);
    return new bitcore.Address([serverKey, userKey, backupKey], 2, network);
}

module.exports = {
    createUser: createUser,
    authenticate: authenticate,
    requiredAuthentication: requiredAuthentication,
    userExist: userExist,
    User: User,
    connection: connection,
    decryptPrivateKey: decryptPrivateKey,
    createBackupKey: createBackupKey,
    createMultisigAddress: createMultisigAddress
}