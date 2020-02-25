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

app.post("/callback", async (req, res) => {

  console.log("callback event: ", req.body.event);
  const event  = req.body.event;

  if(event === "ONAPPINSTALL") {
    const handlerBackUrl = `${process.env.SERVER_HOST}:${process.env.PORT}/`;
    const response = await restCommand('imbot.register', {
      'CODE': 'echobot',
      'TYPE': 'B',
      'EVENT_MESSAGE_ADD': handlerBackUrl,
      'EVENT_WELCOME_MESSAGE': handlerBackUrl,
      'EVENT_BOT_DELETE': handlerBackUrl,
      'PROPERTIES': {
        'NAME': 'Test_bot',
        'COLOR': 'GREEN',
        'EMAIL': 'it.s-ujy@mail.ru',
        'PERSONAL_BIRTHDAY': '2016-03-11',
        'WORK_POSITION': 'Test factory bot',
        'PERSONAL_WWW': 'http://bitrix24.com',
        'PERSONAL_GENDER': 'M'
      }
      }, req.body.auth
    );
    result = await response.json();
    console.log('ONAPPINSTALL response: ', result);
  }

});

// Callback service parsing the authorization token and asking for the access token
app.get("/", async (req, res) => {
  try {
    console.log("get with: ", req.query);
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
});

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

const restCommand = async (method, params = {}, auth = [], authRefresh = true) => {
  const queryUrl = `${auth["client_endpoint"]}${method}`;
  const queryData = querystring.stringify({
    ...params,
    auth: auth["access_token"]
  });

  let result;

	try {
    const response = await fetch(
      `${queryUrl}${queryData}`,
    );
    result = await response.json();
    console.log('restCommand response: ', result);
  } catch(err) {
    console.log('restCommand fetch error: ', err);
  }

	// if (authRefresh && isset($result['error']) && in_array($result['error'], array('expired_token', 'invalid_token')))
	// {
	// 	$auth = restAuth($auth);
	// 	if ($auth)
	// 	{
	// 		$result = restCommand($method, $params, $auth, false);
	// 	}
	// }
	// return $result;
}

module.exports = app;
