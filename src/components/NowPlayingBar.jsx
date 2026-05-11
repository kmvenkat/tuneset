import { useCallback, useMemo } from "react";
import { formatDuration, DAYS, getCurrentDayIndex } from "../data/mockData";
import "./NowPlayingBar.css";

export default function NowPlayingBar({ player, activeBlocks, playlistTracksRef }) {
  const {
    isPlaying, currentSong,
    progress, elapsed, volume,
    shuffle, togglePlay, handleNext, handlePrev,
    seek, setVolume, setShuffle,
  } = player;

  const todayLabel = DAYS[getCurrentDayIndex()];

  const { currentPlaylistName, contextDotColor } = useMemo(() => {
    if (!currentSong || !activeBlocks.length) {
      return { currentPlaylistName: null, contextDotColor: activeBlocks[0]?.playlistColor };
    }
    const playlistTracks = playlistTracksRef.current;
    for (const block of activeBlocks) {
      const songs = playlistTracks.get(block.playlistId) ?? [];
      if (songs.some(s => s.videoId === currentSong.videoId)) {
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

  const handleScrubberClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    seek(Math.max(0, Math.min(1, frac)));
  }, [seek]);

  const handleVolumeClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    setVolume(Math.max(0, Math.min(1, frac)));
  }, [setVolume]);

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
            <span className="np-context-text">{currentPlaylistName} · {todayLabel}</span>
          </div>
        )}
      </div>

      {/* Center: controls + scrubber */}
      <div className="np-center">
        <div className="np-controls">
          <button
            className={`np-btn np-btn-sm ${shuffle ? "active" : ""}`}
            onClick={() => setShuffle(s => !s)}
            title="Shuffle"
          >⇄</button>
          <button className="np-btn np-btn-md" onClick={handlePrev} title="Previous">⏮</button>
          <button
            className="np-btn np-play"
            onClick={togglePlay}
            disabled={!currentSong}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
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
