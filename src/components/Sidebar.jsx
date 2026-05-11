import "./Sidebar.css";

const NAV = [
  { icon: "♪", label: "Library", active: true },
  { icon: "↓", label: "Downloaded" },
  { icon: "★", label: "Favorites" },
];

export default function Sidebar({ user, onLogout }) {
  const displayName = user?.name ?? "Guest";
  const avatarLetter = (user?.name?.trim?.()?.charAt(0) || "G").toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">♫</div>
        <span className="sidebar-logo-name">Tuneset</span>
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav">
        <p className="sidebar-section-label">BROWSE</p>
        {NAV.map(item => (
          <button key={item.label} className={`sidebar-nav-item ${item.active ? "active" : ""}`}>
            <span className="sidebar-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav">
        <p className="sidebar-section-label">APP</p>
        <button className="sidebar-nav-item">
          <span className="sidebar-nav-icon">⚙</span>
          <span>Settings</span>
        </button>
      </nav>

      <div className="sidebar-spacer" />

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
