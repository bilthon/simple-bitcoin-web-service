var express = require('express');
var router = express.Router();
var users = require('../model/users');

/* GET users listing. */
router.get('/refresh_address', function(req, res, next) {
  res.send('respond with a resource');
});

router.get("/login", function (req, res) {
    res.render("login");
});

router.post("/login", function (req, res) {
    users.authenticate(req.body.username, req.body.password, function (err, user) {
        if (!err) {
            req.session.regenerate(function () {
                req.session.user = user;
                res.redirect("/user/welcome");
            });
        } else {
            console.error('error: '+err);
            res.render("login", { error: 'Authentication failed, please check your  username and password.'} );
        }
    });
});

router.get("/welcome", function(req, res){
    console.log('session: '+JSON.stringify(req.session));
    if(req.session){
        res.render("welcome", req.session.user);
    } else {
        req.redirect("/");        
    }
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
    users.createUser(username, password, function(err, user){
        if(!err){
            req.session.regenerate(function(){
                req.session.user = user;
                // res.render("welcome", user);
                res.redirect("/user/welcome", user);
            });
        }
    });
});

router.get("/logout", function (req, res) {
    req.session.destroy(function (user) {
        res.redirect('/');
    });
});

router.post("/refresh_address", function(req, res){
    users.refreshAddress(req.session.user, function(err, user){
        // if(err) TODO: render error page 
        req.session.regenerate(function () {
            req.session.user = user;
            // res.render("welcome", user);
            res.redirect("/user/welcome");
        });
    });
});

router.post("/send", function(req, res){
    users.send(req.session.user, req.body.amount, req.body.destination_address, function(err, result){
        console.log('err: '+err+', result: '+JSON.stringify(result));
        if(!err){
            req.session.regenerate(function(){
                req.session.user = result;
                res.redirect("/user/welcome");
            });
        }else{
            res.redirect("/user/welcome");            
        }
    });
});

module.exports = router;
