var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const b24 = require("b24");
const fetch = require("node-fetch");
const querystring = require("querystring");
require("dotenv").config();

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

const bitrix24 = new b24.Bitrix24({
  config: {
    mode: "api",
    host: process.env.BITRIX_HOST,
    client_id: process.env.BITRIX_CLIENT_ID,
    client_secret: process.env.BITRIX_CLIENT_SECRET,
    redirect_uri: "http://localhost:3000/callback",
  },
  methods: {
    async saveToken(data) {
      //Save token to database
      console.log("Should save token: ", data);
    },
    async retriveToken() {
      //Retrive token from database
      console.log("Should return token");
      return {
        access_token:
          "d0ef535e0044d4e8003dc5b4000005ea100e0355b16b4989c6cc02dbfdbd20d8710f63",
        refresh_token:
          "d0ef535e0044d4e8003dc5b4000005ea100e0355b16b4989c6cc02dbfdbd20d8710f63",
      };
    },
  },
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get("/auth", (req, res) => {
  const query = querystring.stringify({
    client_id: process.env.BITRIX_CLIENT_ID
  });
  res.redirect(`${process.env.BITRIX_HOST}/oauth/authorize/?${query}`);
});

// Callback service parsing the authorization token and asking for the access token
app.get("/", async (req, res) => {
  if (req.query.code) {
    try {
      console.log("callback with: ", req.query);
      const query = querystring.stringify({
        grant_type: "authorization_code",
        client_id: process.env.BITRIX_CLIENT_ID,
        client_secret: process.env.BITRIX_CLIENT_SECRET,
        code: req.query.code
      });
      const response = await fetch(
        `https://oauth.bitrix.info/oauth/token/?${query}`,
      );
      const data = await response.json();
      console.log('Token response: ', data);
      return res.json();
    } catch (err) {
      console.log(err);
      return res.status(500).json({ message: "Authentication Failed" });
    }
  } else {
    return res.json();
  }
});

app.get("/allUser", async (req, res) => {
  try {
    const result = await bitrix24.callMethod("user.get");
    console.log("allUser result: ", result);
    return res.json(result);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// app.use('/', indexRouter);
// app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
