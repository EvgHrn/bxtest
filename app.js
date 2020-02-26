

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const b24 = require("b24");
const fetch = require("node-fetch");
var querystring = require('qs');
const bodyParser = require('body-parser');
var fs = require('fs');
const db = require("./utils/db");

require("dotenv").config();

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// const supportGroup = ["1819", "1600", "3", "1480", "1588"];
const supportGroup = ["1819"];

let config;

try {
    db.read();
    config = db.getState().configs;
  console.log("Got params from db: ", config);
  if (config === undefined) {
    db.set('configs', [])
        .write()
    config = [];
  } 
} catch (err) {
  console.log("Getting params from db error: ", err);
  console.log("Reset config");
  db.set('configs', [])
    .write()
  config = [];
}

app.use(async (req, res, next) => {

  if (req.body.event) {
    let result;
    switch (req.body.event) {
      case "ONIMBOTMESSAGEADD":
        console.log("ONIMBOTMESSAGEADD event with body: ", req.body);
        // check the event - authorize this event or not
        if (!config[req.body["auth"]["application_token"]]) return false;

        if(!supportGroup.includes( req.body["data"]["PARAMS"]["FROM_USER_ID"] )) {
            console.log('Message from common user');
            for(let i = 0; i < supportGroup.length; i++) {
                result = await restCommand(
                    "imbot.message.add",
                    {
                      // DIALOG_ID: req.body["data"]["PARAMS"]["DIALOG_ID"],
                      DIALOG_ID: supportGroup[i],
                      MESSAGE: `${req.body["data"]["USER"]["NAME"]} id${req.body["data"]["USER"]["ID"]}: ${req.body["data"]["PARAMS"]["MESSAGE"]}`,
                    },
                    req.body["auth"],
                );
            }
        } else if(req.body["data"]["PARAMS"]["MESSAGE"].match(/(?<=id)\d*/gm)) {
            //Message from support group
            console.log('Message from support group');
            const msg = req.body["data"]["PARAMS"]["MESSAGE"];
            const toUserId = msg.match(/(?<=id)\d*/gm);
            console.log('Find id: ', toUserId[0]);
            //Answer to user
            result = await restCommand(
                "imbot.message.add",
                {
                  // DIALOG_ID: req.body["data"]["PARAMS"]["DIALOG_ID"],
                  DIALOG_ID: toUserId[0],
                  MESSAGE: `${req.body["data"]["USER"]["NAME"]} id${req.body["data"]["USER"]["ID"]}: ${req.body["data"]["PARAMS"]["MESSAGE"]}`,
                },
                req.body["auth"],
            );
            //Answer to other support
            for(let i = 0; i < supportGroup.length; i++) {
                if(supportGroup[i] === req.body["data"]["USER"]["ID"]) continue;
                console.log('Answer to ', supportGroup[i]);
                result = await restCommand(
                    "imbot.message.add",
                    {
                      // DIALOG_ID: req.body["data"]["PARAMS"]["DIALOG_ID"],
                      DIALOG_ID: supportGroup[i],
                      MESSAGE: `${req.body["data"]["USER"]["NAME"]} id${req.body["data"]["USER"]["ID"]}: ${req.body["data"]["PARAMS"]["MESSAGE"]}`,
                    },
                    req.body["auth"],
                );
            }
        } else {
            //no Quotation error
            console.log('Quotation error in: ', req.body["data"]["PARAMS"]["MESSAGE"]);
            result = await restCommand(
                "imbot.message.add",
                {
                  // DIALOG_ID: req.body["data"]["PARAMS"]["DIALOG_ID"],
                  DIALOG_ID: req.body["data"]["PARAMS"]["FROM_USER_ID"],
                  MESSAGE: `Ошибка цитаты`,
                },
                req.body["auth"],
            );
        }

        // write debug log
        // writeToLog($result, 'ImBot Event message add');
        break;
      case "ONAPPINSTALL":
        console.log("ONAPPINSTALL event with body: ", req.body);
        handlerBackUrl = process.env.SERVER_HOST;
        // register new bot
        result = await restCommand(
          "imbot.register",
          {
            CODE: "Вопросы производству",
            TYPE: "H",
            EVENT_MESSAGE_ADD: handlerBackUrl,
            EVENT_WELCOME_MESSAGE: handlerBackUrl,
            EVENT_BOT_DELETE: handlerBackUrl,
            // 'OPENLINE': 'Y', // this flag only for Open Channel mode http://bitrix24.ru/~bot-itr
            PROPERTIES: {
              NAME: "Вопросы производству",
              COLOR: "GREEN",
              EMAIL: "evg.hrn@gmail.com",
              PERSONAL_BIRTHDAY: "2020-02-26",
              WORK_POSITION: "Вопросы производству",
              PERSONAL_WWW: "http://bitrix24.com",
              PERSONAL_GENDER: "M",
            //   PERSONAL_PHOTO: base64_encode('./public/avatar.png'),
            },
          },
          req.body["auth"],
        );

        const botId = result['result'];

        result = await restCommand('imbot.command.register', {
            'BOT_ID': botId,
            'COMMAND': 'masssend',
            'COMMON': 'Y',
            'HIDDEN': 'N',
            'EXTRANET_SUPPORT': 'N',
            'LANG': [
                {
                    'LANGUAGE_ID': 'ru',
                    'TITLE': 'Рассылка подразделению',
                    'PARAMS': 'Подразделение-Сообщение'
                },
            ],
            'EVENT_COMMAND_ADD': handlerBackUrl,
        }, req.body["auth"]);

        const commandMassSend = result['result'];

        // save params
        config[req.body["auth"]["application_token"]] = {
          "BOT_ID": botId,
          "COMMAND_MASSSEND": commandMassSend,
          "AUTH": req.body["auth"]
        };

        saveParams(config);

        console.log("New app config: ", config);

        // write debug log
        // writeToLog(Array($botId, $commandEcho, $commandHelp, $commandList), 'ImBot register');
        break;
        case 'ONIMCOMMANDADD':
            // check the event - authorize this event or not
            if (!config[req.body['auth']['application_token']])
                return false;

            console.log('Event ONIMCOMMANDADD with body: ', req.body);

            result = false;

            req.body['data']['COMMAND'].forEach(async (command) => {
                if (command['COMMAND'] === 'masssend') {
                    const stringToSearch = req.body['data']['COMMAND'][0]['COMMAND_PARAMS'].match(/^.*(?=-)/gm)[0];
                    const msg = req.body['data']['COMMAND'][0]['COMMAND_PARAMS'].match(/(?<=-).*/gm)[0];
                    console.log('Department to search: ', stringToSearch);
                    console.log('Message to mass send: ', msg);
                    const users = await searchUsers(stringToSearch, req.body["auth"]);
                    const usersIds = Object.keys(users);
                    console.log('Users to mass send: ', users);
                    // for(let i = 0; i < usersIds.length; i++) {
                    //     result = await restCommand(
                    //         "imbot.message.add",
                    //         {
                    //           // DIALOG_ID: req.body["data"]["PARAMS"]["DIALOG_ID"],
                    //           DIALOG_ID: usersIds[i],
                    //           MESSAGE: `Рассылка от ${req.body['data']["PARAMS"]["DIALOG_ID"]}: ${msg}`
                    //         },
                    //         req.body["auth"],
                    //     );
                    // } 
                    result = await restCommand('imbot.command.answer', {
                        "COMMAND_ID": command['COMMAND_ID'],
                        "MESSAGE_ID": command['MESSAGE_ID'],
                        "MESSAGE": `Ответ на команду /${command['COMMAND']} ${stringToSearch}-${msg}`,
                        "ATTACH": [
                            { "MESSAGE": `Разослано пользователям:\n ${Object.keys(users).map(key => `${users[key].name}\n`)}` }
                        ]
                        }, req.body["auth"]
                    );
                } else {
                    result = await restCommand('imbot.command.answer', {
                        "COMMAND_ID": command['COMMAND_ID'],
                        "MESSAGE_ID": command['MESSAGE_ID'],
                        "MESSAGE": "Неизвестная команда",
                        "ATTACH": [
                            { "MESSAGE": `ответ на: /${command['COMMAND']} ${command['COMMAND_PARAMS']}` }
                        ]
                        }, req.body["auth"]
                    );
                }
            });

            // write debug log
            // writeToLog($result, 'ImBot Event message add');
            break;
        default:
            console.log("New unidentified request: ", req.body);
            break;
      }
    }
    // next(createError(404));
});

// receive event "new message for bot"
// if ($_REQUEST['event'] == 'ONIMBOTMESSAGEADD')
// {
	
// }
// // receive event "new command for bot"
// if ($_REQUEST['event'] == 'ONIMCOMMANDADD')
// {
// 	// check the event - authorize this event or not
// 	if (!isset($appsConfig[$_REQUEST['auth']['application_token']]))
// 		return false;

// 	// response time
// 	$latency = (time()-$_REQUEST['ts']);
// 	$latency = $latency > 60? (round($latency/60)).'m': $latency."s";

// 	$result = false;
// 	foreach ($_REQUEST['data']['COMMAND'] as $command)
// 	{
// 		if ($command['COMMAND'] == 'echo')
// 		{
// 			$result = restCommand('imbot.command.answer', Array(
// 				"COMMAND_ID" => $command['COMMAND_ID'],
// 				"MESSAGE_ID" => $command['MESSAGE_ID'],
// 				"MESSAGE" => "Answer command",
// 				"ATTACH" => Array(
// 					Array("MESSAGE" => "reply: /".$command['COMMAND'].' '.$command['COMMAND_PARAMS']),
// 					Array("MESSAGE" => "latency: ".$latency),
// 				)
// 			), $_REQUEST["auth"]);
// 		}
// 		else if ($command['COMMAND'] == 'echoList')
// 		{
// 			$initList = false;
// 			if (!$command['COMMAND_PARAMS'])
// 			{
// 				$initList = true;
// 				$command['COMMAND_PARAMS'] = 1;
// 			}

// 			$attach = Array();
// 			if ($command['COMMAND_PARAMS'] == 1)
// 			{
// 				$attach[] = Array("GRID" => Array(
// 					Array("VALUE" => "RED","DISPLAY" => "LINE", "WIDTH" => 100),
// 					Array("VALUE" => "#df532d","COLOR" => "#df532d","DISPLAY" => "LINE"),
// 				));
// 				$attach[] = Array("GRID" => Array(
// 					Array("VALUE" => "GRAPHITE", "DISPLAY" => "LINE", "WIDTH" => 100),
// 					Array("VALUE" => "#3a403e", "COLOR" => "#3a403e", "DISPLAY" => "LINE"),
// 				));
// 			}
// 			else if ($command['COMMAND_PARAMS'] == 2)
// 			{
// 				$attach[] = Array("GRID" => Array(
// 					Array("VALUE" => "MINT","DISPLAY" => "LINE", "WIDTH" => 100),
// 					Array("VALUE" => "#4ba984","COLOR" => "#4ba984","DISPLAY" => "LINE"),
// 				));
// 				$attach[] = Array("GRID" => Array(
// 					Array("VALUE" => "LIGHT BLUE", "DISPLAY" => "LINE", "WIDTH" => 100),
// 					Array("VALUE" => "#6fc8e5", "COLOR" => "#6fc8e5", "DISPLAY" => "LINE"),
// 				));
// 			}
// 			else if ($command['COMMAND_PARAMS'] == 3)
// 			{
// 				$attach[] = Array("GRID" => Array(
// 					Array("VALUE" => "PURPLE","DISPLAY" => "LINE", "WIDTH" => 100),
// 					Array("VALUE" => "#8474c8","COLOR" => "#8474c8","DISPLAY" => "LINE"),
// 				));
// 				$attach[] = Array("GRID" => Array(
// 					Array("VALUE" => "AQUA", "DISPLAY" => "LINE", "WIDTH" => 100),
// 					Array("VALUE" => "#1eb4aa", "COLOR" => "#1eb4aa", "DISPLAY" => "LINE"),
// 				));
// 			}
// 			else if ($command['COMMAND_PARAMS'] == 4)
// 			{
// 				$attach[] = Array("GRID" => Array(
// 					Array("VALUE" => "PINK","DISPLAY" => "LINE", "WIDTH" => 100),
// 					Array("VALUE" => "#e98fa6","COLOR" => "#e98fa6","DISPLAY" => "LINE"),
// 				));
// 				$attach[] = Array("GRID" => Array(
// 					Array("VALUE" => "LIME", "DISPLAY" => "LINE", "WIDTH" => 100),
// 					Array("VALUE" => "#85cb7b", "COLOR" => "#85cb7b", "DISPLAY" => "LINE"),
// 				));
// 			}
// 			else if ($command['COMMAND_PARAMS'] == 5)
// 			{
// 				$attach[] = Array("GRID" => Array(
// 					Array("VALUE" => "AZURE","DISPLAY" => "LINE", "WIDTH" => 100),
// 					Array("VALUE" => "#29619b","COLOR" => "#29619b","DISPLAY" => "LINE"),
// 				));
// 				$attach[] = Array("GRID" => Array(
// 					Array("VALUE" => "ORANGE", "DISPLAY" => "LINE", "WIDTH" => 100),
// 					Array("VALUE" => "#e8a441", "COLOR" => "#e8a441", "DISPLAY" => "LINE"),
// 				));
// 			}
// 			$keyboard = Array(
// 				Array("TEXT" => $command['COMMAND_PARAMS'] == 1? "· 1 ·": "1", "COMMAND" => "echoList", "COMMAND_PARAMS" => "1", "DISPLAY" => "LINE", "BLOCK" => "Y"),
// 				Array("TEXT" => $command['COMMAND_PARAMS'] == 2? "· 2 ·": "2", "COMMAND" => "echoList", "COMMAND_PARAMS" => "2", "DISPLAY" => "LINE", "BLOCK" => "Y"),
// 				Array("TEXT" => $command['COMMAND_PARAMS'] == 3? "· 3 ·": "3", "COMMAND" => "echoList", "COMMAND_PARAMS" => "3", "DISPLAY" => "LINE", "BLOCK" => "Y"),
// 				Array("TEXT" => $command['COMMAND_PARAMS'] == 4? "· 4 ·": "4", "COMMAND" => "echoList", "COMMAND_PARAMS" => "4", "DISPLAY" => "LINE", "BLOCK" => "Y"),
// 				Array("TEXT" => $command['COMMAND_PARAMS'] == 5? "· 5 ·": "5", "COMMAND" => "echoList", "COMMAND_PARAMS" => "5", "DISPLAY" => "LINE", "BLOCK" => "Y"),
// 			);

// 			if (!$initList && $command['COMMAND_CONTEXT'] == 'KEYBOARD')
// 			{
// 				$result = restCommand('imbot.message.update', Array(
// 					"BOT_ID" => $command['BOT_ID'],
// 					"MESSAGE_ID" => $command['MESSAGE_ID'],
// 					"ATTACH" => $attach,
// 					"KEYBOARD" => $keyboard
// 				), $_REQUEST["auth"]);
// 			}
// 			else
// 			{
// 				$result = restCommand('imbot.command.answer', Array(
// 					"COMMAND_ID" => $command['COMMAND_ID'],
// 					"MESSAGE_ID" => $command['MESSAGE_ID'],
// 					"MESSAGE" => "List of colors",
// 					"ATTACH" => $attach,
// 					"KEYBOARD" => $keyboard
// 				), $_REQUEST["auth"]);
// 			}
// 		}
// 		else if ($command['COMMAND'] == 'help')
// 		{
// 			$keyboard = Array(
// 				Array(
// 					"TEXT" => "Bitrix24",
// 					'LINK' => "http://bitrix24.com",
// 					"BG_COLOR" => "#29619b",
// 					"TEXT_COLOR" => "#fff",
// 					"DISPLAY" => "LINE",
// 				),
// 				Array(
// 					"TEXT" => "BitBucket",
// 					"LINK" => "https://bitbucket.org/Bitrix24com/rest-bot-echotest",
// 					"BG_COLOR" => "#2a4c7c",
// 					"TEXT_COLOR" => "#fff",
// 					"DISPLAY" => "LINE",
// 				),
// 				Array("TYPE" => "NEWLINE"),
// 				Array("TEXT" => "Echo", "COMMAND" => "echo", "COMMAND_PARAMS" => "test from keyboard", "DISPLAY" => "LINE"),
// 				Array("TEXT" => "List", "COMMAND" => "echoList", "DISPLAY" => "LINE"),
// 				Array("TEXT" => "Help", "COMMAND" => "help", "DISPLAY" => "LINE"),
// 			);

// 			$result = restCommand('imbot.command.answer', Array(
// 				"COMMAND_ID" => $command['COMMAND_ID'],
// 				"MESSAGE_ID" => $command['MESSAGE_ID'],
// 				"MESSAGE" => "Hello! My name is EchoBot :)[br] I designed to answer your questions!",
// 				"KEYBOARD" => $keyboard
// 			), $_REQUEST["auth"]);
// 		}
// 	}

// 	// write debug log
// 	writeToLog($result, 'ImBot Event message add');
// }
// // receive event "open private dialog with bot" or "join bot to group chat"
// else if ($_REQUEST['event'] == 'ONIMBOTJOINCHAT')
// {
// 	// check the event - authorize this event or not
// 	if (!isset($appsConfig[$_REQUEST['auth']['application_token']]))
// 		return false;

// 	if ($_REQUEST['data']['PARAMS']['CHAT_ENTITY_TYPE'] == 'LINES')
// 	{
// 		$message =
// 			'ITR Menu:[br]'.
// 			'[send=1]1. find out more about me[/send][br]'.
// 			'[send=0]0. wait for operator response[/send]';

// 		// send help message how to use chat-bot. For private chat and for group chat need send different instructions.
// 		$result = restCommand('imbot.message.add', Array(
// 			"DIALOG_ID" => $_REQUEST['data']['PARAMS']['DIALOG_ID'],
// 			"MESSAGE" => $message,
// 		), $_REQUEST["auth"]);
// 	}
// 	else
// 	{
// 		// send help message how to use chat-bot. For private chat and for group chat need send different instructions.
// 		$result = restCommand('imbot.message.add', Array(
// 			"DIALOG_ID" => $_REQUEST['data']['PARAMS']['DIALOG_ID'],
// 			"MESSAGE" => "Welcome message from bot.",
// 			"ATTACH" => Array(
// 				Array("MESSAGE" => ($_REQUEST['data']['PARAMS']['CHAT_TYPE'] == 'P'? 'Private instructions': 'Chat instructions')),
// 				Array("MESSAGE" => ($_REQUEST['data']['PARAMS']['CHAT_TYPE'] == 'P'? '[send=send message]Click for send[/send] or [put=something...]write something[/put]': "[send=send message]click for send[/send] or [put=put message to textarea]click for put[/put]")),
// 			),
// 			"KEYBOARD" => Array(
// 				Array("TEXT" => "Help", "COMMAND" => "help"),
// 			)
// 		), $_REQUEST["auth"]);
// 	}


// 	// write debug log
// 	writeToLog($result, 'ImBot Event join chat');
// }
// // receive event "delete chat-bot"
// else if ($_REQUEST['event'] == 'ONIMBOTDELETE')
// {
// 	// check the event - authorize this event or not
// 	if (!isset($appsConfig[$_REQUEST['auth']['application_token']]))
// 		return false;

// 	// unset application variables
// 	unset($appsConfig[$_REQUEST['auth']['application_token']]);

// 	// save params
// 	saveParams($appsConfig);

// 	// write debug log
// 	writeToLog($_REQUEST['event'], 'ImBot unregister');
// }
// // execute custom action
// else if ($_REQUEST['event'] == 'PUBLISH')
// {
//     // This event is a CUSTOM event and is not sent from platform Bitrix24
// 	// Example: https://example.com/bot.php?event=PUBLISH&application_token=XXX&PARAMS[DIALOG_ID]=1&PARAMS[MESSAGE]=Hello!
// 	// example.com - change to you domain name with bot script
// 	// XXX - change to you application token from config.php

// 	// check the event - authorize this event or not
// 	if (!isset($appsConfig[$_REQUEST['application_token']]))
// 		return false;

// 	// send answer message
// 	$result = restCommand('imbot.message.add', $_REQUEST['PARAMS'], $appsConfig[$_REQUEST['application_token']]['AUTH']);

// 	// write debug log
// 	writeToLog($result, 'ImBot Event message add');

// 	echo 'Method executed';
// }
// // receive event "Application install"
// else if ($_REQUEST['event'] == 'ONAPPINSTALL')
// {
// 	// handler for events
// 	const handlerBackUrl = SERVER_HOST;

// 	// If your application supports different localizations
// 	// use $_REQUEST['data']['LANGUAGE_ID'] to load correct localization

// 	// register new bot
// 	$result = restCommand('imbot.register', Array(
// 		'CODE' => 'echobot',
// 		'TYPE' => 'B',
// 		'EVENT_MESSAGE_ADD' => $handlerBackUrl,
// 		'EVENT_WELCOME_MESSAGE' => $handlerBackUrl,
// 		'EVENT_BOT_DELETE' => $handlerBackUrl,
// 		'OPENLINE' => 'Y', // this flag only for Open Channel mode http://bitrix24.ru/~bot-itr
// 		'PROPERTIES' => Array(
// 			'NAME' => 'EchoBot '.(count($appsConfig)+1),
// 			'COLOR' => 'GREEN',
// 			'EMAIL' => 'test@test.ru',
// 			'PERSONAL_BIRTHDAY' => '2016-03-11',
// 			'WORK_POSITION' => 'My first echo bot',
// 			'PERSONAL_WWW' => 'http://bitrix24.com',
// 			'PERSONAL_GENDER' => 'M',
// 			'PERSONAL_PHOTO' => base64_encode(file_get_contents(__DIR__.'/avatar.png')),
// 		)
// 	), $_REQUEST["auth"]);
// 	$botId = $result['result'];

// 	$result = restCommand('imbot.command.register', Array(
// 		'BOT_ID' => $botId,
// 		'COMMAND' => 'echo',
// 		'COMMON' => 'Y',
// 		'HIDDEN' => 'N',
// 		'EXTRANET_SUPPORT' => 'N',
// 		'LANG' => Array(
// 			Array('LANGUAGE_ID' => 'en', 'TITLE' => 'Get echo message', 'PARAMS' => 'some text'),
// 		),
// 		'EVENT_COMMAND_ADD' => $handlerBackUrl,
// 	), $_REQUEST["auth"]);
// 	$commandEcho = $result['result'];

// 	$result = restCommand('imbot.command.register', Array(
// 		'BOT_ID' => $botId,
// 		'COMMAND' => 'echoList',
// 		'COMMON' => 'N',
// 		'HIDDEN' => 'N',
// 		'EXTRANET_SUPPORT' => 'N',
// 		'LANG' => Array(
// 			Array('LANGUAGE_ID' => 'en', 'TITLE' => 'Get list of colors', 'PARAMS' => ''),
// 		),
// 		'EVENT_COMMAND_ADD' => $handlerBackUrl,
// 	), $_REQUEST["auth"]);
// 	$commandList = $result['result'];

// 	$result = restCommand('imbot.command.register', Array(
// 		'BOT_ID' => $botId,
// 		'COMMAND' => 'help',
// 		'COMMON' => 'N',
// 		'HIDDEN' => 'N',
// 		'EXTRANET_SUPPORT' => 'N',
// 		'LANG' => Array(
// 			Array('LANGUAGE_ID' => 'en', 'TITLE' => 'Get help message', 'PARAMS' => 'some text'),
// 		),
// 		'EVENT_COMMAND_ADD' => $handlerBackUrl,
// 	), $_REQUEST["auth"]);
// 	$commandHelp = $result['result'];

// 	$result = restCommand('event.bind', Array(
// 		'EVENT' => 'OnAppUpdate',
// 		'HANDLER' => $handlerBackUrl
// 	), $_REQUEST["auth"]);

// 	// save params
// 	$appsConfig[$_REQUEST['auth']['application_token']] = Array(
// 		'BOT_ID' => $botId,
// 		'COMMAND_ECHO' => $commandEcho,
// 		'COMMAND_HELP' => $commandHelp,
// 		'COMMAND_LIST' => $commandList,
// 		'LANGUAGE_ID' => $_REQUEST['data']['LANGUAGE_ID'],
// 		'AUTH' => $_REQUEST['auth'],
// 	);
// 	saveParams($appsConfig);

// 	// write debug log
// 	writeToLog(Array($botId, $commandEcho, $commandHelp, $commandList), 'ImBot register');
// }
// // receive event "Application install"
// else if ($_REQUEST['event'] == 'ONAPPUPDATE')
// {
// 	// check the event - authorize this event or not
// 	if (!isset($appsConfig[$_REQUEST['auth']['application_token']]))
// 		return false;

// 	if ($_REQUEST['data']['VERSION'] == 2)
// 	{
// 		// Some logic in update event for VERSION 2
// 		// You can execute any method RestAPI, BotAPI or ChatAPI, for example delete or add a new command to the bot
// 		/*
// 		$result = restCommand('...', Array(
// 			'...' => '...',
// 		), $_REQUEST["auth"]);
// 		*/

// 		/*
// 		For example delete "Echo" command:

// 		$result = restCommand('imbot.command.unregister', Array(
// 			'COMMAND_ID' => $appsConfig[$_REQUEST['auth']['application_token']]['COMMAND_ECHO'],
// 		), $_REQUEST["auth"]);
// 		*/
// 	}
// 	else
// 	{
// 		// send answer message
// 		$result = restCommand('app.info', array(), $_REQUEST["auth"]);
// 	}

// 	// write debug log
// 	writeToLog($result, 'ImBot update event');
// }

/**
 * Save application configuration.
 * WARNING: this method is only created for demonstration, never store config like this
 *
 * @param $params
 * @return bool
 */
const saveParams = (params) => {
    console.log("Gonna save new config: ", params);
    db.get('configs')
        .push(params)
        .write()
    // console.log("Saved configs: ", db.getState().configs);
    return true;
}

/**
 * Send rest query to Bitrix24.
 *
 * @param $method - Rest method, ex: methods
 * @param array $params - Method params, ex: Array()
 * @param array $auth - Authorize data, received from event
 * @param boolean $authRefresh - If authorize is expired, refresh token
 * @return mixed
 */
const restCommand = async (method, params ={}, auth = {}, authRefresh = true) => {
    const queryUrl = `${auth["client_endpoint"]}${method}`;
    const queryData = querystring.stringify({
      ...params,
      auth: auth["access_token"]
    });
	// writeToLog(Array('URL' => $queryUrl, 'PARAMS' => array_merge($params, array("auth" => $auth["access_token"]))), 'ImBot send data');

    let result;
    try{
      const response = await fetch(`${queryUrl}/?${queryData}`);
      result = await response.json();
      console.log('restCommand response: ', result);
    } catch(err) {
      console.log('restCommand fetch error: ', err);
    }

	if (authRefresh && result['error'] && (result['error']['expired_token'] || result['error']['invalid_token'] )) {
		auth = await restAuth(auth);
		if (auth) {
      result = await restCommand(method, params, auth, false);
      console.log('restCommand response w/o auth: ', result);
		}
	}

	return result;
}

/**
 * Get new authorize data if you authorize is expire.
 *
 * @param array $auth - Authorize data, received from event
 * @return bool|mixed
 */
const restAuth = async (auth) => {
  if (!process.env.BITRIX_CLIENT_ID || !process.env.BITRIX_CLIENT_SECRET) {
    console.log('Error: No env vars');
    return false;
  }

  if (!auth['refresh_token']) {
    console.log("Error: No refresh_token");
    return false;
  }

  const queryUrl = 'https://oauth.bitrix.info/oauth/token/';
  
  const queryData = querystring.stringify({
    'grant_type': 'refresh_token',
    'client_id': process.env.BITRIX_CLIENT_ID,
    'client_secret': process.env.BITRIX_CLIENT_SECRET,
    'refresh_token': auth['refresh_token'],
  });

  // writeToLog(Array('URL' => $queryUrl, 'PARAMS' => $queryParams), 'ImBot request auth data');

  let result;

  try{
    const response = await fetch(`${queryUrl}?${queryData}`);
    result = await response.json();
    console.log('restAuth response: ', result);
  } catch(err) {
    console.log('Auth fetch error: ', err);
  }

  if (!result['error']) {
    console.log("restAuth success");
		result["application_token"] = auth['application_token'];
    config[auth['application_token']]['AUTH'] = result;
    console.log('New config: ', config);
		saveParams(config);
	} else {
		result = false;
	}
	return result;
}

const searchUsers = async (str, auth) => {
    let result;
    result = await restCommand('im.search.user.list', { 'FIND': str }, auth);
    return result.result;
}


/**
 * Write data to log file. (by default disabled)
 * WARNING: this method is only created for demonstration, never store log file in public folder
 *
 * @param mixed $data
 * @param string $title
 * @return bool
 */
// function writeToLog($data, $title = '')
// {
// 	if (!DEBUG_FILE_NAME)
// 		return false;

// 	$log = "\n------------------------\n";
// 	$log .= date("Y.m.d G:i:s")."\n";
// 	$log .= (strlen($title) > 0 ? $title : 'DEBUG')."\n";
// 	$log .= print_r($data, 1);
// 	$log .= "\n------------------------\n";

// 	file_put_contents(__DIR__."/".DEBUG_FILE_NAME, $log, FILE_APPEND);

// 	return true;
// }

module.exports = app;


//  body:  {
//   event: 'ONIMBOTMESSAGEADD',
//   data: {
//     BOT: { '1823': [Object] },
//     PARAMS: {
//       FROM_USER_ID: '1514',
//       TO_USER_ID: '1823',
//       MESSAGE: 'd',
//       MESSAGE_TYPE: 'P',
//       SKIP_COMMAND: 'N',
//       SKIP_CONNECTOR: 'N',
//       IMPORTANT_CONNECTOR: 'N',
//       SILENT_CONNECTOR: 'N',
//       AUTHOR_ID: '1514',
//       CHAT_ID: '3295',
//       COMMAND_CONTEXT: 'TEXTAREA',
//       DIALOG_ID: '1514',
//       MESSAGE_ID: '120044',
//       CHAT_TYPE: 'P',
//       LANGUAGE: 'ru'
//     },
//     USER: {
//       ID: '1514',
//       NAME: 'Евгений Хайдаршин',
//       FIRST_NAME: 'Евгений',
//       LAST_NAME: 'Хайдаршин',
//       WORK_POSITION: '',
//       GENDER: 'M',
//       IS_BOT: 'N',
//       IS_CONNECTOR: 'N',
//       IS_NETWORK: 'N',
//       IS_EXTRANET: 'N'
//     }
//   },
//   ts: '1582651907',
//   auth: {
//     access_token: '1368555e0044d864003dc5b4000005ea0000039e16fdb8f7ae622e680bcc4651361662',
//     expires: '1582655507',
//     expires_in: '3600',
//     scope: 'imopenlines,crm,im,imbot,task,tasks_extended,placement,user,entity,pull,pull_channel,mobile,log,messageservice,lists,disk,department',
//     domain: 'bitrix24.inari.pro',
//     server_endpoint: 'https://oauth.bitrix.info/rest/',
//     status: 'L',
//     client_endpoint: 'https://bitrix24.inari.pro/rest/',
//     member_id: '7126572dc5d37d6e261e584c932fdfed',
//     user_id: '1514',
//     refresh_token: '03e77c5e0044d864003dc5b4000005ea00000380fa1baaafefa56d45625b7f97e79973',
//     application_token: 'c6e4c9018ccef1af374cc701f90fe688'
//   }
// }

// MESSAGE: '------------------------------------------------------\n' +
//         'Test factory support [вчера, 21:42]\n' +
//         'Сообщение от Евгений Хайдаршин: dfdfggd\n' +
//         '------------------------------------------------------\n' +
//         'С цитатой',



// --------------------------------------------------------------------------------------------------------------------------------------
// [COMMAND] => Array // Массив команд, которые были вызваны пользователем
// (
//     [14] => Array 
//     (
//       [AUTH] => Array // Параметры для авторизации под чат-ботом для выполнения действий
//       (
//          [domain] => b24.hazz
//          [member_id] => d41d8cd98f00b204e9800998ecf8427e
//          [application_token] => 8006ddd764e69deb28af0c768b10ed65
//       )
//       [BOT_ID] => 62 // Идентификатор чат-бота
//       [BOT_CODE] => echobot // Код чат-бота
//       [COMMAND] => echo // Вызванная команда
//       [COMMAND_ID] => 14 // Идентификатор команды
//       [COMMAND_PARAMS] => test // Параметры, с которыми была вызвана команда
//       [COMMAND_CONTEXT] => TEXTAREA // Контекст выполнения команды. TEXTAREA, если команда введена руками, или KEYBOARD, если нажал на кнопку в клавиатуре
//       [MESSAGE_ID] => 1221 // Идентификатор сообщения, на которое необходимо ответить
//     )
// )
// [PARAMS] => Array // Массив данных сообщения
// (
//     [DIALOG_ID] => 1    // Идентифкатор диалога
//     [CHAT_TYPE] => P    // Тип сообщения и чата, может быть P (чат один-на-один), C (с ограниченным количеством участников), O (публичный чат)
//     [MESSAGE_ID] => 1221 // Идентификатор сообщения
//     [MESSAGE] => /echo test // Сообщение
//     [MESSAGE_ORIGINAL] => /echo test // Оригинальное сообщение с BB-кодом бота (параметр доступен только в групповых чатах)
//     [FROM_USER_ID] => 1 // Идентификатор пользователя отправившего сообщение
//     [TO_USER_ID] => 2 // Идентификатор другого пользователя (параметр доступен только в чатах один-на-один)
//     [TO_CHAT_ID] => 6   // Идентификатор чата (параметр доступен только в групповых чатах)
//     [LANGUAGE] => ru    // Идентификатор языка портала по умолчанию
// )
// [USER] => Array // Массив данных автора сообщения, может быть пустым, если ID = 0
// (
//     [ID] => 1 // Идентификатор пользователя
//     [NAME] => Евгений Шеленков // Имя и фамилия пользователя
//     [FIRST_NAME] => Евгений // Имя пользователя
//     [LAST_NAME] => Шеленков // Фамилия пользователя
//     [WORK_POSITION] => // Занимаемая должность
//     [GENDER] => M // Пол, может быть либо M (мужской), либо F (женский)
// )