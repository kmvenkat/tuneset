import { useState, useCallback, useEffect, useRef } from "react";
import { useSchedule } from "./hooks/useSchedule";
import { usePlayer } from "./hooks/usePlayer";
import { loadGsiClient, getYoutubePlaylistTracks } from "./services/youtube";
import Sidebar from "./components/Sidebar";
import ScheduleGrid from "./components/ScheduleGrid";
import NowPlayingBar from "./components/NowPlayingBar";
import "./App.css";
import { getOrderedActiveBlocksForNow } from "./utils/scheduleSegments";

const STORAGE_KEY = "tuneset_schedule_v1";

/** Re-order active blocks using grid visual order for the current time segment; fallback keeps getOrdered order. */
function sortActiveBlocksByGridVisualOrder(activeBlocks, blockOrderRef) {
  if (activeBlocks.length <= 1) return [...activeBlocks];

  const now = new Date();
  const jsDay = now.getDay();
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let matchedKey = null;
  let matchedOrder = null;
  for (const [key, order] of blockOrderRef.current.entries()) {
    const parts = key.split("-");
    const segDay = parseInt(parts[0], 10);
    const segStart = parseInt(parts[1], 10);
    const segEnd = parseInt(parts[2], 10);
    if (Number.isNaN(segDay) || Number.isNaN(segStart) || Number.isNaN(segEnd)) continue;
    if (segDay === dayIndex && currentMinutes >= segStart && currentMinutes < segEnd) {
      matchedKey = key;
      matchedOrder = order;
      break;
    }
  }

  const orderedIds = matchedOrder;
  console.log(
    "SORT_DEBUG",
    JSON.stringify({
      segmentKey: matchedKey,
      orderedIds,
      activeBlockIds: activeBlocks.map((b) => b.id),
      reason: orderedIds ? "found" : "not found",
    })
  );
  if (!orderedIds?.length) return [...activeBlocks];

  const rank = (blockId) => {
    const i = orderedIds.indexOf(blockId);
    if (i !== -1) return i;
    return 1000 + activeBlocks.findIndex((b) => b.id === blockId);
  };

  return [...activeBlocks].sort((a, b) => rank(a.id) - rank(b.id));
}

const YOUTUBE_OAUTH_CLIENT_ID =
  "682592448510-2eurtje38jusp3km1cn6pfpdj4art73s.apps.googleusercontent.com";
const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const YOUTUBE_OAUTH_SCOPES = [
  YOUTUBE_READONLY_SCOPE,
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

/** Active blocks for “now”, ordered left-to-right within each overlap segment (playback order). */
function getActiveBlocksOrderedForScheduler() {
  const now = new Date();
  const jsDay = now.getDay();
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let blocks = [];
  try { blocks = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch {}
  return getOrderedActiveBlocksForNow(blocks, dayIndex, currentMinutes);
}

export default function App() {
  const schedule = useSchedule();
  const player = usePlayer();
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  /** False until mount auth effect finishes (avoids login flash when restoring a session). */
  const [authBootstrapped, setAuthBootstrapped] = useState(
    () => typeof localStorage !== "undefined" && !localStorage.getItem("yt_access_token")
  );
  const playlistTracksRef = useRef(new Map()); // playlistId -> songs[]
  /** Bumped when tracks cache is populated so Sidebar can re-read durations. */
  const [playlistTracksVersion, setPlaylistTracksVersion] = useState(0);
  const currentQueueKeyRef = useRef(null);
  /** Segment key → block ids left-to-right as reported by ScheduleGrid. */
  const blockOrderRef = useRef(new Map());

  const loadPlaylists = useCallback(async (token) => {
    try {
      const res = await fetch(
        "https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      const COLORS = ["#FF9F0A","#0A84FF","#BF5AF2","#30D158","#FA2D55","#FF6B6B","#5AC8FA","#FF9F0A"];
      const pls = (data.items || []).map((item, i) => ({
        id: item.id,
        name: item.snippet.title,
        songCount: item.contentDetails.itemCount,
        artwork: item.snippet.thumbnails?.medium?.url ?? null,
        color: COLORS[i % COLORS.length],
        songs: [],
      }));
      setPlaylists(pls);
    } catch (e) {
      console.error("Failed to load playlists", e);
    }
  }, []);

  // ── Auth & playlist loading ────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("yt_access_token");
    if (!token) {
      setIsAuthenticated(false);
      setAuthBootstrapped(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const profile = await profileRes.json();
        if (cancelled) return;
        setUser({
          name: profile.name,
          email: profile.email,
          picture: profile.picture,
        });
        setIsAuthenticated(true);
        loadPlaylists(token);
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load Google profile", e);
          setUser(null);
          setIsAuthenticated(true);
          loadPlaylists(token);
        }
      } finally {
        if (!cancelled) setAuthBootstrapped(true);
      }
    })();

    return () => { cancelled = true; };
  }, [loadPlaylists]);

  const handleConnectYouTubeMusic = useCallback(async () => {
    try {
      await loadGsiClient();
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: YOUTUBE_OAUTH_CLIENT_ID,
        scope: YOUTUBE_OAUTH_SCOPES,
        callback: (tokenResponse) => {
          if (tokenResponse.access_token) {
            localStorage.setItem("yt_access_token", tokenResponse.access_token);
            if (tokenResponse.expires_in) {
              localStorage.setItem(
                "yt_token_expiry",
                String(Date.now() + tokenResponse.expires_in * 1000)
              );
            }
            window.location.reload();
          }
        },
      });
      tokenClient.requestAccessToken();
    } catch (e) {
      console.error("YouTube sign-in failed", e);
    }
  }, []);

  const fetchPlaylistTracks = useCallback(async (playlistId) => {
    if (playlistTracksRef.current.has(playlistId)) {
      return playlistTracksRef.current.get(playlistId);
    }
    const token = localStorage.getItem("yt_access_token");
    if (!token) {
      const empty = [];
      empty.totalDuration = 0;
      playlistTracksRef.current.set(playlistId, empty);
      setPlaylistTracksVersion((v) => v + 1);
      return empty;
    }
    const songs = await getYoutubePlaylistTracks(playlistId, token);
    console.log("TRACKS_LOADED", playlistId, songs.length, "totalDuration", songs.totalDuration);
    playlistTracksRef.current.set(playlistId, songs);
    setPlaylistTracksVersion((v) => v + 1);
    return songs;
  }, []);

  const getPlaylistMeta = useCallback((playlistId) => {
    const tracks = playlistTracksRef.current.get(playlistId);
    return tracks ? { totalDuration: tracks.totalDuration ?? 0 } : null;
  }, [playlistTracksVersion]);

  useEffect(() => {
    if (!playlists.length) return;
    const timeouts = [];
    playlists.slice(0, 50).forEach((pl, i) => {
      timeouts.push(
        setTimeout(() => {
          fetchPlaylistTracks(pl.id).catch(() => {});
        }, i * 500)
      );
    });
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [playlists, fetchPlaylistTracks]);

  const playerPlayRef = useRef(player.play);
  useEffect(() => {
    playerPlayRef.current = player.play;
  }, [player.play]);

  const fetchTracksRef = useRef(fetchPlaylistTracks);
  useEffect(() => {
    fetchTracksRef.current = fetchPlaylistTracks;
  }, [fetchPlaylistTracks]);

  const handleBlocksReordered = useCallback((segmentKey, blockIds) => {
    blockOrderRef.current.set(segmentKey, [...blockIds]);
  }, []);

  // ── Scheduler ─────────────────────────────────────────────────────
  const runSchedulerTick = useCallback(async () => {
    if (!localStorage.getItem("yt_access_token")) return;

    const activeBlocks = getActiveBlocksOrderedForScheduler();
    if (activeBlocks.length === 0) return;

    console.log(
      "BLOCK_ORDER_REF",
      JSON.stringify(
        [...blockOrderRef.current.entries()].map(([k, v]) => ({ key: k, order: v }))
      )
    );

    const sortedActive = sortActiveBlocksByGridVisualOrder(activeBlocks, blockOrderRef);
    console.log("SCHEDULER_TICK", JSON.stringify({
      time: new Date().toLocaleTimeString(),
      activeBlocks: sortedActive.length,
      blocks: sortedActive.map(b => b.playlistName),
    }));

    const trackArrays = await Promise.all(
      sortedActive.map(async (b) => {
        const tracks = await fetchTracksRef.current(b.playlistId);
        if (b.shuffle) {
          const shuffled = [...tracks];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          return shuffled;
        }
        return tracks;
      })
    );

    const interleaved = [];
    const maxLen = Math.max(...trackArrays.map(a => a.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (let p = 0; p < trackArrays.length; p++) {
        if (i < trackArrays[p].length) {
          interleaved.push({
            ...trackArrays[p][i],
            playlistId: sortedActive[p].playlistId,
            playlistName: sortedActive[p].playlistName,
            playlistColor: sortedActive[p].playlistColor,
          });
        }
      }
    }

    console.log(
      "QUEUE_SAMPLE",
      JSON.stringify(
        interleaved.slice(0, 6).map((t) => ({
          title: t.title?.substring(0, 30),
          playlistName: t.playlistName,
          playlistId: !!t.playlistId,
        }))
      )
    );

    if (interleaved.length === 0) return;

    const queueKey = sortedActive.map(b => b.id).join(",");
    if (queueKey !== currentQueueKeyRef.current) {
      currentQueueKeyRef.current = queueKey;
      console.log("STARTING_PLAYBACK", queueKey, interleaved.length, "tracks");
      playerPlayRef.current(interleaved, 0);
    }
  }, []);

  useEffect(() => {
    runSchedulerTick();
    const id = setInterval(runSchedulerTick, 10000);
    return () => clearInterval(id);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────
  const handlePlaylistClick = useCallback(async (playlist, colorIndex) => {
    const tracks = await fetchPlaylistTracks(playlist.id);
    const totalDurationSeconds = tracks?.totalDuration ?? 0;
    const blockId = schedule.addBlock(playlist, colorIndex, totalDurationSeconds);
    setSelectedBlockId(blockId);
  }, [schedule, fetchPlaylistTracks]);

  const handleAddBlockFromDrop = useCallback((config) => {
    schedule.addBlockAt(config);
    fetchPlaylistTracks(config.playlistId);
  }, [schedule, fetchPlaylistTracks]);

  const handleBlockClick = useCallback((blockId) => {
    setSelectedBlockId(prev => prev === blockId ? null : blockId);
  }, []);

  const handleGridClick = useCallback(() => setSelectedBlockId(null), []);

  if (!authBootstrapped) {
    return (
      <div className="auth-loading">
        <span className="auth-loading-text">Loading…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="spotify-login">
        <div className="spotify-login-card">
          <h1 className="spotify-login-title">Tuneset</h1>
          <p className="spotify-login-sub">
            Connect YouTube Music to load your playlists and schedule playback.
          </p>
          <button
            type="button"
            className="spotify-login-btn yt-login-btn"
            onClick={handleConnectYouTubeMusic}
          >
            Connect YouTube Music
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        user={user}
        playlists={playlists}
        scheduleBlocks={schedule.scheduleBlocks}
        getPlaylistMeta={getPlaylistMeta}
        onPlaylistClick={handlePlaylistClick}
        onLogout={() => {
          localStorage.removeItem("yt_access_token");
          localStorage.removeItem("yt_token_expiry");
          localStorage.removeItem("yt_refresh_token");
          window.location.reload();
        }}
      />
      <div className="main">
        <div className="content">
          <ScheduleGrid
            scheduleBlocks={schedule.scheduleBlocks}
            selectedBlockId={selectedBlockId}
            onBlockClick={handleBlockClick}
            onGridClick={handleGridClick}
            onUpdateBlock={schedule.updateBlock}
            onRemoveBlock={schedule.removeBlock}
            onPlay={player.play}
            onAddBlock={handleAddBlockFromDrop}
            onBlocksReordered={handleBlocksReordered}
          />
        </div>
        <NowPlayingBar
          player={player}
          activeBlocks={getActiveBlocksOrderedForScheduler()}
          playlistTracksRef={playlistTracksRef}
        />
      </div>
    </div>
  );
}