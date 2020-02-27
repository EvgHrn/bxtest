const db = require("./db");

const getSupportUsers = () => {
  try {
    db.read();
		const config = db.getState().configs;
		if (config === undefined) return false;
		const supportUsers = config["supportUsers"];
    console.log("getSupportUsers: Got supportUsers from db: ", supportUsers);
    return supportUsers;
  } catch (err) {
    console.log("getSupportUsers: Getting supportUsers from db error: ", err);
    return false;
  }
};

const addSupportUsers = (usersArray = []) => {
  console.log("addSupportUsers: Call with params: ", usersArray);
  let config;
  try {
    db.read();
    config = db.getState().configs;
    console.log("addSupportUsers: Got params from db: ", config);
    if (config === undefined) {
      config = [];
      config["supportUsers"] = [];
    }
    if(typeof config["supportUsers"] !== "undefined") {
      config["supportUsers"] = config["supportUsers"].concat(usersArray);
    } else {
      config["supportUsers"] = usersArray;
    }
    db.set("configs", config).write();
    const savedSupportUsers = getSupportUsers();
    console.log("addSupportUsers: Saved New getSupportUsers: ", savedSupportUsers);
    return savedSupportUsers;
  } catch (err) {
    console.log("addSupportUsers: Getting params from db error: ", err);
  }
  return [];
};

module.exports = getSupportUsers;
module.exports = addSupportUsers;
