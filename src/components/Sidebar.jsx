import { useMemo, useState } from "react";
import "./Sidebar.css";

const PLAYLIST_ACCENT_COLORS = [
  "#1DB954",
  "#E8115B",
  "#509BF5",
  "#AF2896",
  "#F573A0",
  "#FFD200",
  "#9BF0E1",
];

/** `totalSeconds` is playlist wall-clock duration in seconds. */
function formatPlaylistDuration(totalSeconds) {
  const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
  if (totalMinutes < 60) {
    return totalMinutes === 1 ? "1 min" : `${totalMinutes} mins`;
  }
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function Sidebar({
  user,
  musicSource,
  onLogout,
  playlists = [],
  scheduleBlocks = [],
  getPlaylistMeta,
  onPlaylistClick,
  onPlaylistHover,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const displayName = user?.name ?? "Guest";
  const avatarLetter = (user?.name?.trim?.()?.charAt(0) || "G").toUpperCase();

  const filteredPlaylists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((pl) => (pl.name ?? "").toLowerCase().includes(q));
  }, [playlists, searchQuery]);

  const blocksByPlaylist = useMemo(() => {
    const m = new Map();
    for (const b of scheduleBlocks) {
      m.set(b.playlistId, (m.get(b.playlistId) ?? 0) + 1);
    }
    return m;
  }, [scheduleBlocks]);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">♫</div>
        <span className="sidebar-logo-name">Tuneset</span>
      </div>

      <div className="sidebar-playlists">
        <p className="sidebar-section-label">PLAYLISTS</p>
        <div className="sidebar-search">
          <input
            type="search"
            className="sidebar-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search playlists..."
            aria-label="Search playlists"
          />
        </div>
        <div className="sidebar-playlist-scroll">
          {filteredPlaylists.map((pl, i) => {
            const count = blocksByPlaylist.get(pl.id) ?? 0;
            const origIdx = playlists.findIndex((p) => p.id === pl.id);
            const colorIdx = origIdx >= 0 ? origIdx : i;
            const clickIdx = origIdx >= 0 ? origIdx : i;
            const accent = pl.color ?? PLAYLIST_ACCENT_COLORS[colorIdx % PLAYLIST_ACCENT_COLORS.length];
            const coverUrl = pl.artwork ?? null;
            const n = pl.songCount ?? 0;
            const songsLabel = `${n} song${n === 1 ? "" : "s"}`;
            const meta = getPlaylistMeta?.(pl.id);
            const subline =
              meta != null
                ? `${songsLabel} · ${formatPlaylistDuration(meta.totalDuration)}`
                : songsLabel;
            return (
              <div
                key={pl.id}
                role="button"
                tabIndex={0}
                className="sidebar-pl-row"
                style={{ "--pl-accent": accent }}
                draggable
                onMouseEnter={() => onPlaylistHover?.(pl.id)}
                onClick={() => onPlaylistClick?.(pl, clickIdx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPlaylistClick?.(pl, clickIdx);
                  }
                }}
                onDragStart={(e) => {
                  e.dataTransfer.setData("playlistId", pl.id);
                  e.dataTransfer.setData("playlistName", pl.name);
                  e.dataTransfer.setData("playlistColor", accent);
                  e.dataTransfer.setData(
                    "playlistSongCount",
                    String(pl.songCount ?? 10)
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <div className="sidebar-pl-thumb">
                  {coverUrl ? (
                    <img className="sidebar-pl-thumb-img" src={coverUrl} alt="" />
                  ) : (
                    <span className="sidebar-pl-thumb-fallback" aria-hidden>♪</span>
                  )}
                </div>
                <div className="sidebar-pl-text">
                  <span className="sidebar-pl-name">{pl.name}</span>
                  <span className="sidebar-pl-meta">{subline}</span>
                </div>
                {count > 0 && <span className="sidebar-pl-count">{count}</span>}
                <button
                  type="button"
                  className="sidebar-pl-add"
                  aria-label={`Add ${pl.name} to schedule`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlaylistClick?.(pl, clickIdx);
                  }}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sidebar-user">
        <div className="sidebar-avatar">
          {user?.picture ? (
            <img src={user.picture} alt="" className="sidebar-avatar-img" />
          ) : (
            avatarLetter
          )}
        </div>
        <div className="sidebar-user-info">
          <span className="sidebar-user-name">{displayName}</span>
          <span className="sidebar-user-sub">
            {musicSource === "apple" ? "Apple Music" : "YouTube Music"}
          </span>
          <button
            type="button"
            className="sidebar-signout"
            onClick={() => {
              localStorage.removeItem("yt_access_token");
              localStorage.removeItem("yt_token_expiry");
              localStorage.removeItem("yt_refresh_token");
              localStorage.removeItem("apple_music_authorized");
              if (onLogout) onLogout();
              window.location.reload();
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
