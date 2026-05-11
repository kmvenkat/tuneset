const CLIENT_ID = "614729761e1846858aa367b275ffbd5f";
const REDIRECT_URI = "http://127.0.0.1:5175";
const SCOPES = [
  "user-read-private",
  "user-read-email",
  "playlist-read-private",
  "playlist-read-collaborative",
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
].join(" ");

// ── PKCE Auth Flow ──────────────────────────────────────────────────

function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function redirectToSpotifyLogin() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem("spotify_code_verifier", verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    show_dialog: "true",
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem("spotify_code_verifier");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem("spotify_access_token", data.access_token);
    localStorage.setItem("spotify_refresh_token", data.refresh_token);
    localStorage.setItem("spotify_token_expiry", Date.now() + data.expires_in * 1000);
  }
  return data;
}

export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("spotify_refresh_token");
  if (!refreshToken) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem("spotify_access_token", data.access_token);
    localStorage.setItem("spotify_token_expiry", Date.now() + data.expires_in * 1000);
  }
  return data.access_token;
}

export async function getAccessToken() {
  const expiry = parseInt(localStorage.getItem("spotify_token_expiry") ?? "0");
  if (Date.now() > expiry - 60000) {
    return await refreshAccessToken();
  }
  return localStorage.getItem("spotify_access_token");
}

export function logout() {
  localStorage.removeItem("spotify_access_token");
  localStorage.removeItem("spotify_refresh_token");
  localStorage.removeItem("spotify_token_expiry");
  localStorage.removeItem("spotify_code_verifier");
}

// ── Spotify API ─────────────────────────────────────────────────────

async function spotifyFetch(path) {
  const token = await getAccessToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

export async function getMe() {
  return spotifyFetch("/me");
}

export async function getMyPlaylists() {
  const results = [];
  let url = "/me/playlists?limit=50";
  while (url) {
    const data = await spotifyFetch(url.replace("https://api.spotify.com/v1", ""));
    results.push(...data.items);
    url = data.next;
  }
  return results;
}

export async function getPlaylistTracks(playlistId) {
  const results = [];
  let url = `/playlists/${playlistId}/tracks?limit=50`;
  while (url) {
    const data = await spotifyFetch(url.replace("https://api.spotify.com/v1", ""));
    const tracks = data.items
      .filter(item => item.track && item.track.id)
      .map(item => ({
        id: item.track.id,
        uri: `spotify:track:${item.track.id}`,
        title: item.track.name,
        artist: item.track.artists.map(a => a.name).join(", "),
        album: item.track.album.name,
        duration: Math.floor(item.track.duration_ms / 1000),
        artwork: item.track.album.images?.[1]?.url ?? item.track.album.images?.[0]?.url ?? null,
      }));
    results.push(...tracks);
    url = data.next;
  }
  return results;
}

// ── Web Playback SDK ────────────────────────────────────────────────

export function loadSpotifySDK() {
  return new Promise((resolve) => {
    if (window.Spotify) { resolve(window.Spotify); return; }
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    document.head.appendChild(script);
  });
}

export async function createPlayer(name, getToken, onReady, onStateChange, onError) {
  const Spotify = await loadSpotifySDK();
  const player = new Spotify.Player({
    name,
    getOAuthToken: async (cb) => cb(await getToken()),
    volume: 0.8,
  });
  player.addListener("ready", ({ device_id }) => onReady(device_id));
  player.addListener("player_state_changed", onStateChange);
  player.addListener("initialization_error", onError);
  player.addListener("authentication_error", onError);
  player.addListener("account_error", ({ message }) => {
    console.error("Spotify Premium required:", message);
    onError({ message: "Spotify Premium is required for playback." });
  });
  await player.connect();
  return player;
}

export async function playTracks(deviceId, uris, offsetIndex = 0) {
  const token = await getAccessToken();
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris, offset: { position: offsetIndex } }),
  });
}

export async function pausePlayback(deviceId) {
  const token = await getAccessToken();
  await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function seekTo(deviceId, positionMs) {
  const token = await getAccessToken();
  await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function setVolume(deviceId, percent) {
  const token = await getAccessToken();
  await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.round(percent * 100)}&device_id=${deviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}