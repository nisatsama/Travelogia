import React, { useEffect, useState } from "react";
import {
  FaUserCircle,
  FaHeart,
  FaSuitcaseRolling,
  FaSignOutAlt,
  FaCalendarCheck,
  FaEdit,
  FaGlobe,
  FaUserShield,
} from "react-icons/fa";
import { useNavigate, Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import "./Profile.css";

const Profile = () => {
  const { logout, updateUserState, toggleFavorite } = useAuth();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState({
    tripsBooked: 0,
    wishlistItems: 0,
    upcomingTrips: 0,
    countriesBooked: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [toast, setToast] = useState("");

  // Edit profile modal state
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    username: "",
    bio: "",
    phone: "",
    location: "",
  });

  // Busy states for actions
  const [cancellingId, setCancellingId] = useState(null);
  const [removingFavId, setRemovingFavId] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get("/profile");
        if (!active) return;
        const data = res.data || {};
        setUser(data.user || null);
        setFavorites(data.favorites || []);
        setBookings(data.bookings || []);
        if (data.stats) {
          setStats(data.stats);
        }
        if (data.user) {
          setEditForm({
            username: data.user.username || "",
            bio: data.user.bio || "",
            phone: data.user.phone || "",
            location: data.user.location || "",
          });
        }
        setError("");
      } catch (err) {
        if (!active) return;
        if (err.response?.status === 401) {
          navigate("/login", {
            state: { from: "/profile", message: "Please sign in to view your profile." },
          });
          return;
        }
        setError(getErrorMessage(err, "Unable to load your profile right now."));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [navigate, reloadNonce]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setEditError("");
    if (editForm.username.trim().length < 2) {
      setEditError("Username must be at least 2 characters.");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await api.put("/profile", {
        username: editForm.username.trim(),
        bio: editForm.bio.trim(),
        phone: editForm.phone.trim(),
        location: editForm.location.trim(),
      });
      if (res.data?.user) {
        setUser(res.data.user);
        updateUserState(res.data.user);
      }
      setEditing(false);
      showToast("Profile updated successfully");
    } catch (err) {
      setEditError(getErrorMessage(err, "Could not save profile changes."));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    setCancellingId(bookingId);
    try {
      const res = await api.patch(`/bookings/${bookingId}/cancel`);
      const updated = res.data?.booking;
      setBookings((prev) =>
        prev.map((b) =>
          b._id === bookingId
            ? { ...b, status: updated?.status || "cancelled" }
            : b,
        ),
      );
      setStats((prev) => ({
        ...prev,
        upcomingTrips: Math.max(0, prev.upcomingTrips - 1),
      }));
      showToast("Booking cancelled");
    } catch (err) {
      showToast(getErrorMessage(err, "Unable to cancel booking."));
    } finally {
      setCancellingId(null);
    }
  };

  const handleRemoveFavorite = async (travelId) => {
    if (!travelId) return;
    setRemovingFavId(travelId);
    try {
      await toggleFavorite(travelId);
      setFavorites((prev) =>
        prev.filter((fav) => (fav.travel?._id || fav.travel) !== travelId),
      );
      setStats((prev) => ({
        ...prev,
        wishlistItems: Math.max(0, prev.wishlistItems - 1),
      }));
      showToast("Removed from favorites");
    } catch (err) {
      showToast(getErrorMessage(err, "Could not remove favorite."));
    } finally {
      setRemovingFavId(null);
    }
  };

  if (loading) {
    return (
      <div className="Profile-loading">
        <span className="state-spinner" />
        <span style={{ marginLeft: "10px" }}>Loading Profile...</span>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="profile-Profile">
        <div className="state-error-banner">
          <p>{error || "Unable to load profile."}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError("");
              setReloadNonce((n) => n + 1);
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-Profile">
      <div className="profile-topbar-nav">
        <Link to="/">← Home</Link>
        <div className="profile-topbar-links">
          <Link to="/travels">Destinations</Link>
          <Link to="/packages">Packages</Link>
          {user.role === "admin" && (
            <Link to="/admin-profile" className="profile-admin-pill">
              <FaUserShield /> Admin Dashboard
            </Link>
          )}
        </div>
      </div>

      {/* PROFILE HEADER */}
      <div className="profile-card">
        <div className="profile-avatar">
          <FaUserCircle />
        </div>

        <div className="profile-info">
          <h1>{user.username}</h1>
          <p>{user.email}</p>
          {user.bio && <p className="profile-bio-text">{user.bio}</p>}
          {(user.location || user.phone) && (
            <p className="profile-meta-line">
              {user.location ? `📍 ${user.location}` : ""}
              {user.location && user.phone ? " · " : ""}
              {user.phone ? `📞 ${user.phone}` : ""}
            </p>
          )}
          <span className="badge">
            {user.role === "admin" ? "🛡️ Administrator" : "✨ Travelogia Member"}
          </span>
        </div>

        <div className="profile-actions">
          <button
            type="button"
            className="edit-btn"
            onClick={() => {
              setEditError("");
              setEditForm({
                username: user.username || "",
                bio: user.bio || "",
                phone: user.phone || "",
                location: user.location || "",
              });
              setEditing(true);
            }}
          >
            <FaEdit />
            Edit Profile
          </button>

          <button type="button" className="logout-btn" onClick={handleLogout}>
            <FaSignOutAlt />
            Logout
          </button>
        </div>
      </div>

      {/* REAL DATABASE-DERIVED STATS */}
      <div className="stats-grid">
        <div className="stat-card">
          <FaSuitcaseRolling />
          <h2>{stats.tripsBooked ?? bookings.length}</h2>
          <p>Total Bookings</p>
        </div>

        <div className="stat-card">
          <FaHeart />
          <h2>{stats.wishlistItems ?? favorites.length}</h2>
          <p>Favorites</p>
        </div>

        <div className="stat-card">
          <FaCalendarCheck />
          <h2>{stats.upcomingTrips ?? 0}</h2>
          <p>Upcoming Trips</p>
        </div>

        <div className="stat-card">
          <FaGlobe />
          <h2>{stats.countriesBooked ?? 0}</h2>
          <p>Countries Booked</p>
        </div>
      </div>

      {/* BOOKINGS */}
      <section className="Profile-section">
        <h2>✈ My Bookings</h2>

        {bookings.length === 0 ? (
          <div className="state-empty-box">
            <h3>No bookings yet</h3>
            <p>Browse our 70+ curated destinations and reserve your next trip.</p>
            <Link to="/travels" className="edit-btn" style={{ display: "inline-flex", marginTop: "12px", textDecoration: "none" }}>
              Explore Destinations
            </Link>
          </div>
        ) : (
          <div className="booking-grid">
            {bookings.map((booking) => {
              const travelObj = booking.travel && typeof booking.travel === "object" ? booking.travel : null;
              const isCancelled = booking.status === "cancelled";
              return (
                <div className="booking-card" key={booking._id}>
                  <img
                    src={
                      travelObj?.image?.url ||
                      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=800&auto=format&fit=crop"
                    }
                    alt={travelObj?.title || booking.destination || "Travel"}
                  />

                  <h3>{travelObj?.title || booking.destination}</h3>

                  {booking.bookingReference && (
                    <p className="profile-booking-ref">
                      Ref: <strong>{booking.bookingReference}</strong>
                    </p>
                  )}

                  {travelObj?.city && (
                    <p>
                      📍 {travelObj.city}
                      {travelObj.country ? `, ${travelObj.country}` : ""}
                    </p>
                  )}

                  <p>
                    📅{" "}
                    {booking.startDate || booking.date
                      ? new Date(booking.startDate || booking.date).toLocaleDateString()
                      : "N/A"}
                  </p>

                  <p>👥 Travelers: {booking.travelers}</p>

                  <p>⏳ Duration: {booking.duration} days</p>

                  <p>💰 Est. Total: ${booking.totalCost}</p>

                  <div className="profile-booking-footer">
                    <span className={isCancelled ? "profile-status-cancelled" : "confirmed"}>
                      {isCancelled ? "Cancelled" : "Confirmed"}
                    </span>

                    {!isCancelled && (
                      <button
                        type="button"
                        className="profile-cancel-btn"
                        disabled={cancellingId === booking._id}
                        onClick={() => handleCancelBooking(booking._id)}
                      >
                        {cancellingId === booking._id ? "Cancelling..." : "Cancel Trip"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* FAVORITES */}
      <section className="Profile-section">
        <h2>❤️ Favorite Destinations</h2>

        {favorites.length === 0 ? (
          <div className="state-empty-box">
            <h3>No favorites saved yet</h3>
            <p>Tap the heart icon on any destination to build your wishlist.</p>
          </div>
        ) : (
          <div className="favorites-grid">
            {favorites.map((favorite) => {
              const travelObj = favorite.travel && typeof favorite.travel === "object" ? favorite.travel : null;
              const travelId = travelObj?._id || favorite.travel;
              return (
                <div className="favorite-card" key={favorite._id}>
                  <Link to={`/travels/${travelId}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <img
                      src={
                        travelObj?.image?.url ||
                        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=800&auto=format&fit=crop"
                      }
                      alt={travelObj?.title || "Destination"}
                    />
                    <h3>{travelObj?.title || "Saved Destination"}</h3>
                    <p>
                      📍 {travelObj?.city || ""}
                      {travelObj?.country ? `, ${travelObj.country}` : ""}
                    </p>
                  </Link>
                  <div className="profile-fav-actions">
                    <Link to={`/travels/${travelId}`} className="profile-fav-link">
                      View Details
                    </Link>
                    <button
                      type="button"
                      className="profile-fav-remove"
                      disabled={removingFavId === travelId}
                      onClick={() => handleRemoveFavorite(travelId)}
                    >
                      {removingFavId === travelId ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* EDIT PROFILE MODAL */}
      {editing && (
        <div
          className="profile-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Edit profile"
        >
          <div className="profile-modal-card">
            <div className="profile-modal-header">
              <h2>Edit Profile</h2>
              <button
                type="button"
                className="profile-modal-close"
                onClick={() => setEditing(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {editError && <div className="profile-modal-error">{editError}</div>}

            <form onSubmit={handleSaveProfile} className="profile-modal-form">
              <label htmlFor="edit-username">Display Name</label>
              <input
                id="edit-username"
                type="text"
                maxLength={60}
                value={editForm.username}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, username: e.target.value }))
                }
                required
              />

              <label htmlFor="edit-location">Location</label>
              <input
                id="edit-location"
                type="text"
                maxLength={100}
                placeholder="e.g., Bengaluru, India"
                value={editForm.location}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, location: e.target.value }))
                }
              />

              <label htmlFor="edit-phone">Phone (Optional)</label>
              <input
                id="edit-phone"
                type="text"
                maxLength={30}
                placeholder="+91 98765 43210"
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, phone: e.target.value }))
                }
              />

              <label htmlFor="edit-bio">Travel Bio</label>
              <textarea
                id="edit-bio"
                rows={3}
                maxLength={280}
                placeholder="Tell us about your favorite travel styles..."
                value={editForm.bio}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, bio: e.target.value }))
                }
              />

              <div className="profile-modal-actions">
                <button
                  type="button"
                  className="profile-modal-cancel"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="edit-btn"
                  disabled={savingProfile}
                >
                  {savingProfile ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="state-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
};

export default Profile;
