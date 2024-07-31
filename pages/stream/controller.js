var controllerInit = async function () {

  // Pre-fetch required resources
  const whoami = await (await fetch("/api/users/whoami")).json();
  const leaderboard = await (await fetch("/api/leaderboard/get")).json();
  const config = await (await fetch("/api/config/get")).json();
  const users = await (await fetch("/api/users/get")).json();

  /**
   * Sends WebSocket events to the connected user's client
   *
   * @param {string} type Type of event, currently only "cmd" is expected
   * @param {string} value Data to send, currently expected to be a concommand
   */
  window.sendToGame = async function (type, value) {

    const data = { type, value };
    await fetch(`/util/events/send/"game_${whoami.steamid}"/${JSON.stringify(data)}`);

  };

  /**
   * Sends a request to display the specified run details on-stream
   *
   * @param {string} category Name of the category in which the run is
   * @param {string} steamid SteamID of the respective runner
   * @param {"demo"|"video"|null} proof Run proof type
   */
  window.selectRunner = function (category, steamid, proof) {

    window.opener.postMessage({
      action: "run",
      category, steamid
    });

    // Define what happens when this run gets played back
    window.playSelectedRun = async function () {

      if (proof === "demo") {
        await sendToGame("cmd", `playdemo tournament/${steamid}_${category}`);
        window.opener.postMessage({ action: "play" });
      } else {
        const link = await (await fetch(`/api/proof/download/"${steamid}"/${category}`)).text();
        window.opener.postMessage({ action: "play", link });
      }

    };

  };

  // Sends a request to display the leaderboard on-stream
  window.returnToLeaderboard = async function () {

    window.opener.postMessage({
      action: "start"
    });

    await sendToGame("cmd", "stopdemo");

  };

  const leaderboardContainer = document.querySelector("#controller-leaderboard");
  /**
   * Sets up or updates the leaderboard display
   * @param {string} category Name of the category for which to display the leaderboard
   */
  const updateLeaderboard = async function (category) {

    // Get more data about the selected category to choose what to display
    const categoryData = config.categories.find(c => c.name === category);

    let prevTime = null;

    // Iterate over the leaderboard in reverse to calculate deltas more easily
    let output = "";
    for (let i = leaderboard[category].length - 1; i >= 0; i --) {

      const run = leaderboard[category][i];

      // Essential run info
      const placement = run.placement;
      const player = toHTMLString(users[run.steamid].name);
      const time = ticksToString(run.time);
      const proof = await (await fetch(`/util/proof/type/"${run.steamid}"/${category}`, { method: "POST" })).json();
      // Conditional run info
      const portals = categoryData.portals ? run.portals : null;
      const partner = categoryData.coop ? users[config.partners[run.steamid]].name : null;
      const delta = (!categoryData.portals && prevTime) ? ticksToString(prevTime - run.time) : null;

      prevTime = run.time;

      output = `
        <a style="color:white;text-decoration:none"
        href="javascript:selectRunner('${category}', '${run.steamid}', '${proof}')"
        ${run.note ? `onmouseover="showTooltip(\`${toHTMLString(run.note)}\`)"` : ""}
        onmouseleave="hideTooltip()">

        #${placement} -
        <b>${player}</b>
        ${partner === null ? "" : ` and <b>${partner}</b>`}
        in ${time}
        ${portals === null ? "" : ` | ${portals}p`}
        <span class="font-light">
          ${delta === null ? "" : ` (-${delta})`}
          ${proof}
        </span>

        <br></a>` + output;

    }
    leaderboardContainer.innerHTML = output;

  };
  await updateLeaderboard("main");

  // Set up the category dropdown
  const categoriesOptions = document.querySelector("#controller-categories");
  categoriesOptions.onchange = async function () {

    const newCategory = categoriesOptions.value;

    window.opener && window.opener.postMessage({
      action: "category",
      name: newCategory
    });

    await updateLeaderboard(newCategory);

  };

  // Fill the category dropdown with options
  for (const category of config.categories) {
    // Skip categories that don't have any runs
    if (!(category.name in leaderboard) || leaderboard[category.name].length === 0) continue;

    categoriesOptions.innerHTML += `<option value="${category.name}">${category.title}</option>`;

  }

  // Set up basic audio controls
  const musicPlayPauseButton = document.querySelector("#controller-music-playpause");
  const musicSkipButton = document.querySelector("#controller-music-skip");
  const musicNowPlaying = document.querySelector("#controller-music-nowplaying");

  musicPlayPauseButton.onclick = function () {

    window.opener.postMessage({action: "musicPause"});

    if (musicPlayPauseButton.className === "fa-solid fa-pause") {
      musicPlayPauseButton.className = "fa-solid fa-play";
    } else {
      musicPlayPauseButton.className = "fa-solid fa-pause";
    }

  };

  musicSkipButton.onclick = function () {

    window.opener.postMessage({action: "musicSkip"});
    musicPlayPauseButton.className = "fa-solid fa-pause";

  };

  // Respond to messages sent by the stream UI
  window.addEventListener("message", async function (event) {
    switch (event.data.type) {

      case "musicName": {
        musicNowPlaying.innerHTML = `Now playing: <b>${event.data.trackname}</b>`;
        return;
      }

    }
  });

}
controllerInit();
