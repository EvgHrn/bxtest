var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
const b24 = require("b24");
const fetch = require("node-fetch");
var querystring = require("qs");
const bodyParser = require("body-parser");
var fs = require("fs");
const db = require("./utils/db");
const avatar = require("./utils/avatar");

require("dotenv").config();

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const supportGroup = ["1819", "1600", "3", "1480", "1588"];
// const supportGroup = ["1819"];

let config;

try {
  db.read();
  config = db.getState().configs;
  console.log("Got params from db: ", config);
  if (config === undefined) {
    db.set("configs", []).write();
    config = [];
  }
} catch (err) {
  console.log("Getting params from db error: ", err);
  console.log("Reset config");
  db.set("configs", []).write();
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

        if (
          !supportGroup.includes(req.body["data"]["PARAMS"]["FROM_USER_ID"])
        ) {
          console.log("Message from common user");
          for (let i = 0; i < supportGroup.length; i++) {
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
        } else if (
          req.body["data"]["PARAMS"]["MESSAGE"].match(/(?<=id)\d*/gm)
        ) {
          //Message from support group
          console.log("Message from support group");
          const msg = req.body["data"]["PARAMS"]["MESSAGE"];
          const toUserId = msg.match(/(?<=id)\d*/gm);
          console.log("Find id: ", toUserId[0]);
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
          for (let i = 0; i < supportGroup.length; i++) {
            if (supportGroup[i] === req.body["data"]["USER"]["ID"]) continue;
            console.log("Answer to ", supportGroup[i]);
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
          console.log(
            "Quotation error in: ",
            req.body["data"]["PARAMS"]["MESSAGE"],
          );
          result = await restCommand(
            "imbot.message.add",
            {
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
              "NAME": "Вопросы производству",
              "COLOR": "GREEN",
              "EMAIL": "evg.hrn@gmail.com",
              "PERSONAL_BIRTHDAY": "2020-02-26",
              "WORK_POSITION": "Вопросы производству",
              "PERSONAL_WWW": "http://bitrix24.com",
              "PERSONAL_GENDER": "M",
                "PERSONAL_PHOTO": avatar,
            },
          },
          req.body["auth"],
        );

        const botId = result["result"];

        result = await restCommand(
          "imbot.command.register",
          {
            BOT_ID: botId,
            COMMAND: "masssend",
            COMMON: "Y",
            HIDDEN: "N",
            EXTRANET_SUPPORT: "N",
            LANG: [
              {
                LANGUAGE_ID: "ru",
                TITLE:
                  "Рассылка подразделению. Нельзя использовать тире в сообщении и названии подразделения",
                PARAMS: "Подразделение-Сообщение",
              },
            ],
            EVENT_COMMAND_ADD: handlerBackUrl,
          },
          req.body["auth"],
        );

        const commandMassSend = result["result"];

        // save params
        config[req.body["auth"]["application_token"]] = {
          BOT_ID: botId,
          COMMAND_MASSSEND: commandMassSend,
          AUTH: req.body["auth"],
        };

        saveParams(config);

        console.log("New app config: ", config);

        // write debug log
        // writeToLog(Array($botId, $commandEcho, $commandHelp, $commandList), 'ImBot register');
        break;
      case "ONIMCOMMANDADD":
        // check the event - authorize this event or not
        if (!config[req.body["auth"]["application_token"]]) return false;

        console.log("Event ONIMCOMMANDADD with body: ", req.body);

        result = false;

        req.body["data"]["COMMAND"].forEach(async command => {
          if (command["COMMAND"] === "masssend") {
            const stringToSearch = req.body["data"]["COMMAND"][0][
              "COMMAND_PARAMS"
            ].match(/^.*(?=-)/gm)[0];
            const msg = req.body["data"]["COMMAND"][0]["COMMAND_PARAMS"].match(
              /(?<=-).*/gm,
            )[0];
            console.log("Department to search: ", stringToSearch);
            console.log("Message to mass send: ", msg);
            const users = await searchUsers(stringToSearch, req.body["auth"]);
            const usersIds = Object.keys(users);
            console.log("Users to mass send: ", users);
            for (let i = 0; i < usersIds.length; i++) {
              result = await restCommand(
                "imbot.message.add",
                {
                  // DIALOG_ID: req.body["data"]["PARAMS"]["DIALOG_ID"],
                  DIALOG_ID: usersIds[i],
                  MESSAGE: `Рассылка от ${req.body["data"]["USER"]["NAME"]}: ${msg}`,
                },
                req.body["auth"],
              );
            }
            result = await restCommand(
              "imbot.command.answer",
              {
                COMMAND_ID: command["COMMAND_ID"],
                MESSAGE_ID: command["MESSAGE_ID"],
                MESSAGE: `Ответ на команду /${command["COMMAND"]} ${stringToSearch}-${msg}`,
                ATTACH: [
                  {
                    MESSAGE: `Разослано пользователям:\n ${Object.keys(
                      users,
                    ).map(key => `${users[key].name}\n`)}`,
                  },
                ],
              },
              req.body["auth"],
            );
          } else {
            result = await restCommand(
              "imbot.command.answer",
              {
                COMMAND_ID: command["COMMAND_ID"],
                MESSAGE_ID: command["MESSAGE_ID"],
                MESSAGE: "Неизвестная команда",
                ATTACH: [
                  {
                    MESSAGE: `ответ на: /${command["COMMAND"]} ${command["COMMAND_PARAMS"]}`,
                  },
                ],
              },
              req.body["auth"],
            );
          }
        });
        break;
      default:
        console.log("Unidentified event: ", req.body.event);
        break;
    }
  } else {
    console.log("New unidentified request: ", req.body);
  }
  res.sendStatus(200);
});

/**
 * Save application configuration.
 * WARNING: this method is only created for demonstration, never store config like this
 *
 * @param $params
 * @return bool
 */
const saveParams = params => {
  console.log("Gonna save new config: ", params);
  db.get("configs")
    .push(params)
    .write();
  return true;
};

/**
 * Send rest query to Bitrix24.
 *
 * @param $method - Rest method, ex: methods
 * @param array $params - Method params, ex: Array()
 * @param array $auth - Authorize data, received from event
 * @param boolean $authRefresh - If authorize is expired, refresh token
 * @return mixed
 */
const restCommand = async (
  method,
  params = {},
  auth = {},
  authRefresh = true,
) => {
  const queryUrl = `${auth["client_endpoint"]}${method}`;
  const queryData = querystring.stringify({
    ...params,
    auth: auth["access_token"],
  });

  let result;
  try {
    const response = await fetch(`${queryUrl}/?${queryData}`);
    result = await response.json();
    console.log("restCommand response: ", result);
  } catch (err) {
    console.log("restCommand fetch error: ", err);
  }

  if (
    authRefresh &&
    result["error"] &&
    (result["error"]["expired_token"] || result["error"]["invalid_token"])
  ) {
    auth = await restAuth(auth);
    if (auth) {
      result = await restCommand(method, params, auth, false);
      console.log("restCommand response w/o auth: ", result);
    }
  }

  return result;
};

/**
 * Get new authorize data if you authorize is expire.
 *
 * @param array $auth - Authorize data, received from event
 * @return bool|mixed
 */
const restAuth = async auth => {
  if (!process.env.BITRIX_CLIENT_ID || !process.env.BITRIX_CLIENT_SECRET) {
    console.log("Error: No env vars");
    return false;
  }

  if (!auth["refresh_token"]) {
    console.log("Error: No refresh_token");
    return false;
  }

  const queryUrl = "https://oauth.bitrix.info/oauth/token/";

  const queryData = querystring.stringify({
    grant_type: "refresh_token",
    client_id: process.env.BITRIX_CLIENT_ID,
    client_secret: process.env.BITRIX_CLIENT_SECRET,
    refresh_token: auth["refresh_token"],
  });

  let result;

  try {
    const response = await fetch(`${queryUrl}?${queryData}`);
    result = await response.json();
    console.log("restAuth response: ", result);
  } catch (err) {
    console.log("Auth fetch error: ", err);
  }

  if (!result["error"]) {
    console.log("restAuth success");
    result["application_token"] = auth["application_token"];
    config[auth["application_token"]]["AUTH"] = result;
    console.log("New config: ", config);
    saveParams(config);
  } else {
    result = false;
  }
  return result;
};

const searchUsers = async (str, auth) => {
  let result;
  result = await restCommand("im.search.user.list", { FIND: str }, auth);
  return result.result;
};

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
