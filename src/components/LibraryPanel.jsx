import { useMemo } from "react";
import { PLAYLIST_ACCENT_COLORS } from "../hooks/useSchedule";
import "./LibraryPanel.css";

export default function LibraryPanel({ playlists = [], scheduleBlocks, onPlaylistClick }) {
  const scheduledIds = useMemo(() =>
    new Set(scheduleBlocks.map(b => b.playlistId)),
    [scheduleBlocks]
  );

  return (
    <aside className="library-panel">
      <div className="library-header">
        <h2 className="library-title">Library</h2>
        {scheduledIds.size > 0 && (
          <span className="library-badge">{scheduledIds.size} scheduled</span>
        )}
      </div>

      <div className="library-search">
        <span className="library-search-icon">⌕</span>
        <input
          className="library-search-input"
          type="text"
          placeholder="Search playlists…"
          readOnly
        />
      </div>

      <p className="library-section-label">PLAYLISTS</p>

      <div className="library-list">
        {playlists.map((pl, i) => {
          const isScheduled = scheduledIds.has(pl.id);
          const blockCount = scheduleBlocks.filter(b => b.playlistId === pl.id).length;
          const color = PLAYLIST_ACCENT_COLORS[i % PLAYLIST_ACCENT_COLORS.length];
          const coverUrl = pl.artwork ?? null;
          return (
            <button
              key={pl.id}
              className={`library-item ${isScheduled ? "scheduled" : ""}`}
              onClick={() => onPlaylistClick(pl, i)}
              style={{ "--pl-color": color }}
            >
              {isScheduled && <div className="library-item-stripe" />}
              <div className="library-item-art" style={{ "--pl-color": color }}>
                {coverUrl ? (
                  <img className="library-item-cover" src={coverUrl} alt="" />
                ) : (
                  <span className="library-item-art-icon">♪</span>
                )}
              </div>
              <div className="library-item-info">
                <span className="library-item-name">{pl.name}</span>
                <span className="library-item-meta">{pl.songCount ?? 0} songs</span>
              </div>
              {isScheduled ? (
                <div className="library-item-check">
                  {blockCount > 1 ? blockCount : "✓"}
                </div>
              ) : (
                <div className="library-item-add">+</div>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
