var mongoose = require('mongoose');

/*
* Database connection
*/
var connection = mongoose.createConnection('mongodb://localhost/myapp');

module.exports = {
    connection: connection
}