import { useCallback, useEffect, useMemo, useRef } from "react";
import { formatDuration } from "../data/mockData";
import { getMusic } from "../services/appleMusic";
import "./NowPlayingBar.css";

export default function NowPlayingBar({
  player,
  musicSource,
  activeBlocks = [],
  playlistTracksRef,
  onAppleStart,
  onUpdateBlock: _onUpdateBlock,
}) {
  const {
    isPlaying, currentSong,
    progress, elapsed, volume,
    togglePlay,
    handleNext: playerHandleNext,
    handlePrev: playerHandlePrev,
    seek, setVolume,
    setAppleMusicIsPlaying,
    setAppleMusicNowPlaying,
    syncApplePlaybackProgress,
  } = player;

  const lastNextCallRef = useRef(0);

  const { currentPlaylistName, contextDotColor } = useMemo(() => {
    if (!currentSong || !activeBlocks.length) {
      return { currentPlaylistName: null, contextDotColor: activeBlocks[0]?.playlistColor };
    }
    const playlistTracks = playlistTracksRef.current;
    for (const block of activeBlocks) {
      const songs = playlistTracks.get(block.playlistId) ?? [];
      if (
        songs.some(
          (s) =>
            (s.videoId && s.videoId === currentSong.videoId) ||
            (s.appleMusicId && s.appleMusicId === currentSong.appleMusicId)
        )
      ) {
        return {
          currentPlaylistName: block.playlistName,
          contextDotColor: block.playlistColor,
        };
      }
    }
    return {
      currentPlaylistName: activeBlocks[0]?.playlistName ?? null,
      contextDotColor: activeBlocks[0]?.playlistColor,
    };
  }, [currentSong, activeBlocks, playlistTracksRef]);

  const handleScrubberClick = useCallback(async (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (musicSource === "apple") {
      const music = await getMusic();
      await music.seekToTime?.(frac * (currentSong?.duration ?? 0));
      syncApplePlaybackProgress?.(music);
      return;
    }
    seek(frac);
  }, [musicSource, currentSong?.duration, seek, syncApplePlaybackProgress]);

  const handleVolumeClick = useCallback(async (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (musicSource === "apple") {
      const music = await getMusic();
      music.volume = frac;
      setVolume(frac);
      return;
    }
    setVolume(frac);
  }, [musicSource, setVolume]);

  useEffect(() => {
    if (musicSource !== "apple" || !isPlaying) return undefined;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const music = await getMusic();
        if (cancelled) return;
        syncApplePlaybackProgress?.(music);
      } catch {
        /* ignore */
      }
    }, 500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [musicSource, isPlaying, syncApplePlaybackProgress]);

  const handleTogglePlay = useCallback(async () => {
    if (musicSource !== "apple") {
      togglePlay();
      return;
    }
    try {
      const music = await getMusic();
      if (isPlaying) {
        await music.pause();
        setAppleMusicIsPlaying?.(false);
      } else {
        await music.play();
        setAppleMusicIsPlaying?.(true);
      }
    } catch (err) {
      console.error("APPLE_TOGGLE_PLAY", err);
    }
  }, [musicSource, isPlaying, togglePlay, setAppleMusicIsPlaying]);

  const handleNext = useCallback(async () => {
    const now = Date.now();
    if (now - lastNextCallRef.current < 500) return;
    lastNextCallRef.current = now;

    if (musicSource === "apple") {
      try {
        const music = await getMusic();
        if (music.playbackState === 1 || music.playbackState === 8 || music.playbackState === 9) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        await music.skipToNextItem();
        const item = music.nowPlayingItem;
        if (item) {
          setAppleMusicNowPlaying?.({
            title: item.attributes?.name,
            artist: item.attributes?.artistName,
            artwork: item.attributes?.artwork?.url?.replace("{w}", "80").replace("{h}", "80"),
            duration: Math.floor((item.attributes?.durationInMillis ?? 0) / 1000),
            appleMusicId: item.id,
          });
        }
      } catch (e) {
        console.log("SKIP_NEXT_ERROR", e?.message);
      }
    } else {
      playerHandleNext();
    }
  }, [musicSource, playerHandleNext, setAppleMusicNowPlaying]);

  const handlePrev = useCallback(async () => {
    if (musicSource === "apple") {
      const music = await getMusic();
      await music.skipToPreviousItem();
      const item = music.nowPlayingItem;
      if (item) {
        setAppleMusicNowPlaying?.({
          title: item.attributes?.name,
          artist: item.attributes?.artistName,
          artwork: item.attributes?.artwork?.url?.replace("{w}", "80").replace("{h}", "80"),
          duration: Math.floor((item.attributes?.durationInMillis ?? 0) / 1000),
          appleMusicId: item.id,
        });
      }
    } else {
      playerHandlePrev();
    }
  }, [musicSource, playerHandlePrev, setAppleMusicNowPlaying]);

  const showAppleStartPlayback =
    musicSource === "apple" && !isPlaying && activeBlocks.length > 0;

  return (
    <div className="np-bar">
      {/* Left: track info */}
      <div className="np-left">
        <div
          className="np-art"
          style={{
            background: currentSong?.artwork ? "transparent" : "#333",
          }}
        >
          {currentSong?.artwork ? (
            <img src={currentSong.artwork} alt="" className="np-art-img" />
          ) : currentSong ? (
            <span className="np-art-icon">♫</span>
          ) : (
            <span className="np-art-icon np-art-idle">♫</span>
          )}
        </div>
        <div className="np-info">
          {currentSong ? (
            <>
              <span className="np-title">{currentSong.title}</span>
              <span className="np-artist">{currentSong.artist}</span>
            </>
          ) : (
            <>
              <span className="np-title np-idle">Nothing scheduled</span>
              <span className="np-artist">Add playlists to get started</span>
            </>
          )}
        </div>
        {activeBlocks.length > 0 && currentPlaylistName != null && (
          <div className="np-context">
            <span className="np-context-dot" style={{ background: contextDotColor }} />
            <span className="np-context-text">{currentPlaylistName}</span>
          </div>
        )}
      </div>

      {/* Center: controls + scrubber */}
      <div className="np-center">
        <div className="np-controls">
          <button className="np-btn np-btn-md" onClick={handlePrev} title="Previous">⏮</button>
          {showAppleStartPlayback ? (
            <button
              type="button"
              className="np-btn np-play np-play-start"
              onClick={() => onAppleStart?.()}
              title="Start Playback"
            >
              Start
            </button>
          ) : (
            <button
              type="button"
              className="np-btn np-play"
              onClick={handleTogglePlay}
              disabled={!currentSong}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
          )}
          <button className="np-btn np-btn-md" onClick={handleNext} title="Next" disabled={!currentSong}>⏭</button>
          <button className="np-btn np-btn-sm">↻</button>
        </div>

        <div className="np-scrubber-row">
          <span className="np-time">{currentSong ? formatDuration(elapsed) : "0:00"}</span>
          <div className="np-scrubber" onClick={handleScrubberClick}>
            <div className="np-scrubber-track">
              <div className="np-scrubber-fill" style={{ width: `${progress * 100}%` }} />
              <div className="np-scrubber-thumb" style={{ left: `${progress * 100}%` }} />
            </div>
          </div>
          <span className="np-time">{currentSong ? formatDuration(currentSong.duration) : "0:00"}</span>
        </div>
      </div>

      {/* Right: volume */}
      <div className="np-right">
        <span className="np-vol-icon">🔈</span>
        <div className="np-volume" onClick={handleVolumeClick}>
          <div className="np-volume-track">
            <div className="np-volume-fill" style={{ width: `${volume * 100}%` }} />
            <div className="np-volume-thumb" style={{ left: `${volume * 100}%` }} />
          </div>
        </div>
        <span className="np-vol-icon">🔊</span>
      </div>
    </div>
  );
}
