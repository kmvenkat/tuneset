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
  const consecutiveErrors = useRef(0);

  // Keep refs in sync
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { indexRef.current = currentSongIndex; }, [currentSongIndex]);

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
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            mute: 1,
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
              const YT = window.YT;
              if (event.data === YT.PlayerState.PLAYING) {
                consecutiveErrors.current = 0;
                setIsPlaying(true);
                const d = event.target.getDuration();
                if (d) setDuration(d);
              } else if (event.data === YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              } else if (event.data === YT.PlayerState.ENDED) {
                setIsPlaying(false);
                const nextIdx = indexRef.current + 1;
                if (nextIdx < queueRef.current.length) {
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
              console.error("YT player error", event.data);
              consecutiveErrors.current = (consecutiveErrors.current || 0) + 1;
              if (consecutiveErrors.current < 3) {
                const nextIdx = indexRef.current + 1;
                if (nextIdx < queueRef.current.length) {
                  const nextSong = queueRef.current[nextIdx];
                  indexRef.current = nextIdx;
                  setCurrentSongIndex(nextIdx);
                  setCurrentSong(nextSong);
                  playerRef.current?.loadVideoById(nextSong.videoId);
                }
              } else {
                console.warn("Too many consecutive errors, stopping playback");
                consecutiveErrors.current = 0;
              }
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
    const nextIdx = indexRef.current + 1;
    if (nextIdx >= queueRef.current.length) return;
    const nextSong = queueRef.current[nextIdx];
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
    const prevIdx = Math.max(0, indexRef.current - 1);
    const prevSong = queueRef.current[prevIdx];
    if (!prevSong) return;
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