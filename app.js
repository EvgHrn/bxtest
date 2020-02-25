var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const b24 = require("b24");
const fetch = require("node-fetch");
const querystring = require("querystring");
var qs = require('qs');
require("dotenv").config();

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

let config = {

};

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


//ONAPPINSTALL
app.post("/callback", async (req, res) => {

  const authObj = {
    access_token: req.body["auth[access_token]"],
    expires: req.body["auth[expires]"],
    expires_in: req.body["auth[expires_in]"],
    scope: req.body["auth[scope]"],
    domain: req.body["auth[domain]"],
    server_endpoint: req.body["auth[server_endpoint]"],
    status: req.body["auth[status]"],
    client_endpoint: req.body["auth[client_endpoint]"],
    member_id: req.body["auth[member_id]"],
    user_id: req.body["auth[user_id]"],
    refresh_token: req.body["auth[refresh_token]"],
    application_token: req.body["auth[application_token]"]
  }

  console.log("callback event: ", req.body.event);
  console.log("callback auth: ", authObj);
  const event  = req.body.event;

  if(event === "ONAPPINSTALL") {
    const handlerBackUrl = `${process.env.SERVER_HOST}:${process.env.PORT}/`;
    const result = await restCommand('imbot.register', {
      'CODE': 'Test_bot',
      'TYPE': 'B',
      'EVENT_MESSAGE_ADD': handlerBackUrl,
      'EVENT_WELCOME_MESSAGE': handlerBackUrl,
      'EVENT_BOT_DELETE': handlerBackUrl,
      'PROPERTIES': {
        'NAME': 'Test_bot',
        'COLOR': 'GREEN',
        'EMAIL': 'itsujy@mail.ru',
        'PERSONAL_BIRTHDAY': '2016-03-11',
        'WORK_POSITION': 'Test factory bot',
        'PERSONAL_WWW': 'http://bitrix24.com',
        'PERSONAL_GENDER': 'M'
      }
      }, authObj
    );
    console.log('ONAPPINSTALL response: ', result);
  }

});

//ONIMBOTMESSAGEADD
app.post("/", async (req, res) => {
  console.log("post with body: ", req.body);
  if(req.body.event) {
    if(req.body.event === 'ONIMBOTMESSAGEADD') {
      //Евгений test - 1819
      sendMessage();
    }
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
  
  console.log('restCommand with: ', { method, params, auth, authRefresh });
  const queryUrl = `${auth["client_endpoint"]}${method}`;
  const queryData = qs.stringify({
    ...params,
    auth: auth["access_token"]
  });

  const restCommandFetchUrl = `${queryUrl}/?${queryData}`;
  console.log('restCommandFetchUrl: ', restCommandFetchUrl);

  let result;

	try {
    const response = await fetch(restCommandFetchUrl);
    result = await response.json();
    console.log('restCommand response: ', result);
    return result;
  } catch(err) {
    console.log('restCommand fetch error: ', err);
    return err;
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

const sendMessage = (userTo, botId = 1816, msg) => {
  const result = restCommand('imbot.message.add', {
    'BOT_ID': botId, // Идентификатор чат-бота, от которого идет запрос, можно не указывать, если чат-бот всего один
    'DIALOG_ID': userTo, // Идентификатор диалога, это либо USER_ID пользователя, либо chatXX - где XX идентификатор чата, передается в событии ONIMBOTMESSAGEADD и ONIMJOINCHAT
    'MESSAGE': msg, // Тест сообщения
    // 'ATTACH': '', // Вложение, необязательное поле
    // 'KEYBOARD': '', // Клавиатура, необязательное поле
    // 'MENU': '', // Контекстное меню, необязательное поле 
    // 'SYSTEM': 'N', // Отображать сообщения в виде системного сообщения, необязательное поле, по умолчанию 'N'
    'URL_PREVIEW': 'Y' // Преобразовывать ссылки в rich-ссылки, необязательное поле, по умолчанию 'Y'
  }, $_REQUEST["auth"]);
  return result;
}

/**
 * Get new authorize data if you authorize is expire.
 *
 * @param array $auth - Authorize data, received from event
 * @return bool|mixed
 */
const restAuth = async (auth) => {

	if(!isset(auth['refresh_token']))
		return false;

  const queryUrl = 'https://oauth.bitrix.info/oauth/token/';

  const queryData = qs.stringify({
    'grant_type': 'refresh_token',
		'client_id': process.env.BITRIX_CLIENT_ID,
		'client_secret': process.env.BITRIX_CLIENT_SECRET,
		'refresh_token': auth['refresh_token']
  });

  // writeToLog(Array('URL' => queryUrl, 'PARAMS' => queryParams), 'ImBot request auth data');
  
  const response = await fetch(
    `${queryUrl}?${query}`,
  );
  const data = await response.json();
  console.log('Auth response: ', data);
  
    config.

	// if (!isset($result['error']))
	// {
	// 	$appsConfig = Array();
	// 	if (file_exists(__DIR__.'/config.php'))
	// 		include(__DIR__.'/config.php');

	// 	$result['application_token'] = $auth['application_token'];
	// 	$appsConfig[$auth['application_token']]['AUTH'] = $result;
	// 	saveParams($appsConfig);
	// }
	// else
	// {
	// 	$result = false;
	// }

	return $result;
};

module.exports = app;


// 'auth[access_token]': '93d2545e0044d864003dc5b4000005ea0000038f3ebe56764fd089c5b0ddd8d46ffaea',
// 'auth[expires]': '1582617235',
// 'auth[expires_in]': '3600',
// 'auth[scope]': 'imopenlines,crm,im,imbot,task,tasks_extended,placement,user,entity,pull,pull_channel,mobile,log,messageservice,lists,disk,department',
// 'auth[domain]': 'bitrix24.inari.pro',
// 'auth[server_endpoint]': 'https://oauth.bitrix.info/rest/',
// 'auth[status]': 'L',
// 'auth[client_endpoint]': 'https://bitrix24.inari.pro/rest/',
// 'auth[member_id]': '7126572dc5d37d6e261e584c932fdfed',
// 'auth[user_id]': '1514',
// 'auth[refresh_token]': '83517c5e0044d864003dc5b4000005ea00000349fb4c3769c4fbbe40fd1ec32a8d0136',
// 'auth[application_token]': 'c6e4c9018ccef1af374cc701f90fe688'