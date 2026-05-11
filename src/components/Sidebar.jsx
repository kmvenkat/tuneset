import { useMemo } from "react";
import { PLAYLIST_ACCENT_COLORS } from "../hooks/useSchedule";
import "./Sidebar.css";

export default function Sidebar({
  user,
  onLogout,
  playlists = [],
  scheduleBlocks = [],
  onPlaylistClick,
}) {
  const displayName = user?.name ?? "Guest";
  const avatarLetter = (user?.name?.trim?.()?.charAt(0) || "G").toUpperCase();

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
        <div className="sidebar-playlist-scroll">
          {playlists.map((pl, i) => {
            const count = blocksByPlaylist.get(pl.id) ?? 0;
            const accent = pl.color ?? PLAYLIST_ACCENT_COLORS[i % PLAYLIST_ACCENT_COLORS.length];
            const coverUrl = pl.artwork ?? null;
            return (
              <div
                key={pl.id}
                role="button"
                tabIndex={0}
                className="sidebar-pl-row"
                draggable
                onClick={() => onPlaylistClick?.(pl, i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPlaylistClick?.(pl, i);
                  }
                }}
                onDragStart={(e) => {
                  e.dataTransfer.setData("playlistId", pl.id);
                  e.dataTransfer.setData("playlistName", pl.name);
                  e.dataTransfer.setData("playlistColor", accent);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <div className="sidebar-pl-thumb" style={{ "--pl-accent": accent }}>
                  {coverUrl ? (
                    <img className="sidebar-pl-thumb-img" src={coverUrl} alt="" />
                  ) : (
                    <span className="sidebar-pl-thumb-fallback" aria-hidden>♪</span>
                  )}
                </div>
                <span className="sidebar-pl-name">{pl.name}</span>
                {count > 0 && <span className="sidebar-pl-count">{count}</span>}
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
          <span className="sidebar-user-sub">YouTube Music</span>
          <button
            type="button"
            className="sidebar-signout"
            onClick={() => {
              localStorage.removeItem("yt_access_token");
              localStorage.removeItem("yt_token_expiry");
              localStorage.removeItem("yt_refresh_token");
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
