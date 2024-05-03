const archive = require("../util/archive.js");

module.exports = async function (args, request) {

  const [command, name] = args;

  switch (command) {

    case "list": {
    
      return archive(["list"]);
    
    }

    case "leaderboard":
    case "config": {

      const context = archive(["get", name]);
      if (!context) return "ERR_NAME";

      if (command === "leaderboard") return context.data.leaderboard;
      return context.data.week;

    }

  }

  return "ERR_COMMAND";

};
