var express = require('express');
var router = express.Router();
var users = require('../model/users');
var hash = require('../model/pass').hash;

/* GET home page. */
router.get("/", function (req, res) {
    if (req.session.user) {
        res.render("welcome", {username: req.session.user.username});
    } else {
        res.render("welcome")
    }
});

router.get("/login", function (req, res) {
    res.render("login");
});

router.post("/login", function (req, res) {
    users.authenticate(req.body.username, req.body.password, function (err, user) {
        if (user) {
            req.session.regenerate(function () {
                req.session.user = user;
                res.redirect('/');
            });
        } else {
            res.render('login', { error: 'Authentication failed, please check your  username and password.'} );
        }
    });
});

router.get("/signup", function (req, res) {
    if (req.session.user) {
        res.redirect("/");
    } else {
        res.render("signup");
    }
});

router.post("/signup", users.userExist, function (req, res) {
    var password = req.body.password;
    var username = req.body.username;
    users.createUser(username, password, function(err, userData){
        if(userData.user){
            req.session.regenerate(function(){
                req.session.user = userData.user;

                res.render("welcome", {
                    username: userData.user.username, 
                    multisig_address: userData.multisig_address,
                    mnemonic: userData.mnemonic
                });
            });
        }
    });
});

router.get('/logout', function (req, res) {
    req.session.destroy(function () {
        res.redirect('/');
    });
});

module.exports = router;
