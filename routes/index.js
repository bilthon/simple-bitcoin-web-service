var express = require('express');
var router = express.Router();

/* GET home page. */
router.get("/", function (req, res) {
    if (req.session.user) {
        res.render("welcome", req.session.user);
    } else {
        res.render("welcome")
    }
});

module.exports = router;
