const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

require("dotenv").config();

const adapter = new FileSync("db.json");
const dblow = low(adapter);

class Db {
  static getSupportUsers = () => {
    try {
      dblow.read();
      const configs = dblow.getState().configs;
      if (configs === undefined) return false;
      return configs["supportUsers"] ? configs["supportUsers"] : false;
    } catch (err) {
      return false;
    }
	};
	
  static addSupportUsers = (usersArray = []) => {
    if (!usersArray.length) return false;
    let configs;
    try {
      dblow.read();
      configs = dblow.getState().configs;
      if (configs === undefined) {
        configs = {};
        configs["supportUsers"] = [];
      }
      if (typeof configs["supportUsers"] !== "undefined") {
        configs["supportUsers"] = configs["supportUsers"].concat(usersArray);
      } else {
        configs["supportUsers"] = usersArray;
      }
      dblow.set("configs", configs).write();
      const savedSupportUsers = this.getSupportUsers();
      if (savedSupportUsers === false) return false;
      return savedSupportUsers;
    } catch (err) {
      return false;
    }
  };

  static deleteSupportUsers = (usersArray = []) => {
    if (!usersArray.length) return false;
    let configs;
    try {
      dblow.read();
      configs = dblow.getState().configs;
      if (
        configs === undefined ||
        typeof configs["supportUsers"] === undefined
      ) {
        return false;
      }
      usersArray.map(userToDelete => {
        configs["supportUsers"] = configs["supportUsers"].filter(
          supportUser => supportUser !== userToDelete,
        );
      });
      dblow.set("configs", configs).write();
      const savedSupportUsers = this.getSupportUsers();
      if (savedSupportUsers === false) return false;
      return savedSupportUsers;
    } catch (err) {
      return false;
    }
  };

  static saveConfig = config => {
    console.log("Gonna save new config: ", config);
    try {
      db.get("configs")
        .push(config)
        .write();
      console.log("New config successfully saved");
      return true;
    } catch (err) {
      console.log("Saving config error");
      return false;
    }
  };

	static getConfigs = () => {
		let configs;
		try {
			db.read();
			configs = db.getState().configs;
			if (configs === undefined) {
				db.set("configs", []).write();
				configs = [];
			}
		} catch (err) {
			console.log("Getting configs from db error: ", err);
			console.log("Reset config");
			db.set("configs", []).write();
			configs = [];
		}
		return configs;
	};

}

module.exports = Db;
