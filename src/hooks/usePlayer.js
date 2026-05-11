import { useState, useEffect, useRef, useCallback } from "react";
import { loadYouTubeAPI } from "../services/youtube";

export function usePlayer() {
  // ── All useState first, unconditionally ──────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSong, setCurrentSong] = useState(null);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [queue, setQueue] = useState([]);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  // ── All useRef after useState ────────────────────────────────────
  const playerRef = useRef(null);
  const pendingVideoRef = useRef(null);
  const queueRef = useRef([]);
  const indexRef = useRef(0);
  const progressInterval = useRef(null);
  const skippedRef = useRef(new Set());
  const shuffleRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { indexRef.current = currentSongIndex; }, [currentSongIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);

  // ── Init YouTube player on mount ─────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      await loadYouTubeAPI();
      if (!isMounted) return;

      setTimeout(() => {
        if (!isMounted || !window.YT?.Player) return;

        new window.YT.Player("yt-player", {
          videoId: "jNQXAC9IVRw",
          height: "1",
          width: "1",
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            mute: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              console.log("YT player ready");
              playerRef.current = event.target;
              event.target.unMute();
              event.target.setVolume(80);
              setPlayerReady(true);
              if (pendingVideoRef.current) {
                event.target.loadVideoById(pendingVideoRef.current);
                pendingVideoRef.current = null;
              }
            },
            onStateChange: (event) => {
              console.log(
                "YT_STATE",
                JSON.stringify({
                  state: event.data,
                  title: queueRef.current[indexRef.current]?.title?.substring(0, 30),
                  playlistName: queueRef.current[indexRef.current]?.playlistName,
                  index: indexRef.current,
                })
              );
              const YT = window.YT;
              if (event.data === YT.PlayerState.PLAYING) {
                setIsPlaying(true);
                const d = event.target.getDuration();
                if (d) setDuration(d);
              } else if (event.data === YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              } else if (event.data === YT.PlayerState.ENDED) {
                setIsPlaying(false);
                const findNextPlayable = (fromIdx) => {
                  const qc = queueRef.current;
                  for (let j = fromIdx; j < qc.length; j++) {
                    if (!skippedRef.current.has(qc[j]?.videoId)) return j;
                  }
                  return -1;
                };
                let nextIdx = findNextPlayable(indexRef.current + 1);
                if (nextIdx === -1) {
                  if (shuffleRef.current) {
                    const reshuffled = [...queueRef.current];
                    for (let i = reshuffled.length - 1; i > 0; i--) {
                      const j = Math.floor(Math.random() * (i + 1));
                      [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
                    }
                    queueRef.current = reshuffled;
                    setQueue(reshuffled);
                    indexRef.current = -1;
                  }
                  nextIdx = findNextPlayable(0);
                }
                if (nextIdx !== -1) {
                  const nextSong = queueRef.current[nextIdx];
                  indexRef.current = nextIdx;
                  setCurrentSongIndex(nextIdx);
                  setCurrentSong(nextSong);
                  setElapsed(0);
                  setProgress(0);
                  event.target.loadVideoById(nextSong.videoId);
                }
              }
            },
            onError: (event) => {
              let q = queueRef.current;
              const curIdx = indexRef.current;
              const cur = q[curIdx];
              console.log(
                "TRACK_ERROR",
                JSON.stringify({
                  errorCode: event.data,
                  videoId: queueRef.current[indexRef.current]?.videoId,
                  title: queueRef.current[indexRef.current]?.title,
                  playlistName: queueRef.current[indexRef.current]?.playlistName,
                })
              );
              if (cur?.videoId) skippedRef.current.add(cur.videoId);
              const playlistId = cur?.playlistId;

              const playable = (arr, j) => {
                const song = arr[j];
                return song && !skippedRef.current.has(song.videoId);
              };

              const findNextSamePlaylistFrom = (arr, from) => {
                if (playlistId == null) return -1;
                for (let j = from; j < arr.length; j++) {
                  if (!playable(arr, j)) continue;
                  if (arr[j].playlistId === playlistId) return j;
                }
                return -1;
              };

              const findNextAnyFrom = (arr, from) => {
                for (let j = from; j < arr.length; j++) {
                  if (playable(arr, j)) return j;
                }
                return -1;
              };

              const resolveNext = (arr) => {
                let idx = findNextSamePlaylistFrom(arr, curIdx + 1);
                if (idx === -1) idx = findNextAnyFrom(arr, curIdx + 1);
                if (idx === -1) {
                  idx = findNextSamePlaylistFrom(arr, 0);
                  if (idx === -1) idx = findNextAnyFrom(arr, 0);
                }
                return idx;
              };

              let nextIdx = resolveNext(q);

              if (nextIdx === -1) {
                const entireQueueInSkipped =
                  q.length > 0 &&
                  q.every((s) => s?.videoId && skippedRef.current.has(s.videoId));
                if (entireQueueInSkipped) {
                  console.log("All tracks unplayable, stopping");
                  setIsPlaying(false);
                  return;
                }
                if (shuffleRef.current) {
                  const reshuffled = [...queueRef.current];
                  for (let i = reshuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
                  }
                  queueRef.current = reshuffled;
                  setQueue(reshuffled);
                  indexRef.current = -1;
                  q = queueRef.current;
                  nextIdx = resolveNext(q);
                }
              }

              if (nextIdx === -1) {
                console.log("All tracks unplayable, stopping");
                setIsPlaying(false);
                return;
              }

              const nextSong = q[nextIdx];
              indexRef.current = nextIdx;
              setCurrentSongIndex(nextIdx);
              setCurrentSong(nextSong);
              setElapsed(0);
              setProgress(0);
              playerRef.current?.loadVideoById(nextSong.videoId);
            },
          },
        });
      }, 200);
    };

    init();
    return () => { isMounted = false; };
  }, []);

  // ── Progress ticker ──────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying && playerRef.current) {
      progressInterval.current = setInterval(() => {
        const t = playerRef.current?.getCurrentTime?.() ?? 0;
        const d = playerRef.current?.getDuration?.() ?? 1;
        setElapsed(Math.floor(t));
        setProgress(d > 0 ? t / d : 0);
      }, 500);
    } else {
      clearInterval(progressInterval.current);
    }
    return () => clearInterval(progressInterval.current);
  }, [isPlaying]);

  // ── Playback controls ────────────────────────────────────────────
  const play = useCallback((songQueue, startIndex = 0) => {
    if (!songQueue?.length) return;
    skippedRef.current = new Set();
    setQueue(songQueue);
    queueRef.current = songQueue;
    const song = songQueue[startIndex];
    setCurrentSong(song);
    setCurrentSongIndex(startIndex);
    indexRef.current = startIndex;
    setElapsed(0);
    setProgress(0);
    const p = playerRef.current;
    if (p?.loadVideoById) {
      p.loadVideoById(song.videoId);
    } else {
      pendingVideoRef.current = song.videoId;
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    const state = playerRef.current.getPlayerState?.();
    if (state === window.YT?.PlayerState?.PLAYING) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  }, []);

  const handleNext = useCallback(() => {
    const q = queueRef.current;
    let nextIdx = indexRef.current + 1;
    while (nextIdx < q.length && skippedRef.current.has(q[nextIdx].videoId)) {
      nextIdx += 1;
    }
    if (nextIdx >= q.length) return;
    const nextSong = q[nextIdx];
    indexRef.current = nextIdx;
    setCurrentSongIndex(nextIdx);
    setCurrentSong(nextSong);
    setElapsed(0);
    setProgress(0);
    playerRef.current?.loadVideoById(nextSong.videoId);
  }, []);

  const handlePrev = useCallback(() => {
    if (elapsed > 3) {
      playerRef.current?.seekTo(0, true);
      setElapsed(0);
      setProgress(0);
      return;
    }
    const q = queueRef.current;
    let prevIdx = indexRef.current - 1;
    while (prevIdx >= 0 && skippedRef.current.has(q[prevIdx].videoId)) {
      prevIdx -= 1;
    }
    if (prevIdx < 0) return;
    const prevSong = q[prevIdx];
    indexRef.current = prevIdx;
    setCurrentSongIndex(prevIdx);
    setCurrentSong(prevSong);
    setElapsed(0);
    setProgress(0);
    playerRef.current?.loadVideoById(prevSong.videoId);
  }, [elapsed]);

  const seek = useCallback((fraction) => {
    const d = playerRef.current?.getDuration?.() ?? 0;
    if (!d) return;
    const t = fraction * d;
    playerRef.current?.seekTo(t, true);
    setElapsed(Math.floor(t));
    setProgress(fraction);
  }, []);

  const setVolumeLevel = useCallback((v) => {
    setVolume(v);
    playerRef.current?.setVolume(Math.round(v * 100));
  }, []);

  const buildQueueAndPlay = useCallback((activeBlocks, playlistsData) => {
    if (!activeBlocks.length || !playlistsData.length) return;
    const lists = activeBlocks.map(b => {
      const pl = playlistsData.find(p => p.id === b.playlistId);
      return pl?.songs ?? [];
    }).filter(l => l.length > 0);
    if (!lists.length) return;
    const interleaved = [];
    const maxLen = Math.max(...lists.map(l => l.length));
    for (let i = 0; i < maxLen; i++) {
      for (const list of lists) {
        if (i < list.length) interleaved.push(list[i]);
      }
    }
    play(interleaved, 0);
  }, [play]);

  return {
    isPlaying, currentSong, currentSongIndex,
    progress, elapsed, duration, volume, shuffle,
    queue, playerReady,
    play, togglePlay, handleNext, handlePrev, seek,
    setVolume: setVolumeLevel, setShuffle,
    buildQueueAndPlay,
  };
}