import { useEffect, useRef } from "react";
import "./QueueDrawer.css";

function trackKey(t, i) {
  return t.appleMusicId || t.videoId || `row-${i}`;
}

function rowTitle(t) {
  return t.title ?? t.attributes?.name ?? "";
}

function rowArtist(t) {
  return t.artist ?? t.attributes?.artistName ?? "";
}

export default function QueueDrawer({
  isOpen,
  onClose,
  queue = [],
  currentIndex = 0,
}) {
  const currentRowRef = useRef(null);

  useEffect(() => {
    if (currentRowRef.current) {
      currentRowRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [currentIndex]);

  return (
    <div
      className={`queue-drawer ${isOpen ? "queue-drawer--open" : ""}`}
      aria-hidden={!isOpen}
    >
      <div className="queue-drawer-panel">
        <header className="queue-drawer-header">
          <h2 className="queue-drawer-title">Up Next</h2>
          <button
            type="button"
            className="queue-drawer-close"
            onClick={onClose}
            aria-label="Close queue"
          >
            ×
          </button>
        </header>
        <div className="queue-drawer-list">
          {queue.map((track, index) => {
            const isCurrent = index === currentIndex;
            const color = track.playlistColor ?? "#666";
            return (
              <div
                key={trackKey(track, index)}
                ref={index === currentIndex ? currentRowRef : null}
                className={`queue-drawer-row ${isCurrent ? "queue-drawer-row--current" : ""}`}
              >
                <span
                  className="queue-drawer-dot"
                  style={{ background: color }}
                  aria-hidden
                />
                <div className="queue-drawer-meta">
                  <div className="queue-drawer-track-title">{rowTitle(track)}</div>
                  <div className="queue-drawer-track-artist">{rowArtist(track)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
