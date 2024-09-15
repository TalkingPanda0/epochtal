var lobby, users, whoami;
var avatarCache = {};
var lobbySocket = null;
var readyState = false;

const lobbyPlayersList = document.querySelector("#lobby-players-list");

/**
 * Update player list with current players in the lobby
 */
async function updatePlayerList () {

  let output = "";

  // List all players in the lobby
  for (let i = 0; i < lobby.listEntry.players.length; i ++) {

    const steamid = lobby.listEntry.players[i];
    const user = users[steamid];

    const username = user.name.replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("&", "&amp;");

    // Fetch avatar from cache or API
    let avatar;
    if (steamid in avatarCache) avatar = avatarCache[steamid];
    else try {
      const profile = await (await fetch(`/api/users/profile/"${steamid}"`)).json();
      avatar = profile.avatar;
      avatarCache[steamid] = avatar;
    } catch (e) {
      avatar = "../icons/unknown.jpg";
    }

    const ready = lobby.data.ready.includes(steamid);

    output += `
<div class="lobby-player">
  <img src="${avatar}" class="lobby-player-avatar">
  <p class="lobby-player-name">${username}</p>
  <i
    class="${ready ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} lobby-player-ready"
    onmouseover="showTooltip('${ready ? "Ready" : "Not ready"}')"
    onmouseleave="hideTooltip()"
  ></i>
</div>
    `;

  }

  lobbyPlayersList.innerHTML = output;

}

const lobbyMapContainer = document.querySelector("#lobby-settings-map");

/**
 * Update the map display in the lobby
 */
async function updateLobbyMap () {

  const lobbyMap = lobby.data.context.data.map;

  // If no map is selected, display a placeholder
  if (!lobbyMap) {
    lobbyMapContainer.innerHTML = `
      <p class="votes-text">No map selected</p>
      <button id="lobby-map-button" onclick="selectLobbyMap()">Select</button>
    `;
    return;
  }

  // Display the map thumbnail and title
  lobbyMapContainer.innerHTML = `
    <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${lobbyMap.id}" target="_blank">
      <img class="votes-image" alt="thumbnail" src="https://steamuserimages-a.akamaihd.net/ugc/${lobbyMap.thumbnail}?impolicy=Letterbox&imw=640&imh=360">
      <p class="votes-text">
        ${lobbyMap.title}<br>
        <i class="font-light">by ${lobbyMap.author}</i>
      </p>
    </a>
    <button id="lobby-map-button" onclick="selectLobbyMap()">Select</button>
  `;

}

var eventHandlerConnected = false;

const lobbyReadyButton = document.querySelector("#lobby-ready-button");

/**
 * Handle incoming WebSocket events
 *
 * @param {MessageEvent} event
 */
async function lobbyEventHandler (event) {

  // Parse the incoming data
  const data = JSON.parse(event.data);
  console.log(data, event);

  // Handle the event
  switch (data.type) {

    case "lobby_name": {

      // Rename the lobby
      const encodedName = window.location.href.split("#")[1];
      const name = decodeURIComponent(encodedName);
      const { newName } = data;

      window.location.href = window.location.href.split("#")[0] + "#" + newName;
      lobbyInit();

      return;
    }

    case "lobby_leave": {

      // Handle player leaving the lobby
      const { steamid } = data;

      const index = lobby.listEntry.players.indexOf(steamid);
      if (index === -1) return;

      lobby.listEntry.players.splice(index, 1);
      updatePlayerList();

      return;
    }

    case "lobby_join": {

      // Handle player joining the lobby
      const { steamid } = data;

      if (!lobby.listEntry.players.includes(steamid)) {
        lobby.listEntry.players.push(steamid);
      }
      updatePlayerList();

      return;
    }

    case "lobby_map": {

      // Update the lobby map
      lobby.data.context.data.map = data.newMap;
      updateLobbyMap();

      return;
    }

    case "lobby_ready": {

      // Update the ready state of the given player
      if (data.readyState) {
        lobby.data.ready.push(data.steamid);
      } else {
        lobby.data.ready.splice(lobby.data.ready.indexOf(data.steamid), 1);
      }
      updatePlayerList();

      // If the given player is us, update the client ready state
      if (data.steamid === whoami.steamid) {
        readyState = data.readyState;
        if (readyState) lobbyReadyButton.innerHTML = "Not ready!";
        else lobbyReadyButton.innerHTML = "I'm ready!";
      }

      return;
    }

  }

}

/**
 * Initialize the lobby page
 */
async function lobbyInit () {

  // If we're coming from a page refresh, put the user back at the lobby list
  // Refreshing causes them to disconnect from the lobby anyway
  if (performance.navigation.type === 1) {
    window.location.href = "/live/";
    return;
  }

  // Change the login button to a logout button if the user is logged in
  whoami = await (await fetch("/api/users/whoami")).json();
  if (whoami !== null) {

    const loginButton = document.querySelector("#login-button");

    loginButton.innerHTML = "Log out";
    loginButton.onclick = function () {
      window.location.href = '/api/auth/logout';
    };

  }

  // Fetch the lobby data
  const encodedName = window.location.href.split("#")[1];
  const name = decodeURIComponent(encodedName);
  const safeName = name.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\n", "<br>")
    .replaceAll("\r", "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");

  users = await (await fetch("/api/users/get")).json();
  lobby = await (await fetch(`/api/lobbies/get/${encodedName}`)).json();

  const lobbyNameText = document.querySelector("#lobby-name");
  const lobbyModeText = document.querySelector("#lobby-mode");

  // Display the lobby name and mode
  let modeString;
  switch (lobby.listEntry.mode) {
    case "ffa": modeString = "Free For All"; break;
    default: modeString = "Unknown"; break;
  }

  lobbyNameText.innerHTML = safeName;
  lobbyModeText.innerHTML = "&nbsp;- " + modeString;

  // Update the player list and map display
  updatePlayerList();
  updateLobbyMap();

  // Connect to the WebSocket
  if (lobbySocket) lobbySocket.close();
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  lobbySocket = new WebSocket(`${protocol}://${window.location.host}/ws/lobby_${encodedName}`);
  lobbySocket.addEventListener("message", lobbyEventHandler);

  // Handle the lobby rename button
  window.changeLobbyName = function () {

    // Display a popup to change the lobby name
    showPopup("Change Name", `
      Enter a new lobby name<br>
      <input id="new-lobby-name" type="text" placeholder="Lobby name" spellcheck="false" style="margin-top:5px"></input>
    `, POPUP_INFO, true);

    popupOnOkay = async function () {

      hidePopup();

      const newName = encodeURIComponent(document.querySelector("#new-lobby-name").value.trim());

      // Fetch the api to change the lobby name
      const request = await fetch(`/api/lobbies/rename/${encodedName}/${newName}`);
      let requestData;
      try {
        requestData = await request.json();
      } catch (e) {
        return showPopup("Unknown error", "The server returned an unexpected response. Error code: " + request.status, POPUP_ERROR);
      }

      switch (requestData) {
        case "SUCCESS":
          showPopup("Success", "The lobby name has been successfully updated.");
          return;

        case "ERR_LOGIN": return showPopup("Not logged in", "Please log in via Steam before editing lobby details.", POPUP_ERROR);
        case "ERR_STEAMID": return showPopup("Unrecognized user", "Your SteamID is not present in the users database. WTF?", POPUP_ERROR);
        case "ERR_NAME": return showPopup("Lobby not found", "An open lobby with this name does not exist.", POPUP_ERROR);
        case "ERR_NEWNAME": return showPopup("Invalid lobby name", "Please keep the lobby name to 50 characters or less.", POPUP_ERROR);
        case "ERR_EXISTS": return showPopup("Lobby name taken", "A lobby with this name already exists.", POPUP_ERROR);
        case "ERR_PERMS": return showPopup("Permission denied", "You do not have permission to perform this action.", POPUP_ERROR);

        default: return showPopup("Unknown error", "The server returned an unexpected response: " + requestData, POPUP_ERROR);
      }

    };

  }

  // Handle the lobby change password button
  window.changeLobbyPassword = function () {

    // Display a popup to change the lobby password
    showPopup("Change Password", `
      Enter a new lobby password<br>(leave blank for none)<br>
      <input id="new-lobby-password" type="password" placeholder="Password" spellcheck="false" style="margin-top:5px"></input>
    `, POPUP_INFO, true);

    popupOnOkay = async function () {

      hidePopup();

      const newPassword = encodeURIComponent(document.querySelector("#new-lobby-password").value.trim());

      // Fetch the api to change the lobby password
      const request = await fetch(`/api/lobbies/password/${encodedName}/${newPassword}`);
      let requestData;
      try {
        requestData = await request.json();
      } catch (e) {
        return showPopup("Unknown error", "The server returned an unexpected response. Error code: " + request.status, POPUP_ERROR);
      }

      switch (requestData) {
        case "SUCCESS":
          return showPopup("Success", "The lobby password has been successfully updated.");

        case "ERR_LOGIN": return showPopup("Not logged in", "Please log in via Steam before editing lobby details.", POPUP_ERROR);
        case "ERR_STEAMID": return showPopup("Unrecognized user", "Your SteamID is not present in the users database. WTF?", POPUP_ERROR);
        case "ERR_NAME": return showPopup("Lobby not found", "An open lobby with this name does not exist.", POPUP_ERROR);
        case "ERR_PERMS": return showPopup("Permission denied", "You do not have permission to perform this action.", POPUP_ERROR);

        default: return showPopup("Unknown error", "The server returned an unexpected response: " + requestData, POPUP_ERROR);
      }

    };

  }

  window.selectLobbyMap = function () {

    // Prompt for a workshop map link
    showPopup("Select a map", `<p>Enter a workshop link to the new map.</p>
      <input type="text" placeholder="Workshop Link" id="lobby-settings-map-input"></input>
    `, POPUP_INFO, true);

    popupOnOkay = async function () {

      // Get mapid from link
      const input = document.querySelector("#lobby-settings-map-input");
      const mapid = input.value.trim().toLowerCase().split("https://steamcommunity.com/sharedfiles/filedetails/?id=").pop().split("?")[0];

      // Ensure mapid is valid
      if (!mapid || isNaN(mapid)) {
        showPopup("Invalid link", "The workshop link you provided could not be parsed.", POPUP_ERROR);
        return;
      }

      hidePopup();

      // Request map change from API
      const request = await fetch(`/api/lobbies/map/${encodedName}/"${mapid}"`);
      let requestData;
      try {
        requestData = await request.json();
      } catch (e) {
        return showPopup("Unknown error", "The server returned an unexpected response. Error code: " + request.status, POPUP_ERROR);
      }

      switch (requestData) {
        case "SUCCESS":
          showPopup("Success", "The lobby map has been successfully updated.");
          return;

        case "ERR_LOGIN": return showPopup("Not logged in", "Please log in via Steam before editing lobby details.", POPUP_ERROR);
        case "ERR_STEAMID": return showPopup("Unrecognized user", "Your SteamID is not present in the users database. WTF?", POPUP_ERROR);
        case "ERR_NAME": return showPopup("Lobby not found", "An open lobby with this name does not exist.", POPUP_ERROR);
        case "ERR_PERMS": return showPopup("Permission denied", "You do not have permission to perform this action.", POPUP_ERROR);
        case "ERR_MAPID": return showPopup("Invalid link", "A workshop map associated with this link could not be found.", POPUP_ERROR);
        case "ERR_STEAMAPI": return showPopup("Missing map info", "Failed to retrieve map details. Is this the right link?", POPUP_ERROR);

        default: return showPopup("Unknown error", "The server returned an unexpected response: " + requestData, POPUP_ERROR);
      }

    };

  }

  window.toggleReadyState = async function () {

    // If no map is selected, throw early
    if (!readyState && !lobby.data.context.data.map) {
      return showPopup("No map selected", "Please select a map for the lobby.", POPUP_ERROR);
    }

    // This might take a while, prevent the user from spamming the button
    lobbyReadyButton.style.opacity = 0.5;
    lobbyReadyButton.style.pointerEvents = "none";

    // Request ready state change from API
    const request = await fetch(`/api/lobbies/ready/${encodedName}/${!readyState}`);

    // Restore the button once the request finishes
    lobbyReadyButton.style.opacity = 1.0;
    lobbyReadyButton.style.pointerEvents = "auto";

    let requestData;
    try {
      requestData = await request.json();
    } catch (e) {
      return showPopup("Unknown error", "The server returned an unexpected response. Error code: " + request.status, POPUP_ERROR);
    }

    switch (requestData) {
      case "SUCCESS": return;

      case "ERR_LOGIN": return showPopup("Not logged in", "Please log in via Steam before editing lobby details.", POPUP_ERROR);
      case "ERR_STEAMID": return showPopup("Unrecognized user", "Your SteamID is not present in the users database. WTF?", POPUP_ERROR);
      case "ERR_NAME": return showPopup("Lobby not found", "An open lobby with this name does not exist.", POPUP_ERROR);
      case "ERR_PERMS": return showPopup("Permission denied", "You do not have permission to perform this action.", POPUP_ERROR);
      case "ERR_GAMEAUTH": return showPopup("Game not connected", "You have not authenticated your Portal 2 game client. Start the Spplice package, run 'connect' in the console, and follow the instructions.", POPUP_ERROR);
      case "ERR_GAMESOCKET": return showPopup("Game client error", "An error occurred while communicating with your game client. Try reconnecting?", POPUP_ERROR);
      case "ERR_TIMEOUT": return showPopup("Game client timeout", "Timed out while waiting for a response from your game client. Try reconnecting?", POPUP_ERROR);
      case "ERR_MAP": return showPopup("Map not found", "Please download the lobby map by subscribing to it on the workshop.", POPUP_ERROR);
      case "ERR_NOMAP": return showPopup("No map selected", "Please select a map for the lobby.", POPUP_ERROR);
      case "ERR_INGAME": return showPopup("Game started", "The game has started, you cannot change your ready state.", POPUP_ERROR);

      default: return showPopup("Unknown error", "The server returned an unexpected response: " + requestData, POPUP_ERROR);
    }

  };

}
lobbyInit();
