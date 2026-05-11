/**
 * YouTube Music / Data API + IFrame Player + Google Identity Services.
 */

const GOOGLE_CLIENT_ID = "682592448510-2eurtje38jusp3km1cn6pfpdj4art73s.apps.googleusercontent.com";

/** Optional: `videos.list` can use a browser API key instead of the OAuth token. */
const YT_DATA_API_KEY =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_YOUTUBE_DATA_API_KEY
    ? String(import.meta.env.VITE_YOUTUBE_DATA_API_KEY)
    : "";

const YT_TOKEN_KEY = "yt_access_token";
const YT_EXPIRY_KEY = "yt_token_expiry";
const YT_REFRESH_KEY = "yt_refresh_token";

let ytApiPromise;
let gsiPromise;

const YT_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

/** Load the YouTube IFrame API (defines window.YT and window.onYouTubeIframeAPIReady). Appends the script at most once. */
export function loadYouTubeAPI() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const finish = () => resolve();

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      finish();
    };

    if (window.YT && window.YT.Player) {
      finish();
      return;
    }

    const existing = document.querySelector(`script[src="${YT_IFRAME_API_SRC}"]`);
    if (existing) {
      queueMicrotask(() => {
        if (window.YT && window.YT.Player) finish();
      });
      return;
    }

    const tag = document.createElement("script");
    tag.src = YT_IFRAME_API_SRC;
    tag.async = true;
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

/** @param {(event: { target: any }) => void} onReady @param {(state: number, player: any) => void} onStateChange */
export function createYouTubePlayer(elementId, onReady, onStateChange) {
  return new window.YT.Player(elementId, {
    width: 1,
    height: 1,
    playerVars: { controls: 0, rel: 0, playsinline: 1 },
    events: {
      onReady: (e) => onReady(e),
      onStateChange: (e) => onStateChange(e.data, e.target),
    },
  });
}

/** Load Google Identity Services (gsi) client script. */
export function loadGsiClient() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
  return gsiPromise;
}

/** OAuth token for YouTube Data API (GIS token client). */
export function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      reject(new Error("GOOGLE_CLIENT_ID is not set — add your Web client ID in src/services/youtube.js"));
      return;
    }
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" "),
      callback: (tokenResponse) => {
        if (tokenResponse.access_token) {
          localStorage.setItem(YT_TOKEN_KEY, tokenResponse.access_token);
          if (tokenResponse.expires_in) {
            localStorage.setItem(YT_EXPIRY_KEY, String(Date.now() + tokenResponse.expires_in * 1000));
          }
          resolve(tokenResponse.access_token);
        } else {
          reject(tokenResponse);
        }
      },
    });
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

export function getYoutubeAccessToken() {
  return localStorage.getItem(YT_TOKEN_KEY);
}

/** Alias for callers that expect a shorter name. */
export function getYTAccessToken() {
  return getYoutubeAccessToken();
}

export function isYoutubeTokenValid() {
  const token = localStorage.getItem(YT_TOKEN_KEY);
  const exp = parseInt(localStorage.getItem(YT_EXPIRY_KEY) ?? "0", 10);
  if (!token) return false;
  return Date.now() < exp - 60_000;
}

export function logout() {
  localStorage.removeItem(YT_TOKEN_KEY);
  localStorage.removeItem(YT_EXPIRY_KEY);
  localStorage.removeItem(YT_REFRESH_KEY);
}

/** Profile shape compatible with Sidebar (display_name, email, images). */
export async function getGoogleUserInfo(accessToken) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo error: ${res.status}`);
  const j = await res.json();
  return {
    display_name: j.name ?? "YouTube user",
    email: j.email ?? "",
    images: j.picture ? [{ url: j.picture }] : [],
  };
}

/** Normalized playlists for LibraryPanel / schedule. */
export async function getYoutubePlaylists(accessToken) {
  const out = [];
  let pageToken = "";
  do {
    const u = new URL("https://www.googleapis.com/youtube/v3/playlists");
    u.searchParams.set("part", "snippet,contentDetails");
    u.searchParams.set("mine", "true");
    u.searchParams.set("maxResults", "50");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`YouTube playlists error: ${res.status}`);
    const data = await res.json();
    for (const item of data.items ?? []) {
      const th = item.snippet?.thumbnails;
      out.push({
        id: item.id,
        name: item.snippet?.title ?? "Untitled",
        songCount: Number(item.contentDetails?.itemCount ?? 0),
        artwork: th?.high?.url ?? th?.medium?.url ?? th?.default?.url ?? null,
        color: null,
      });
    }
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

/** Parse YouTube `contentDetails.duration` ISO 8601 (e.g. `PT3M45S`) to seconds. */
export function parseISO8601Duration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const hours = parseInt(match?.[1] ?? 0, 10);
  const minutes = parseInt(match?.[2] ?? 0, 10);
  const seconds = parseInt(match?.[3] ?? 0, 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/** Playlist items as playable queue entries (videoId, title, artist, …). */
export async function getYoutubePlaylistVideos(playlistId, accessToken) {
  const out = [];
  let pageToken = "";
  do {
    const u = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    u.searchParams.set("part", "snippet,contentDetails");
    u.searchParams.set("playlistId", playlistId);
    u.searchParams.set("maxResults", "50");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`YouTube playlistItems error: ${res.status}`);
    const data = await res.json();
    for (const item of data.items ?? []) {
      const vid = item.contentDetails?.videoId;
      if (!vid) continue;
      const sn = item.snippet;
      out.push({
        videoId: vid,
        title: sn?.title ?? "Video",
        artist: sn?.videoOwnerChannelTitle ?? sn?.channelTitle ?? "",
        duration: 0,
        artwork: `https://img.youtube.com/vi/${vid}/mqdefault.jpg`,
      });
    }
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

/**
 * Fetch `contentDetails.duration` for video IDs in batches of 50.
 * Uses `VITE_YOUTUBE_DATA_API_KEY` as `key` when set; otherwise `Authorization: Bearer`.
 */
async function fetchVideoDurationsById(videoIds, accessToken) {
  const map = new Map();
  const unique = [...new Set(videoIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const u = new URL("https://www.googleapis.com/youtube/v3/videos");
    u.searchParams.set("part", "contentDetails");
    u.searchParams.set("id", batch.join(","));
    if (YT_DATA_API_KEY) {
      u.searchParams.set("key", YT_DATA_API_KEY);
    }
    const headers = {};
    if (!YT_DATA_API_KEY) {
      if (!accessToken) throw new Error("YouTube access token required for videos list");
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const res = await fetch(u, { headers });
    if (!res.ok) throw new Error(`YouTube videos error: ${res.status}`);
    const data = await res.json();
    for (const item of data.items ?? []) {
      const iso = item.contentDetails?.duration;
      if (item.id && iso) map.set(item.id, parseISO8601Duration(iso));
    }
  }
  return map;
}

export async function getYoutubePlaylistTracks(playlistId, accessToken) {
  const tracks = await getYoutubePlaylistVideos(playlistId, accessToken);
  const idToSeconds = await fetchVideoDurationsById(
    tracks.map((t) => t.videoId),
    accessToken
  );
  let totalSeconds = 0;
  for (const t of tracks) {
    const sec = idToSeconds.get(t.videoId) ?? 0;
    t.duration = sec;
    totalSeconds += sec;
  }
  tracks.totalDuration = totalSeconds;
  return tracks;
}
