import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import "./AdminDashboard.css";

const EMPTY_DEST = {
  title: "",
  city: "",
  state: "",
  country: "",
  category: "Beach",
  pricePerNight: 120,
  rating: 4.6,
  bestTimeToVisit: "Oct - Mar",
  estimatedDuration: "3-5 days",
  approximateBudget: "$120 - $220 / night (estimated)",
  maxCapacity: 25,
  description: "",
  imageUrl:
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1400&auto=format&fit=crop",
  latitude: 28.6139,
  longitude: 77.209,
  highlightsText: "Scenic Views, Local Cuisine",
  amenitiesText: "Guided Tours, WiFi, Airport Pickup",
  activitiesText: "Sightseeing, Photography",
  tipsText: "Book accommodations early during peak season.",
  isAvailable: true,
};

const CATEGORIES = [
  "Beach",
  "Mountain",
  "Historical",
  "Adventure",
  "City",
  "Nature",
  "Spiritual",
  "Cultural",
];

function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("destinations");
  const [stats, setStats] = useState({
    totalDestinations: 0,
    totalBookings: 0,
    totalUsers: 0,
  });

  const [travels, setTravels] = useState([]);
  const [travelPage, setTravelPage] = useState(1);
  const [travelPagination, setTravelPagination] = useState({ currentPage: 1, totalPages: 1 });
  const [travelSearch, setTravelSearch] = useState("");

  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Create/Edit Destination Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [destForm, setDestForm] = useState(EMPTY_DEST);
  const [savingDest, setSavingDest] = useState(false);
  const [destError, setDestError] = useState("");

  // Create User / Admin Form
  const [newUserForm, setNewUserForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "user",
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userFormError, setUserFormError] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [overviewRes, travelsRes, bookingsRes, usersRes] = await Promise.all([
          api.get("/admin/overview"),
          api.get("/admin/travels", {
            params: { page: travelPage, limit: 15, search: travelSearch || undefined },
          }),
          api.get("/admin/bookings", { params: { page: 1, limit: 50 } }),
          api.get("/admin/users", { params: { page: 1, limit: 50 } }),
        ]);

        if (!active) return;
        setStats(overviewRes.data?.stats || {});
        setTravels(travelsRes.data?.data || []);
        setTravelPagination(travelsRes.data?.pagination || { currentPage: 1, totalPages: 1 });
        setBookings(bookingsRes.data?.data || []);
        setUsers(usersRes.data?.data || []);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, "Failed to load admin dashboard data."));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [travelPage, travelSearch, refreshKey]);

  const openCreateModal = () => {
    setEditingId(null);
    setDestForm(EMPTY_DEST);
    setDestError("");
    setModalOpen(true);
  };

  const openEditModal = (t) => {
    setEditingId(t._id);
    setDestForm({
      title: t.title || "",
      city: t.city || "",
      state: t.state || "",
      country: t.country || "",
      category: t.category || "Beach",
      pricePerNight: t.pricePerNight ?? 100,
      rating: t.rating ?? 4.5,
      bestTimeToVisit: t.bestTimeToVisit || "",
      estimatedDuration: t.estimatedDuration || "",
      approximateBudget: t.approximateBudget || "",
      maxCapacity: t.maxCapacity ?? 25,
      description: t.description || "",
      imageUrl: t.image?.url || "",
      latitude: t.coordinates?.latitude ?? 0,
      longitude: t.coordinates?.longitude ?? 0,
      highlightsText: (t.highlights || []).join(", "),
      amenitiesText: (t.amenities || []).join(", "),
      activitiesText: (t.activities || []).join(", "),
      tipsText: (t.travelTips || t.tips || []).join(" | "),
      isAvailable: t.isAvailable !== false,
    });
    setDestError("");
    setModalOpen(true);
  };

  const splitList = (val, delimiter = ",") =>
    String(val || "")
      .split(delimiter)
      .map((item) => item.trim())
      .filter(Boolean);

  const handleSaveDestination = async (e) => {
    e.preventDefault();
    setDestError("");
    setSavingDest(true);

    const payload = {
      title: destForm.title.trim(),
      city: destForm.city.trim(),
      state: destForm.state.trim(),
      country: destForm.country.trim(),
      category: destForm.category,
      pricePerNight: Number(destForm.pricePerNight),
      rating: Number(destForm.rating),
      bestTimeToVisit: destForm.bestTimeToVisit.trim(),
      estimatedDuration: destForm.estimatedDuration.trim(),
      approximateBudget: destForm.approximateBudget.trim(),
      maxCapacity: Number(destForm.maxCapacity),
      description: destForm.description.trim(),
      image: { url: destForm.imageUrl.trim(), filename: "destination" },
      coordinates: {
        latitude: Number(destForm.latitude),
        longitude: Number(destForm.longitude),
      },
      highlights: splitList(destForm.highlightsText, ","),
      amenities: splitList(destForm.amenitiesText, ","),
      activities: splitList(destForm.activitiesText, ","),
      travelTips: splitList(destForm.tipsText, "|"),
      isAvailable: Boolean(destForm.isAvailable),
    };

    try {
      if (editingId) {
        await api.put(`/travels/${editingId}`, payload);
        showToast("Destination updated");
      } else {
        await api.post("/travels", payload);
        showToast("Destination created");
      }
      setModalOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setDestError(getErrorMessage(err, "Unable to save destination."));
    } finally {
      setSavingDest(false);
    }
  };

  const handleToggleAvailability = async (travel) => {
    try {
      await api.put(`/travels/${travel._id}`, {
        isAvailable: !(travel.isAvailable !== false),
      });
      showToast(
        travel.isAvailable !== false
          ? "Destination marked unavailable"
          : "Destination enabled for bookings",
      );
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showToast(getErrorMessage(err, "Failed to update availability."));
    }
  };

  const handleDeleteDestination = async (travel) => {
    try {
      const res = await api.delete(`/travels/${travel._id}`);
      showToast(res.data?.message || "Destination removed");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showToast(getErrorMessage(err, "Failed to delete destination."));
    }
  };

  const handleAdminCancelBooking = async (bookingId) => {
    try {
      await api.patch(`/bookings/${bookingId}/cancel`);
      showToast("Booking cancelled");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showToast(getErrorMessage(err, "Could not cancel booking."));
    }
  };

  const handleToggleUserRole = async (targetUser) => {
    const nextRole = targetUser.role === "admin" ? "user" : "admin";
    try {
      await api.patch(`/admin/users/${targetUser._id}/role`, { role: nextRole });
      showToast(`Updated ${targetUser.username} to ${nextRole}`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showToast(getErrorMessage(err, "Could not update user role."));
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserFormError("");
    setCreatingUser(true);
    try {
      await api.post("/admin/users", newUserForm);
      setNewUserForm({ username: "", email: "", password: "", role: "user" });
      showToast("Account created successfully");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setUserFormError(getErrorMessage(err, "Unable to create user account."));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <Link to="/" className="admin-back-link">
            ← Back to Travelogia
          </Link>
          <h1>Admin Control Center</h1>
          <p>
            Signed in as <strong>{user?.username}</strong> ({user?.email})
          </p>
        </div>

        <div className="admin-header-actions">
          <Link to="/profile" className="admin-btn secondary">
            My Profile
          </Link>
          <button type="button" className="admin-btn danger" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <section className="admin-stats-grid">
        <div className="admin-stat-card">
          <span>Destinations</span>
          <h2>{stats.totalDestinations ?? 0}</h2>
        </div>
        <div className="admin-stat-card">
          <span>Total Bookings</span>
          <h2>{stats.totalBookings ?? 0}</h2>
        </div>
        <div className="admin-stat-card">
          <span>Registered Users</span>
          <h2>{stats.totalUsers ?? 0}</h2>
        </div>
      </section>

      <div className="admin-tabs" role="tablist">
        <button
          type="button"
          className={activeTab === "destinations" ? "active" : ""}
          onClick={() => setActiveTab("destinations")}
        >
          Destinations ({stats.totalDestinations ?? travels.length})
        </button>
        <button
          type="button"
          className={activeTab === "bookings" ? "active" : ""}
          onClick={() => setActiveTab("bookings")}
        >
          Bookings ({bookings.length})
        </button>
        <button
          type="button"
          className={activeTab === "users" ? "active" : ""}
          onClick={() => setActiveTab("users")}
        >
          Users &amp; Roles ({users.length})
        </button>
      </div>

      {error && (
        <div className="state-error-banner">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRefreshKey((k) => k + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="state-loading-inline" role="status">
          <span className="state-spinner" />
          <span>Loading admin workspace...</span>
        </div>
      ) : (
        <>
          {activeTab === "destinations" && (
            <section className="admin-panel">
              <div className="admin-panel-toolbar">
                <input
                  type="search"
                  placeholder="Filter destinations by title, city, or country..."
                  value={travelSearch}
                  onChange={(e) => {
                    setTravelSearch(e.target.value);
                    setTravelPage(1);
                  }}
                />
                <button
                  type="button"
                  className="admin-btn primary"
                  onClick={openCreateModal}
                >
                  + Add Destination
                </button>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Destination</th>
                      <th>Location</th>
                      <th>Category</th>
                      <th>Est. $/Night</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {travels.map((t) => (
                      <tr key={t._id}>
                        <td>
                          <strong>{t.title}</strong>
                        </td>
                        <td>
                          {[t.city, t.country].filter(Boolean).join(", ")}
                        </td>
                        <td>{t.category}</td>
                        <td>${t.pricePerNight}</td>
                        <td>
                          {t.isArchived ? (
                            <span className="admin-pill archived">Archived</span>
                          ) : t.isAvailable === false ? (
                            <span className="admin-pill paused">Unavailable</span>
                          ) : (
                            <span className="admin-pill active">Available</span>
                          )}
                        </td>
                        <td className="admin-row-actions">
                          <button type="button" onClick={() => openEditModal(t)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleAvailability(t)}
                          >
                            {t.isAvailable === false ? "Enable" : "Pause"}
                          </button>
                          <button
                            type="button"
                            className="danger-text"
                            onClick={() => handleDeleteDestination(t)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {travelPagination.totalPages > 1 && (
                <div className="admin-pagination">
                  <button
                    type="button"
                    disabled={travelPage <= 1}
                    onClick={() => setTravelPage((p) => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </button>
                  <span>
                    Page {travelPagination.currentPage} of {travelPagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={travelPage >= travelPagination.totalPages}
                    onClick={() => setTravelPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </section>
          )}

          {activeTab === "bookings" && (
            <section className="admin-panel">
              {bookings.length === 0 ? (
                <div className="state-empty-box">
                  <h3>No bookings recorded yet</h3>
                  <p>Bookings created by travelers will appear here in real time.</p>
                </div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Traveler</th>
                        <th>Destination</th>
                        <th>Dates</th>
                        <th>Guests / Days</th>
                        <th>Server Total</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b) => (
                        <tr key={b._id}>
                          <td>
                            <code>{b.bookingReference || b._id.slice(-8)}</code>
                          </td>
                          <td>
                            {b.user?.username || "User"}
                            <div className="admin-subtext">{b.user?.email || ""}</div>
                          </td>
                          <td>{b.travel?.title || b.destination}</td>
                          <td>
                            {b.startDate || b.date
                              ? new Date(b.startDate || b.date).toLocaleDateString()
                              : "N/A"}
                          </td>
                          <td>
                            {b.travelers} / {b.duration}d
                          </td>
                          <td>${b.totalCost}</td>
                          <td>
                            <span
                              className={`admin-pill ${
                                b.status === "cancelled" ? "archived" : "active"
                              }`}
                            >
                              {b.status || "confirmed"}
                            </span>
                          </td>
                          <td>
                            {b.status !== "cancelled" && (
                              <button
                                type="button"
                                className="danger-text"
                                onClick={() => handleAdminCancelBooking(b._id)}
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === "users" && (
            <section className="admin-panel">
              <form className="admin-create-user-form" onSubmit={handleCreateUser}>
                <h3>Create User or Administrator Account</h3>
                {userFormError && (
                  <div className="profile-modal-error">{userFormError}</div>
                )}
                <div className="admin-inline-grid">
                  <input
                    type="text"
                    placeholder="Username"
                    value={newUserForm.username}
                    onChange={(e) =>
                      setNewUserForm((p) => ({ ...p, username: e.target.value }))
                    }
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={newUserForm.email}
                    onChange={(e) =>
                      setNewUserForm((p) => ({ ...p, email: e.target.value }))
                    }
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password (8+ chars, letter & number)"
                    value={newUserForm.password}
                    onChange={(e) =>
                      setNewUserForm((p) => ({ ...p, password: e.target.value }))
                    }
                    required
                  />
                  <select
                    value={newUserForm.role}
                    onChange={(e) =>
                      setNewUserForm((p) => ({ ...p, role: e.target.value }))
                    }
                  >
                    <option value="user">Traveler</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="submit"
                    className="admin-btn primary"
                    disabled={creatingUser}
                  >
                    {creatingUser ? "Creating..." : "Create Account"}
                  </button>
                </div>
              </form>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u._id}>
                        <td>{u.username}</td>
                        <td>{u.email}</td>
                        <td>
                          <span
                            className={`admin-pill ${
                              u.role === "admin" ? "paused" : "active"
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td>
                          {u._id !== user?._id ? (
                            <button
                              type="button"
                              onClick={() => handleToggleUserRole(u)}
                            >
                              {u.role === "admin" ? "Demote to User" : "Promote to Admin"}
                            </button>
                          ) : (
                            <span className="admin-subtext">Current Session</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {modalOpen && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? "Edit Destination" : "Add Destination"}
        >
          <div className="admin-modal-card">
            <div className="admin-modal-header">
              <h2>{editingId ? "Edit Destination" : "Create Destination"}</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {destError && <div className="profile-modal-error">{destError}</div>}

            <form onSubmit={handleSaveDestination} className="admin-dest-form">
              <div className="admin-form-grid">
                <label>
                  Title
                  <input
                    type="text"
                    value={destForm.title}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, title: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  City
                  <input
                    type="text"
                    value={destForm.city}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, city: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  State / Region
                  <input
                    type="text"
                    value={destForm.state}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, state: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Country
                  <input
                    type="text"
                    value={destForm.country}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, country: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Category
                  <select
                    value={destForm.category}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, category: e.target.value }))
                    }
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Est. Price / Night (USD)
                  <input
                    type="number"
                    min="1"
                    value={destForm.pricePerNight}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, pricePerNight: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Rating (0–5)
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={destForm.rating}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, rating: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Max Daily Capacity
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={destForm.maxCapacity}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, maxCapacity: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Latitude
                  <input
                    type="number"
                    step="any"
                    value={destForm.latitude}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, latitude: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="number"
                    step="any"
                    value={destForm.longitude}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, longitude: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Best Time to Visit
                  <input
                    type="text"
                    value={destForm.bestTimeToVisit}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, bestTimeToVisit: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Suggested Duration
                  <input
                    type="text"
                    value={destForm.estimatedDuration}
                    onChange={(e) =>
                      setDestForm((p) => ({ ...p, estimatedDuration: e.target.value }))
                    }
                  />
                </label>
              </div>

              <label>
                Image URL
                <input
                  type="url"
                  value={destForm.imageUrl}
                  onChange={(e) =>
                    setDestForm((p) => ({ ...p, imageUrl: e.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Description
                <textarea
                  rows={3}
                  value={destForm.description}
                  onChange={(e) =>
                    setDestForm((p) => ({ ...p, description: e.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Highlights (comma-separated)
                <input
                  type="text"
                  value={destForm.highlightsText}
                  onChange={(e) =>
                    setDestForm((p) => ({ ...p, highlightsText: e.target.value }))
                  }
                />
              </label>

              <label>
                Amenities (comma-separated)
                <input
                  type="text"
                  value={destForm.amenitiesText}
                  onChange={(e) =>
                    setDestForm((p) => ({ ...p, amenitiesText: e.target.value }))
                  }
                />
              </label>

              <label>
                Activities (comma-separated)
                <input
                  type="text"
                  value={destForm.activitiesText}
                  onChange={(e) =>
                    setDestForm((p) => ({ ...p, activitiesText: e.target.value }))
                  }
                />
              </label>

              <label>
                Tips (separate multiple with | )
                <input
                  type="text"
                  value={destForm.tipsText}
                  onChange={(e) =>
                    setDestForm((p) => ({ ...p, tipsText: e.target.value }))
                  }
                />
              </label>

              <label className="admin-checkbox-label">
                <input
                  type="checkbox"
                  checked={destForm.isAvailable}
                  onChange={(e) =>
                    setDestForm((p) => ({ ...p, isAvailable: e.target.checked }))
                  }
                />
                Available for new bookings
              </label>

              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-btn secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-btn primary"
                  disabled={savingDest}
                >
                  {savingDest
                    ? "Saving..."
                    : editingId
                      ? "Save Changes"
                      : "Create Destination"}
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
}

export default AdminDashboard;
