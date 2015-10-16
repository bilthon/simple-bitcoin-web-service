var readline = require('readline');
var Mnemonic = require('bitcore-mnemonic');
var readlineSync = require('readline-sync');


var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/* Encrypted secret key */
var secret_key;

/* TODO: Encryption password for the secret key */
var password;


/*
* Requests user input in order to determine whether this is a production or debug environment
* and creates a server private key accordingly
*/
function setupEnv(){
    var options = ['Debug', 'Production'];
    var index = readlineSync.keyInSelect(options, 'Please choose a run environment: ', {cancel:false});
    if(index == 0)
        process.env.NODE_ENV = 'debug';
    else if(index == 1)
        process.env.NODE_ENV = 'production';
}

/*
* Request user input in order to determine which kind of secret key to use.
*/
function setupKey(){
    var options = ['Custom', 'Random'];
    var index = readlineSync.keyInSelect(options, 'Please choose a key mode use: ', {cancel:false});
    if(index == 0)
        useCustomKey();
    else if(index == 1)
        useRandomKey();
}

/* Requests the mnemonic sequence that will be used to create the server private key */
function useCustomKey(){
    var sequence = readlineSync.question('Enter your private key mnemonic sequence: ');
    if(Mnemonic.isValid(sequence)){
        var code = new Mnemonic(sequence);
        var network = process.env.NODE_ENV == 'debug' ? 'testnet' : 'livenet';
        secret_key = code.toHDPrivateKey(undefined, network);
        module.exports.secret_key = secret_key;
    }else{
        console.error('Invalid mnemonic sequence');
        process.exit(1);
    }
}

/* Use a randomly generated private key */
function useRandomKey(){
    var code = new Mnemonic();
    console.log('Using mnemonic sequence: '+code.toString());
    var network = process.env.NODE_ENV == 'debug' ? 'testnet' : 'livenet';
    secret_key = code.toHDPrivateKey(undefined, network);
    console.log('secret_key: '+secret_key);
    module.exports.secret_key = secret_key;
}

module.exports = {
    setupEnv: setupEnv,
    setupKey: setupKey,
    secret_key: secret_key,
    password: password
};