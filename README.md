# Simple bitcoin based web-service
============================
This is a very simple generic bitcoin web service. As it is right now it works mostly as a web-wallet. But this can be evolved into any kind of more sophisticated bitcoin-based web services. Adding a trading engine you would have a bitcoin exchange for instance.

The only external dependency is the MongoDB database, which is used to store user information.

The system works with both the livenet or the testnet. It uses a HD wallet seed to generate a parent private key. This seed is required at start, or can be generated on the flight for you.

Installation
------------

After installing and running the MongoDB database service. Just run:

```javascript
npm install
```

And then

```javascript
npm start
```
You should be asked whether you want the *testnet* or *livenet* **(use at your own risk!)**. And later if you want to run with a seed you already have or to generate a brand new randomically.

After that you're all set. If you go to [http://localhost:3000](http://localhost:3000) you'll be presented with a very simple "login" or "signup" view.


![Welcome](/public/images/welcome.png "Welcome page")
Welcome page, displaying your current balance and with the option to send coins to another address.
