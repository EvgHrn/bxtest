const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

require("dotenv").config();

const adapter = new FileSync("db.json");
const dblow = low(adapter);

class Db {
  static getSupportUsers = () => {
    try {
      dblow.read();
      const supportUsers = dblow.getState().supportUsers;
      if (supportUsers === undefined) return false;
      return supportUsers;
    } catch (err) {
      return false;
    }
	};
	
  static addSupportUser = (user) => {
    if (!user) return false;
    let supportUsers;
    try {
      dblow.read();
      supportUsers = dblow.getState().supportUsers;
      if (supportUsers === undefined) {
        supportUsers = ["1819"];
      }
      supportUsers.push(user);
      dblow.set("supportUsers", supportUsers).write();
      const savedSupportUsers = this.getSupportUsers();
      if (savedSupportUsers === false) return false;
      return savedSupportUsers;
    } catch (err) {
      return false;
    }
  };

  static deleteSupportUser = (user) => {
    if (!user) return false;
    let supportUsers;
    try {
      dblow.read();
      supportUsers = dblow.getState().supportUsers;
      if (supportUsers === undefined) {
        return false;
      }
      supportUsers = supportUsers.filter(
        supportUser => supportUser !== user,
      );
      dblow.set("supportUsers", supportUsers).write();
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
      dblow
        .get("configs")
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
			dblow.read();
      configs = dblow.getState().configs;
      console.log("dblow.getState(): ", dblow.getState());
      // console.log("dblow.getState().configs: ", dblow.getState().configs);
			if (configs === undefined) {
				dblow.set("configs", []).write();
				configs = [];
			}
		} catch (err) {
			console.log("Getting configs from db error: ", err);
			console.log("Reset config");
			dblow.set("configs", []).write();
			configs = [];
		}
		return configs;
	};

}

module.exports = Db;
