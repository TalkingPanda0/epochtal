// This is to skip waiting for file I/O everywhere else later on.
global.epochtal = { file: {}, data: {}, name: "epochtal" };
epochtal.file = {
  leaderboard: Bun.file(`${__dirname}/pages/leaderboard.json`),
  users: Bun.file(`${__dirname}/pages/users.json`),
  week: Bun.file(`${__dirname}/pages/week.json`),
  log: `${__dirname}/pages/week.log`,
  portal2: `${__dirname}/defaults/portal2`,
  demos: `${__dirname}/demos`
};
epochtal.data = {
  leaderboard: await epochtal.file.leaderboard.json(),
  users: await epochtal.file.users.json(),
  week: await epochtal.file.week.json()
};

const Discord = require("discord.js");
const keys = require("../keys.js");

// We don't want to set up the client more than once
global.discordClient = new Discord.Client({
  partials: ["CHANNEL"],
  intents: 1 + 512 // Guilds, guild messages
});

discordClient.login(keys.discord);
discordClient.once("ready", function () {
  discordClient.user.setActivity("Portal 2", { type: 5 });
});

const fs = require("node:fs");

const utilsdir = fs.readdirSync("./util");
const utils = {};
utilsdir.forEach(util => {
  util = util.split(".js")[0];
  utils[util] = require("./util/" + util);
});

const apisdir = fs.readdirSync("./api");
const apis = {};
apisdir.forEach(api => {
  api = api.split(".js")[0];
  apis[api] = require("./api/" + api);
});

const UtilError = utils["error"];

const fetchHandler = async function (req) {

  const url = new URL(req.url);
  const urlPathname = url.pathname === "/" ? url.pathname + "index.html" : url.pathname;
  const urlPath = urlPathname.split("/").slice(1);

  if (urlPath[0] === "api") {

    const api = apis[urlPath[1]];
    const args = urlPath.slice(2).map(decodeURIComponent);

    for (let i = 0; i < args.length; i ++) {
      try {
        args[i] = JSON.parse(args[i]);
      } catch (e) { } // Leave it as a string
    }
    
    let output;
    try {
      output = await api(args, req);
    } catch (err) {
      // If a util throws an expected error, pass just its message to the client
      if (err instanceof UtilError) {
        return Response.json(err.message);
      }
      // Otherwise, it's probably much worse, so pass the full stack
      err = new UtilError("ERR_UNKNOWN", args, epochtal, urlPath[1], err.stack);
      return Response.json(err.toString(), { status: 500 });
    }

    if (output instanceof Response) return output;
    return Response.json(output);

  }

  if (urlPath[0] === "util" || urlPath[0] === "admin") {

    const user = await apis.users(["whoami"], req);
    if (!user) return Response("ERR_LOGIN", { status: 403 });
    if (!user.epochtal.admin) return Response("ERR_PERMS", { status: 403 });
    
  }

  if (urlPath[0] === "util") {

    const util = utils[urlPath[1]];
    const args = urlPath.slice(2).map(decodeURIComponent);

    if (!util) return Response("ERR_UTIL", { status: 404 });

    for (let i = 0; i < args.length; i ++) {
      try {
        args[i] = JSON.parse(args[i]);
      } catch (e) { } // Leave it as a string
    }
    
    let result;
    try {
      result = await util(args);
    } catch (err) {
      if (!(err instanceof UtilError)) {
        err = new UtilError("ERR_UNKNOWN", args, epochtal, urlPath[1], err.stack);
      }
      return Response.json(err.toString());
    }
    
    return Response.json(result);

  }

  const file = Bun.file("pages" + decodeURIComponent(urlPathname));

  if (file.size === 0) {
    return Response("404!", { status: 404 });
  }

  return Response(file);

};

const server = Bun.serve({
  port: 3002,
  fetch: fetchHandler
});

console.log(`Listening on http://localhost:${server.port}...`);

utils.routine(["schedule", "epochtal", "concludeWeek", "0 0 10 * * *"]);
utils.routine(["schedule", "epochtal", "releaseMap", "0 0 12 * * *"]);
