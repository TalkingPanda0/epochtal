const fs = require("node:fs");
const { $ } = require("bun");

const tmppath = require("../util/tmppath.js");
const demo = require("../util/demo.js");
const discord = require("../util/discord.js");
const leaderboard = require("../util/leaderboard.js");
const categories = require("../util/categories.js");
const config = require("../util/config.js");
const users = require("../util/users.js");

const api_users = require("./users.js");

function ticksToString (t) {

  let output = "",
      hrs = Math.floor(t / 216000)
      min = Math.floor(t / 3600),
      sec = t % 3600 / 60;

  if (hrs !== 0) output += `${hrs}:${min % 60 < 10 ? "0" : ""}${min % 60}:`;
  else if (min !== 0) output += `${min}:`;
  if (sec < 10) output += "0";
  output += sec.toFixed(3);

  return output;

}

async function discordUpdate (steamid, category) {

  const currBoard = await leaderboard(["get", category]);
  const currCategory = await categories(["get", category]);

  const run = currBoard.find(c => c.steamid === steamid);
  const user = await users(["get", steamid]);
  const time = ticksToString(run.time);

  let emoji = "🎲";
  let output = `**${user.name}**`;

  if (currCategory.coop) {
    const partners = await config(["get", "partners"]);
    const partner = await users(["get", partners[steamid]]);
    output += ` and **${partner.name}**`;
  }

  output += ` submitted a new run to "${currCategory.title}" with a time of \`${time}\``;

  if (currCategory.portals) {
    output += ` (${run.portals} portals)`;
  }

  if (currCategory.points) {
    const suffix = ["st","nd","rd"][((run.placement + 90) % 100 - 10) % 10 - 1] || "th";
    output += ` in ${run.placement}${suffix} place`;
  }

  if (currCategory.coop) emoji = "👥";
  else if (currCategory.portals) emoji = "📉";
  else if (currCategory.points) emoji = "🏁";

  await discord(["update", `${emoji} ${output}.`]);

}

module.exports = async function (args, request) {

  const [command, category] = args;

  let categoryData;
  if (category) {
    categoryData = await categories(["get", category]);
  }

  switch (command) {

    case "get": {

      return epochtal.data.leaderboard;

    }

    case "submit": {

      if (categoryData.lock) return "ERR_LOCKED";
      if (categoryData.proof === "video") return "ERR_PROOF";

      const user = await api_users(["whoami"], request);
      if (!user) return "ERR_LOGIN";

      const profile = epochtal.data.profiles[user.steamid];
      if (!profile) return "ERR_PROFILE";

      if (profile.banned === true || profile.banned > Date.now()) return "ERR_BANNED";

      const note = args[2];
      if (note === undefined) return "ERR_ARGS";
      if (note.length > 200) return "ERR_NOTE";

      const path = (await tmppath()) + ".dem";

      const formData = await request.formData();
      const fileBlob = formData.get("demo");

      if (!(fileBlob instanceof Blob)) return "ERR_FILE";

      await Bun.write(path, fileBlob);

      if (categoryData.points || category === "ppnf") {
        const verdict = await demo(["verify", path]);
        if (verdict !== "VALID" && !(verdict === "PPNF" && category === "ppnf")) {
          fs.rmSync(path);

          const reportText = `${user.username}'s run was rejected. ${verdict}\nSteam ID: \`${user.steamid}\``;
          await discord(["report", reportText]);

          return "ERR_ILLEGAL";
        }
      }

      const data = await demo(["parse", path]);

      if (user.steamid !== data.steamid) {
        fs.rmSync(path);
        return "ERR_STEAMID";
      }

      if (data.partner) {

        if (!categoryData.coop) {
          fs.rmSync(path);
          return "ERR_NOTCOOP";
        }

        const partners = epochtal.data.week.partners;

        if (!(data.steamid in partners || data.partner in partners)) {

          partners[data.steamid] = data.partner;
          partners[data.partner] = data.steamid;

          if (epochtal.file.week) {
            await Bun.write(epochtal.file.week, JSON.stringify(epochtal.data.week));
          }

        } else if (partners[data.steamid] !== data.partner || partners[data.partner] !== data.steamid) {
          fs.rmSync(path);
          return "ERR_PARTNER";
        }

      } else if (categoryData.coop) {
        fs.rmSync(path);
        return "ERR_NOPARTNER";
      }

      try {
        await leaderboard(["add", category, data.steamid, data.time, note, data.portals, false]);
      } catch (e) {
        fs.rmSync(path);
        throw e;
      }

      const newPath = `${epochtal.file.demos}/${data.steamid}_${category}.dem`;
      fs.renameSync(path, newPath);
      await $`xz -zf9e ${newPath}`.quiet();

      discordUpdate(user.steamid, categoryData.name);

      return data;

    }

    case "submitlink": {

      if (categoryData.lock) return "ERR_LOCKED";
      if (categoryData.proof === "demo") return "ERR_PROOF";

      const user = await api_users(["whoami"], request);
      if (!user) return "ERR_LOGIN";

      for (let i = 2; i <= 5; i ++) {
        if (args[i] === undefined) return "ERR_ARGS";
      }

      const [link, note, time, portals] = args.slice(2);

      const data = {
        steamid: user.steamid,
        time: time,
        portals: portals
      };

      await leaderboard(["add", category, data.steamid, data.time, note, data.portals, true]);

      const newPath = `${epochtal.file.demos}/${data.steamid}_${category}.link`;
      await Bun.write(newPath, link);

      discordUpdate(user.steamid, categoryData.name);

      return data;

    }

    case "remove": {

      if (categoryData.lock) return "ERR_LOCKED";

      const user = await api_users(["whoami"], request);
      if (!user) return "ERR_LOGIN";

      await leaderboard(["remove", category, user.steamid]);

      return "SUCCESS";

    }

    case "edit": {

      if (categoryData.lock) return "ERR_LOCKED";

      const user = await api_users(["whoami"], request);
      if (!user) return "ERR_LOGIN";

      const note = args[2];

      await leaderboard(["edit", category, user.steamid, note]);

      return "SUCCESS";

    }

  }

  return "ERR_COMMAND";

};
