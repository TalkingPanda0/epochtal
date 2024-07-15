const jwt = require("jsonwebtoken");
const SteamAuth = require("../steamauth.js");

const keys = require("../../keys.js");
const users = require("../util/users.js");

const steam = new SteamAuth({
  realm: "https://epochtal.p2r3.com", // Site name displayed to users on logon
  returnUrl: "https://epochtal.p2r3.com/api/auth/return", // Return route
  apiKey: keys.steam // Steam API key
});

module.exports = async function (args, request) {

  const [command] = args;

  switch (command) {

    case "return": {

      const authuser = await steam.authenticate(request);
      const user = await users(["get", authuser.steamid]);

      if (!user) {
        await users(["add", authuser.steamid, authuser.username, authuser.avatarmedium]);
      } else {
        await users(["authupdate", authuser.steamid, authuser]);
      }

      const token = jwt.sign(authuser, keys.jwt);
      const headers = new Headers({
        "Set-Cookie": `steam_token=${token};path=/;max-age=604800;HttpOnly;`,
        "Location": "/"
      });

      return new Response(null, {
        status: 302,
        headers: headers
      });

    }

    case "login": {

      const url = await steam.getRedirectUrl();
      return Response.redirect(url, 302);

    }

    case "logout": {

      const headers = new Headers({
        "Set-Cookie": `steam_token=;path=/;max-age=0;HttpOnly;`,
        "Location": "/"
      });

      return new Response(null, {
        status: 302,
        headers: headers
      });

    }

  }

  return "ERR_COMMAND";

};
