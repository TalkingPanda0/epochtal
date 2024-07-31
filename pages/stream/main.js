var initializeUI = async function () {

  // Fetch data required for rendering the leaderboard
  const leaderboard = await (await fetch("/api/leaderboard/get")).json();
  const config = await (await fetch("/api/config/get")).json();
  const users = await (await fetch("/api/users/get")).json();

  // Open a separate popup for controlling the UI
  window.controllerWindow = open("/stream/controller", "_blank", "popup, width=810, height=520");

  // Start music and "Starting Stream" animation, wait for it to finish
  await standbyAnimation(config, leaderboard);

  // Start intro animation, wait for it to finish
  await introAnimation(config, leaderboard);

  // Query some of the elements for later use
  const contentContainer = document.querySelector("#content");
  const infoPanel = document.querySelector("#info");
  const weekText = document.querySelector("#week");
  const descriptionParts = document.querySelectorAll(".info-description");
  const leaderboardElement = document.querySelector("#leaderboard");
  const titleElement = document.querySelector("#title");
  const backgroundAnimation = document.querySelector("#bg-anim-container");
  const youtubeEmbed = document.querySelector("#youtube");

  const runElementContainer = document.querySelector("#runinfo");
  const runNameElement = document.querySelector("#runinfo-name");
  const runDetailsElement = document.querySelector("#runinfo-details");
  const runCommentElement = document.querySelector("#runinfo-comment");
  const runSeparatorElement = document.querySelector("#runinfo-seperator");

  /**
   * Swipes away board items
   */
  const clearBoard = async function () {

    // Push info panel off-screen
    infoPanel.style.transform = "translateX(calc(100% + 2.5vw))";
    infoPanel.style.opacity = 0;

    // Fade out entries one after another
    const oldEntries = document.querySelectorAll(".lb-entry");
    const playerCount = oldEntries.length;
    const isLong = playerCount > 5;

    // Speed up animation if there are many players
    const delay = isLong ? 50 : 100;

    for (let i = 1; i <= playerCount; i ++) {
      setTimeout(function() {
        oldEntries[playerCount - i].style.opacity = 0;
      }, delay * i);
    }

    // Fade out title after leaderboard is clear
    setTimeout(function () {
      document.querySelector("#lb-title").style.opacity = 0;
    }, delay * playerCount + 100);

    // Stall function until everything has been cleared (and then some)
    await new Promise(function (resolve) {
      setTimeout(resolve, delay * playerCount + 600 + 200);
    });

  };

  /**
   * Renders the leaderboard of the given category
   *
   * @param {string} category Name of the category for which to display the leaderboard
   * @param {boolean} [clear=true] Whether to first clear the current leaderboard
   */
  const updateLeaderboard = async function (category, clear = true) {

    if (clear) await clearBoard();

    const currCategory = config.categories.find(c => c.name === category);
    const currBoard = leaderboard[category];
    const { coop, portals } = currCategory, long = currBoard.length > 5;

    // Decide render type based on co-op flag and player count
    const entryClass = "lb-entry " + (coop ? " lb-entry-coop" : (long ? " lb-entry-compact" : ""));

    // Build leaderboard entries
    let boardHTML = `<h2 id="lb-title">${currCategory.title}</h2>`;
    for (const run of currBoard) {

      const podiumIndex = currCategory.points ? run.placement : 0;
      const playerName = toHTMLString(users[run.steamid].name);
      const partnerName = coop && toHTMLString(users[config.partners[run.steamid]].name);

      boardHTML += `
        <div class="${entryClass} podium${podiumIndex}">
          <h1 class="${coop ? "p1" : "solo"}">${playerName}</h1>
          ${coop ? `<h1 class="p2">${partnerName}</h1>` : ""}
        </div>`;

    }
    leaderboardElement.innerHTML = boardHTML;

    // Speed up animation if there are many players
    const delay = long ? 50 : 100;

    // Fade in entries one after another
    setTimeout(function () {
      const newEntries = document.querySelectorAll(".lb-entry");
      for (let i = 0; i < currBoard.length; i++) {
        setTimeout(function () {
          newEntries[i].style.opacity = 1;
        }, delay * i);
      }
    }, delay);

    // Fade in title while leaderboard is getting built
    setTimeout(function () {
      document.querySelector("#lb-title").style.opacity = 1;
    }, 100);

    let longest = 0, shortest = currBoard[0].time;

    for (let i = 0; i < currBoard.length; i ++) {
      if (currBoard[i].time > longest) longest = currBoard[i].time;
      if (currBoard[i].time < shortest) shortest = currBoard[i].time;
    }

    const timeVariation = Math.round((longest - shortest) / 60);
    const portalVariation = (currBoard[currBoard.length - 1].portals - currBoard[0].portals);

    // Set info panel info
    weekText.innerHTML = `week ${config.number}`;
    descriptionParts[0].innerHTML = toHTMLString(config.map.title);
    descriptionParts[1].innerHTML = `${config.map.upvotes} upvotes<br>${config.map.downvotes} downvotes`;
    descriptionParts[2].innerHTML = `${currBoard.length} run${currBoard.length !== 1 ? "s" : ""} submitted`;
    descriptionParts[3].innerHTML = `${timeVariation} second difference`;
    if (portals) descriptionParts[3].innerHTML += `<br>${portalVariation} portal difference`;

    // Bring up info panel
    setTimeout(function () {
      infoPanel.style.transform = "translateX(0)";
      infoPanel.style.opacity = 0.8;
      weekText.style.opacity = 1;
    }, 500);

  };
  updateLeaderboard("main", false);

  /**
   * Brings run info on screen and puts the runner in focus
   *
   * @param {string} category Name of the category in which the run is
   * @param {string} steamid SteamID of the respective runner
   */
  const readyVideo = function (category, steamid) {

    // Move away all leaderboard-related panels
    titleElement.style.transform = "translateX(-100%)";
    infoPanel.style.transform = "translateX(calc(100% + 2.5vw))";
    leaderboardElement.style.transform = "translateX(calc(-100% - 10vw))";

    const currCategory = config.categories.find(c => c.name === category);
    const { coop, portals } = currCategory;
    const run = leaderboard[category].find(c => c.steamid === steamid);

    // The "portals" flag is sometimes used for counting actions other than portal shots
    // In that case, the name of the action is the value of the flag
    const portalLabel = portals === true ? "portals: " : `${portals} count: `;

    const playerName = toHTMLString(users[run.steamid].name);
    const partnerName = coop && toHTMLString(users[config.partners[run.steamid]].name);

    // Set the details to be put in focus
    runNameElement.innerHTML = playerName + (coop ? `<br>${partnerName}` : "");
    runDetailsElement.innerHTML = `time: ${ticksToString(run.time)}${portals ? `<br>${portalLabel}${run.portals}` : ""}`;
    runCommentElement.innerHTML = run.note ? `"${run.note}"` : "";

    // Fade in all of the elements once data has been written
    setTimeout(function () {
      runNameElement.style.opacity = 1;
      runDetailsElement.style.opacity = 1;
      if (run.note) runCommentElement.style.opacity = 1;
      runSeparatorElement.style.transform = "scaleX(1)";
    }, 800);

  }

  /**
   * Plays back a run on-stream
   * @param {string} link Video link - if omitted, doesn't actually play any media
   */
  const playVideo = async function (link) {

    // Remove control from UI
    contentContainer.style.pointerEvents = "none";

    // Slide runner name to the top
    setTimeout(function () {

      runDetailsElement.style.opacity = 0;
      runCommentElement.style.opacity = 0;
      runSeparatorElement.style.transform = "scaleX(0)";

      setTimeout(function () {
        runElementContainer.style.transform = "translate(-50%, -50vh)";
      }, 1000);

    }, 500);

    setTimeout(function () {
      backgroundAnimation.style.opacity = 0;
    }, 1000);

    // If we weren't given a link, assume the rest is handled elsewhere (demo playback)
    if (!link) return;

    // Extract ID from YouTube video link
    let videoID = "";
    if (link.includes("watch?v=")) videoID = link.split("watch?v=")[1].split("&")[0];
    else videoID = link.split("youtu.be/")[1].split("?")[0];

    // Activate the YouTube embed
    youtubeEmbed.style.display = "block";
    youtubeEmbed.src = `https://www.youtube-nocookie.com/embed/${videoID}?autoplay=1&vq=high`;

  };

  /**
   * Stops playing active video and moves leaderboard elements into place
   */
  const unplayVideo = function () {

    backgroundAnimation.style.opacity = 1;

    setTimeout(function () {
      youtubeEmbed.src = "";
      youtubeEmbed.style.display = "none";
      contentContainer.style.pointerEvents = "auto";
    }, 500);

    // Bring back all panels
    titleElement.style.transform = "translateX(0)";
    infoPanel.style.transform = "translateX(0)";
    leaderboardElement.style.transform = "translateX(0)";

    // Clear run information
    runNameElement.style.opacity = 0;
    runDetailsElement.style.opacity = 0;
    runCommentElement.style.opacity = 0;
    runSeparatorElement.style.transform = "scaleX(0)";

    // Slide run information panel back down while it's hidden
    setTimeout(function () {
      runElementContainer.style.transform = "translate(-50%, -50%)";
    }, 500);

    // Re-enable interaction with UI elements
    contentContainer.style.pointerEvents = "auto";

  }

  /**
   * Handles messages sent from the stream UI controller
   * @param {unknown} event The cross-window message event
   */
  const controllerInputHandler = async function (event) {

    if (event.source.location !== controllerWindow.location) return;

    switch (event.data.action) {

      case "start": return unplayVideo();
      case "play": return playVideo(event.data.link);
      case "run": return readyVideo(event.data.category, event.data.steamid);
      case "musicSkip": return musicNextTrack();
      case "musicPause": return musicTogglePause();
      case "category": return updateLeaderboard(event.data.name);

    }

  };
  window.addEventListener("message", controllerInputHandler);

};
initializeUI();
