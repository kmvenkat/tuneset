import { useState, useCallback, useEffect, useRef } from "react";
import { useSchedule } from "./hooks/useSchedule";
import { usePlayer } from "./hooks/usePlayer";
import { loadGsiClient, getYoutubePlaylistTracks } from "./services/youtube";
import {
  getMusic,
  getMyPlaylists,
  getPlaylistTracks as getApplePlaylistTracks,
  loadMusicKit,
  signIn,
} from "./services/appleMusic";
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

/** Blocks active for “now” from persisted schedule (avoids stale React state on first paint). */
function getNowPlayingFromStorage() {
  const now = new Date();
  const jsDay = now.getDay();
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  try {
    const blocks = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return blocks.filter((b) => {
      const start = b.startHour * 60 + b.startMinute;
      const end = b.endHour * 60 + b.endMinute;
      return b.days.includes(dayIndex) && currentMinutes >= start && currentMinutes < end;
    });
  } catch {
    return [];
  }
}

export default function App() {
  const schedule = useSchedule();
  const player = usePlayer();
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [musicSource, setMusicSource] = useState(null); // "youtube" | "apple"
  const [user, setUser] = useState(null);
  /** False until mount auth effect finishes (avoids login flash when restoring a session). */
  const [authBootstrapped, setAuthBootstrapped] = useState(() => {
    if (typeof localStorage === "undefined") return true;
    return (
      !localStorage.getItem("yt_access_token") &&
      !localStorage.getItem("apple_music_authorized")
    );
  });
  const musicSourceRef = useRef(null);
  const playlistTracksRef = useRef(new Map()); // playlistId -> songs[]
  const playlistHoverDebounceRef = useRef(null);
  /** Bumped when tracks cache is populated so Sidebar can re-read durations. */
  const [playlistTracksVersion, setPlaylistTracksVersion] = useState(0);

  useEffect(() => {
    musicSourceRef.current = musicSource;
  }, [musicSource]);
  const currentQueueKeyRef = useRef(null);
  /** Segment key → block ids left-to-right as reported by ScheduleGrid. */
  const blockOrderRef = useRef(new Map());
  /** Last built Apple interleaved queue (for shuffle rebuilds during playback). */
  const appleInterleavedQueueRef = useRef([]);
  const applePlaybackMusicRef = useRef(null);
  const applePlaybackHandlerRef = useRef(null);
  const applePlaybackItemHandlerRef = useRef(null);

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
    const appleAuthorized = localStorage.getItem("apple_music_authorized") === "true";

    if (!token && !appleAuthorized) {
      setIsAuthenticated(false);
      setMusicSource(null);
      setAuthBootstrapped(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        if (appleAuthorized) {
          const { loadMusicKit, getMyPlaylists } = await import("./services/appleMusic");
          await loadMusicKit();
          if (cancelled) return;
          const pls = await getMyPlaylists();
          if (cancelled) return;
          setPlaylists(pls);
          setMusicSource("apple");
          setIsAuthenticated(true);
          setUser({ name: "Apple Music", email: "", picture: null });
        } else if (token) {
          setMusicSource("youtube");
          setIsAuthenticated(true);
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
          } catch (e) {
            if (!cancelled) {
              console.error("Failed to load Google profile", e);
              setUser(null);
            }
          }
          if (!cancelled) loadPlaylists(token);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Auth bootstrap failed", e);
          if (appleAuthorized) {
            localStorage.removeItem("apple_music_authorized");
          }
          setUser(null);
          setPlaylists([]);
          setMusicSource(null);
          setIsAuthenticated(false);
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

  const handleConnectAppleMusic = useCallback(async () => {
    try {
      console.log("APPLE_AUTH_START");
      await loadMusicKit();
      console.log("APPLE_MUSICKIT_LOADED", !!window.MusicKit);
      const authorized = await signIn();
      console.log("APPLE_AUTHORIZED", authorized);
      localStorage.setItem("apple_music_authorized", "true");
      setMusicSource("apple");
      const pls = await getMyPlaylists();
      console.log("APPLE_PLAYLISTS", pls.length);
      setPlaylists(pls);
      setIsAuthenticated(true);
    } catch (e) {
      console.error("APPLE_AUTH_ERROR", e.message, e.stack);
    }
  }, []);

  const fetchPlaylistTracks = useCallback(async (playlistId) => {
    if (playlistTracksRef.current.has(playlistId)) {
      return playlistTracksRef.current.get(playlistId);
    }
    if (musicSource === "apple") {
      const songs = await getApplePlaylistTracks(playlistId);
      const totalDuration = songs.reduce((acc, t) => acc + (t.duration ?? 0), 0);
      songs.totalDuration = totalDuration;
      console.log("TRACKS_LOADED", playlistId, songs.length, "totalDuration", songs.totalDuration);
      playlistTracksRef.current.set(playlistId, songs);
      setPlaylistTracksVersion((v) => v + 1);
      return songs;
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
  }, [musicSource]);

  const handleAppleStart = useCallback(async () => {
    try {
      const activeBlocks = schedule.getNowPlaying();
      if (!activeBlocks.length) return;

      const sortedActive = sortActiveBlocksByGridVisualOrder(activeBlocks, blockOrderRef);

      const music = await getMusic();
      music.autoplay = true;

      const rawTrackArrays = await Promise.all(
        sortedActive.map(async (b) => {
          const res = await music.api.music(
            `/v1/me/library/playlists/${b.playlistId}/tracks`,
            { limit: 100 }
          );
          let rows = (res.data?.data ?? []).map((t) => ({
            ...t,
            playlistId: b.playlistId,
            playlistName: b.playlistName,
            playlistColor: b.playlistColor,
          }));
          if (b.shuffle) {
            rows = [...rows];
            for (let si = rows.length - 1; si > 0; si--) {
              const j = Math.floor(Math.random() * (si + 1));
              [rows[si], rows[j]] = [rows[j], rows[si]];
            }
          }
          return rows;
        })
      );

      console.log(
        "APPLE_RAW_TRACKS",
        rawTrackArrays.map((arr, i) => ({
          playlist: sortedActive[i].playlistName,
          count: arr.length,
        }))
      );

      const interleaved = [];
      const maxLen = Math.max(...rawTrackArrays.map((a) => a.length), 0);
      for (let i = 0; i < maxLen; i++) {
        for (let p = 0; p < rawTrackArrays.length; p++) {
          if (i < rawTrackArrays[p].length) {
            interleaved.push(rawTrackArrays[p][i]);
          }
        }
      }

      if (!interleaved.length) {
        console.log("APPLE_NO_TRACKS");
        return;
      }

      try {
        console.log("FIRST_TRACK", JSON.stringify(interleaved[0]));
      } catch (stringifyErr) {
        console.log("FIRST_TRACK", interleaved[0], stringifyErr?.message);
      }

      const mediaItems = interleaved.map((t) => ({
        id: t.attributes?.playParams?.id ?? t.id,
        type: "song",
        isLibrary: true,
        attributes: t.attributes,
      }));

      appleInterleavedQueueRef.current = interleaved;

      const syncNowPlayingItem = (item) => {
        if (!item) return;
        player.setAppleMusicNowPlaying?.({
          title: item.attributes?.name,
          artist: item.attributes?.artistName,
          artwork: item.attributes?.artwork?.url?.replace("{w}", "80").replace("{h}", "80"),
          duration: Math.floor((item.attributes?.durationInMillis ?? 0) / 1000),
          appleMusicId: item.id,
        });
        player.setAppleMusicIsPlaying?.(true);
      };

      try {
        await music.setQueue({ items: mediaItems, startWith: 0 });
        console.log("QUEUE_SET_SUCCESS", music.queue?.length);

        music.shuffleMode = window.MusicKit.PlayerShuffleMode.off;
        console.log("APPLE_SHUFFLE", "off (interleaved order)");

        music.addEventListener("nowPlayingItemDidChange", function handler(event) {
          const item = event?.item ?? music.nowPlayingItem;
          if (item) {
            syncNowPlayingItem(item);
          }
          music.removeEventListener("nowPlayingItemDidChange", handler);
        });

        await music.play();
        syncNowPlayingItem(music.nowPlayingItem);
        const queueKey = sortedActive.map((b) => b.playlistId).sort().join(",");
        currentQueueKeyRef.current = queueKey;
        console.log("APPLE_START_SUCCESS", music.isPlaying, music.nowPlayingItem?.attributes?.name);
      } catch (e) {
        console.log("QUEUE_ITEMS_FAIL", e?.message);
        // Final fallback: try passing playParams directly
        try {
          await music.setQueue({
            items: interleaved.map((t) => t.attributes?.playParams).filter(Boolean),
            startWith: 0,
          });
          console.log("QUEUE_PLAYPARAMS_SUCCESS", music.queue?.length);

          music.shuffleMode = window.MusicKit.PlayerShuffleMode.off;
          console.log("APPLE_SHUFFLE", "off (interleaved order)");

          music.addEventListener("nowPlayingItemDidChange", function handler(event) {
            const item = event?.item ?? music.nowPlayingItem;
            if (item) {
              syncNowPlayingItem(item);
            }
            music.removeEventListener("nowPlayingItemDidChange", handler);
          });

          await music.play();
          syncNowPlayingItem(music.nowPlayingItem);
          const queueKey = sortedActive.map((b) => b.playlistId).sort().join(",");
          currentQueueKeyRef.current = queueKey;
        } catch (e2) {
          console.log("QUEUE_PLAYPARAMS_FAIL", e2?.message);
        }
      }
    } catch (e) {
      console.error("APPLE_START_ERROR", e?.message);
    }
  }, [schedule.scheduleBlocks, player.setAppleMusicNowPlaying, player.setAppleMusicIsPlaying]);

  const onPlaylistHover = useCallback((playlistId) => {
    if (playlistTracksRef.current.has(playlistId)) return;
    if (playlistHoverDebounceRef.current) {
      clearTimeout(playlistHoverDebounceRef.current);
    }
    playlistHoverDebounceRef.current = setTimeout(async () => {
      playlistHoverDebounceRef.current = null;
      if (playlistTracksRef.current.has(playlistId)) return;
      try {
        const tracks = await fetchPlaylistTracks(playlistId);
        if (tracks?.length) {
          setPlaylists((prev) =>
            prev.map((p) =>
              p.id === playlistId ? { ...p, songCount: tracks.length } : p
            )
          );
        }
      } catch {}
    }, 300);
  }, [fetchPlaylistTracks]);

  useEffect(() => {
    return () => {
      if (playlistHoverDebounceRef.current) {
        clearTimeout(playlistHoverDebounceRef.current);
      }
    };
  }, []);

  const getPlaylistMeta = useCallback((playlistId) => {
    const tracks = playlistTracksRef.current.get(playlistId);
    return tracks ? { totalDuration: tracks.totalDuration ?? 0 } : null;
  }, [playlistTracksVersion]);

  useEffect(() => {
    if (!playlists.length) return;
    let cancelled = false;
    const timeouts = [];
    playlists.slice(0, 3).forEach((pl, i) => {
      timeouts.push(
        setTimeout(async () => {
          if (cancelled) return;
          try {
            const tracks = await fetchPlaylistTracks(pl.id);
            if (cancelled) return;
            if (tracks?.length) {
              setPlaylists((prev) =>
                prev.map((p) =>
                  p.id === pl.id ? { ...p, songCount: tracks.length } : p
                )
              );
            }
          } catch {}
        }, i * 1000)
      );
    });
    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [playlists, fetchPlaylistTracks]);

  const playerPlayRef = useRef(player.play);
  useEffect(() => {
    playerPlayRef.current = player.play;
  }, [player.play]);

  const playerSetAppleMusicNowPlayingRef = useRef(player.setAppleMusicNowPlaying);
  useEffect(() => {
    playerSetAppleMusicNowPlayingRef.current = player.setAppleMusicNowPlaying;
  }, [player.setAppleMusicNowPlaying]);

  const fetchTracksRef = useRef(fetchPlaylistTracks);
  useEffect(() => {
    fetchTracksRef.current = fetchPlaylistTracks;
  }, [fetchPlaylistTracks]);

  const handleBlocksReordered = useCallback((segmentKey, blockIds) => {
    blockOrderRef.current.set(segmentKey, [...blockIds]);
  }, []);

  const handleBlockShuffleToggle = useCallback(async (blockId, shuffleOn) => {
    if (musicSourceRef.current !== "apple") return;
    const music = await getMusic();
    if (!music.isPlaying) return;

    const currentItem = music.nowPlayingItem;
    const currentId = currentItem?.attributes?.playParams?.id ?? currentItem?.id;
    const queue = appleInterleavedQueueRef.current;
    if (!queue?.length) return;

    const currentIdx = queue.findIndex(
      (t) =>
        t.attributes?.playParams?.id === currentId || t.id === currentId
    );
    const remaining = currentIdx >= 0 ? queue.slice(currentIdx + 1) : queue;

    const byPlaylist = new Map();
    for (const track of remaining) {
      if (!byPlaylist.has(track.playlistId)) byPlaylist.set(track.playlistId, []);
      byPlaylist.get(track.playlistId).push(track);
    }

    const toggledBlock = schedule.scheduleBlocks.find((b) => b.id === blockId);
    if (toggledBlock && byPlaylist.has(toggledBlock.playlistId)) {
      const tracks = byPlaylist.get(toggledBlock.playlistId);
      if (shuffleOn) {
        for (let i = tracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
        }
      } else {
        const cached = playlistTracksRef.current.get(toggledBlock.playlistId);
        if (cached) {
          const cachedIds = cached.map((t) => t.appleMusicId ?? t.id);
          tracks.sort((a, b) => {
            const ai = cachedIds.indexOf(a.attributes?.playParams?.id ?? a.id);
            const bi = cachedIds.indexOf(b.attributes?.playParams?.id ?? b.id);
            return ai - bi;
          });
        }
      }
    }

    const sortedActive = sortActiveBlocksByGridVisualOrder(
      getActiveBlocksOrderedForScheduler(),
      blockOrderRef
    );
    const playlistIds = sortedActive.map((b) => b.playlistId);
    const arrays = playlistIds.map((id) => byPlaylist.get(id) ?? []);
    const newQueue = [];
    const maxLen = Math.max(...arrays.map((a) => a.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const arr of arrays) {
        if (i < arr.length) newQueue.push(arr[i]);
      }
    }

    if (!newQueue.length) return;

    appleInterleavedQueueRef.current = newQueue;
    const mediaItems = newQueue.map((t) => ({
      id: t.attributes?.playParams?.id ?? t.id,
      type: "song",
      isLibrary: true,
      attributes: t.attributes,
    }));

    await music.setQueue({ items: mediaItems, startWith: 0 });
    music.shuffleMode = window.MusicKit.PlayerShuffleMode.off;
    await music.play();
    console.log("APPLE_SHUFFLE_REBUILT", newQueue.length, "tracks");
  }, [schedule.scheduleBlocks]);

  // ── Scheduler ─────────────────────────────────────────────────────
  const runSchedulerTick = useCallback(async () => {
    const src = musicSourceRef.current;
    if (src === "youtube" && !localStorage.getItem("yt_access_token")) return;
    if (src === "apple" && localStorage.getItem("apple_music_authorized") !== "true") return;
    if (!src) return;

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

    const queueKey = sortedActive.map((b) => b.playlistId).sort().join(",");
    if (queueKey === currentQueueKeyRef.current) {
      if (musicSourceRef.current === "apple") {
        console.log("APPLE_ALREADY_PLAYING_SKIP");
      }
      return;
    }

    if (musicSourceRef.current === "apple") {
      const music = await getMusic();
      const isPlaying = music.isPlaying;
      const prevKey = currentQueueKeyRef.current;

      if (isPlaying) {
        console.log("APPLE_QUEUE_APPEND", sortedActive.map((b) => b.playlistName));

        const newPlIds = sortedActive
          .map((b) => b.playlistId)
          .filter((id) => !(prevKey ?? "").split(",").filter(Boolean).includes(id));

        if (!newPlIds.length) {
          console.log("APPLE_APPEND_SKIP", "no new playlist tracks");
          return;
        }

        try {
          const rawNewTracks = await Promise.all(
            sortedActive
              .filter((b) => newPlIds.includes(b.playlistId))
              .map(async (b) => {
                const res = await music.api.music(
                  `/v1/me/library/playlists/${b.playlistId}/tracks`,
                  { limit: 100 }
                );
                return (res.data?.data ?? []).map((t) => ({
                  ...t,
                  playlistId: b.playlistId,
                  playlistName: b.playlistName,
                  playlistColor: b.playlistColor,
                }));
              })
          );

          console.log("RAW_NEW_TRACKS", JSON.stringify({
            newPlIds,
            counts: rawNewTracks.map((arr, i) => ({
              playlist: sortedActive.filter((b) => newPlIds.includes(b.playlistId))[i]?.playlistName,
              count: arr.length,
              firstId: arr[0]?.id,
            })),
          }));

          const newRawFlat = rawNewTracks.flat();

          if (!newRawFlat.length) {
            console.log("APPLE_APPEND_SKIP", "no raw tracks from new playlists");
            return;
          }

          const currentPosition = music.queue.position ?? 0;
          const currentQueue = appleInterleavedQueueRef.current ?? [];
          const remainingFromRef = currentQueue.slice(currentPosition + 1);

          const arrays = [newRawFlat, remainingFromRef];
          const combinedTracks = [];
          const maxLen = Math.max(...arrays.map((a) => a.length));
          for (let i = 0; i < maxLen; i++) {
            for (const arr of arrays) {
              if (i < arr.length) combinedTracks.push(arr[i]);
            }
          }
          appleInterleavedQueueRef.current = combinedTracks;

          const mediaItems = combinedTracks.map((t) => ({
            id: t.attributes?.playParams?.id ?? t.id,
            type: "song",
            isLibrary: true,
            attributes: t.attributes,
          })).filter((d) => d.id);

          if (!mediaItems.length) return;

          currentQueueKeyRef.current = queueKey;

          await music.setQueue({ items: mediaItems, startWith: 1 });
          music.shuffleMode = window.MusicKit.PlayerShuffleMode.off;
          await music.play();
          console.log("APPLE_TRANSITION_SUCCESS", mediaItems.length, "tracks");
        } catch (e) {
          console.log("APPLE_TRANSITION_FAIL", e?.message);
        }
      } else {
        currentQueueKeyRef.current = queueKey;
        console.log("STARTING_PLAYBACK", queueKey, interleaved.length, "tracks");
        appleInterleavedQueueRef.current = interleaved;
      }
    } else {
      currentQueueKeyRef.current = queueKey;
      console.log("STARTING_PLAYBACK", queueKey, interleaved.length, "tracks");
      playerPlayRef.current(interleaved, 0);
    }
  }, []);

  useEffect(() => {
    runSchedulerTick();
    const id = setInterval(runSchedulerTick, 10000);
    return () => {
      clearInterval(id);
      const m = applePlaybackMusicRef.current;
      if (m) {
        const h = applePlaybackHandlerRef.current;
        const ih = applePlaybackItemHandlerRef.current;
        if (h) m.removeEventListener("playbackStateDidChange", h);
        if (ih) m.removeEventListener("nowPlayingItemDidChange", ih);
        applePlaybackMusicRef.current = null;
        applePlaybackHandlerRef.current = null;
        applePlaybackItemHandlerRef.current = null;
      }
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────
  const handlePlaylistClick = useCallback((playlist) => {
    const blockId = schedule.addBlock(playlist);
    setSelectedBlockId(blockId);
    fetchPlaylistTracks(playlist.id).catch(() => {});
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
            Connect YouTube Music or Apple Music to load your playlists and schedule playback.
          </p>
          <div className="spotify-login-actions">
            <button
              type="button"
              className="spotify-login-btn yt-login-btn"
              onClick={handleConnectYouTubeMusic}
            >
              Connect YouTube Music
            </button>
            <button
              type="button"
              className="spotify-login-btn apple-login-btn"
              onClick={handleConnectAppleMusic}
            >
              Connect Apple Music
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        user={user}
        musicSource={musicSource}
        playlists={playlists}
        scheduleBlocks={schedule.scheduleBlocks}
        getPlaylistMeta={getPlaylistMeta}
        onPlaylistClick={handlePlaylistClick}
        onPlaylistHover={onPlaylistHover}
        onLogout={() => {
          localStorage.removeItem("yt_access_token");
          localStorage.removeItem("yt_token_expiry");
          localStorage.removeItem("yt_refresh_token");
          localStorage.removeItem("apple_music_authorized");
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
            onShuffleToggle={handleBlockShuffleToggle}
            onRemoveBlock={schedule.removeBlock}
            onPlay={player.play}
            onAddBlock={handleAddBlockFromDrop}
            onBlocksReordered={handleBlocksReordered}
          />
        </div>
        <NowPlayingBar
          player={player}
          musicSource={musicSource}
          activeBlocks={getNowPlayingFromStorage()}
          playlistTracksRef={playlistTracksRef}
          onAppleStart={handleAppleStart}
        />
      </div>
    </div>
  );
}