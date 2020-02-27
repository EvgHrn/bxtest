const db = require("./db");

const getSupportUsers = () => {
  try {
    db.read();
		const config = db.getState().configs;
		if (config === undefined) return false;
		const supportUsers = config["supportUsers"];
    console.log("Got supportUsers from db: ", supportUsers);
    return supportUsers;
  } catch (err) {
    console.log("Getting supportUsers from db error: ", err);
    return false;
  }
};

const addSupportUsers = (usersArray) => {
  let config;
  try {
    db.read();
    config = db.getState().configs;
    console.log("Got params from db: ", config);
    if (config === undefined) {
      config = [];
      config["supportUsers"] = [];
    }
    config["supportUsers"] = config["supportUsers"].concat(usersArray);
    db.set("configs", config).write();
    console.log("Saved New getSupportUsers: ",getSupportUsers());
  } catch (err) {
    console.log("Getting params from db error: ", err);
  }
};

module.exports = getSupportUsers;
module.exports = addSupportUsers;
