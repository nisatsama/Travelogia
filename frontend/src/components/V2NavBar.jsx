import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const V2_LINKS = [
  { to: "/travels", label: "Destinations" },
  { to: "/stays", label: "Stays" },
  { to: "/transport", label: "Transport" },
  { to: "/experiences", label: "Experiences" },
  { to: "/dashboard", label: "Trip Hub" },
  { to: "/wallet", label: "Wallet & Insurance" },
  { to: "/trip-builder", label: "AI Builder" },
  { to: "/budget-optimizer", label: "Budget" },
  { to: "/collaborate", label: "Collaborate" },
  { to: "/route-planner", label: "Routes" },
  { to: "/hidden-gems", label: "Hidden Gems" },
  { to: "/compare", label: "Compare" },
  { to: "/journal", label: "Journal" },
  { to: "/packing", label: "Packing" },
  { to: "/price-watcher", label: "Price Watch" },
];

export default function V2NavBar() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get("/notifications");
        if (!active) return;
        setNotifications(res.data?.data || []);
        setUnreadCount(Number(res.data?.unreadCount || 0));
      } catch {
        // fail silently in topbar bell
      }
    })();
    return () => {
      active = false;
    };
  }, [user, location.pathname]);

  const handleMarkRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  return (
    <header className="v2-navbar">
      <Link to="/" className="v2-navbar-brand">
        Travel<span>ogia</span>
      </Link>

      <nav className="v2-navbar-links" aria-label="Travelogia 2.0 Navigation">
        {V2_LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={location.pathname === item.to ? "v2-active-link" : ""}
          >
            {item.label}
          </Link>
        ))}

        {user ? (
          <>
            <div className="v2-notif-wrap">
              <button
                type="button"
                className="v2-notif-btn"
                onClick={() => setOpen((o) => !o)}
                aria-label="Open notifications"
              >
                🔔
                {unreadCount > 0 && <span className="v2-notif-badge">{unreadCount}</span>}
              </button>
              {open && (
                <div className="v2-notif-dropdown">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "10px",
                    }}
                  >
                    <strong>Notifications</strong>
                    <Link
                      to="/dashboard"
                      onClick={() => setOpen(false)}
                      style={{ color: "#2563eb", fontSize: "12px" }}
                    >
                      Dashboard &amp; Prefs
                    </Link>
                  </div>
                  {notifications.length === 0 ? (
                    <p style={{ fontSize: "13px", color: "#64748b" }}>
                      No alerts yet. Set target budget watchers in Price Watch.
                    </p>
                  ) : (
                    notifications.slice(0, 8).map((n) => (
                      <div
                        key={n._id}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "10px",
                          background: n.read ? "#f8fafc" : "#eff6ff",
                          marginBottom: "8px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ fontSize: "13px", fontWeight: 600 }}>{n.title}</div>
                        <div style={{ fontSize: "12px", color: "#475569", marginTop: "3px" }}>
                          {n.message}
                        </div>
                        {!n.read && (
                          <button
                            type="button"
                            className="v2-btn v2-btn-secondary v2-btn-sm"
                            style={{ marginTop: "6px" }}
                            onClick={() => handleMarkRead(n._id)}
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <Link to="/profile">Profile</Link>
          </>
        ) : (
          <Link to="/login">Login</Link>
        )}
      </nav>
    </header>
  );
}
