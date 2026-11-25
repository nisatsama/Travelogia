import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import DestinationMap from "../components/DestinationMap";
import TravelReadinessCard from "../components/TravelReadinessCard";
import "./Details.css";

const Details = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, favoriteIds, toggleFavorite } = useAuth();

  const [travel, setTravel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [favLoading, setFavLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [similar, setSimilar] = useState([]);
  const [showAccForm, setShowAccForm] = useState(false);
  const [accDraft, setAccDraft] = useState({
    wheelchairAccessible: "unknown",
    accessibleAccommodation: "unknown",
    publicTransport: "unknown",
    familyFriendly: "unknown",
    accessibleAttractions: "unknown",
    walkingIntensity: "unknown",
    notes: "",
  });
  const [accSaving, setAccSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get(`/travels/${id}`);
        if (!active) return;
        const loaded = res.data?.data || null;
        setTravel(loaded);
        if (loaded?.accessibility) {
          setAccDraft({
            wheelchairAccessible: loaded.accessibility.wheelchairAccessible || "unknown",
            accessibleAccommodation: loaded.accessibility.accessibleAccommodation || "unknown",
            publicTransport: loaded.accessibility.publicTransport || "unknown",
            familyFriendly: loaded.accessibility.familyFriendly || "unknown",
            accessibleAttractions: loaded.accessibility.accessibleAttractions || "unknown",
            walkingIntensity: loaded.accessibility.walkingIntensity || "unknown",
            notes: loaded.accessibility.notes || "",
          });
        }
        setError("");
        // Record view signal & load similar destinations in background
        api.post("/recommendations/track-view", { travelId: id }).catch(() => {});
        api
          .get(`/recommendations/similar/${encodeURIComponent(id)}`)
          .then((sRes) => {
            if (active) setSimilar(sRes.data?.data || []);
          })
          .catch(() => {});
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, "Failed to load destination details."));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [id, reloadNonce]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  if (loading) {
    return (
      <div className="details-body">
        <div className="container">
          <div className="content">
            <div className="state-loading-inline dark" role="status">
              <span className="state-spinner" />
              <span>Loading destination details...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !travel) {
    return (
      <div className="details-body">
        <div className="container">
          <div className="content">
            <div className="state-error-banner dark">
              <p>{error || "Destination not found."}</p>
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
            <button
              type="button"
              className="back-btn"
              onClick={() => navigate("/travels")}
            >
              ← Back to Destinations
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isFavorite = favoriteIds.has(travel._id);

  const handleFavorite = async () => {
    setFavLoading(true);
    try {
      const result = await toggleFavorite(travel._id);
      if (result?.requiresAuth) {
        navigate("/login", {
          state: {
            from: `/travels/${travel._id}`,
            message: "Sign in to save this destination to your favorites.",
          },
        });
        return;
      }
      showToast(
        result.isFavorite ? "❤️ Saved to Favorites" : "Removed from Favorites",
      );
    } catch (err) {
      showToast(getErrorMessage(err, "Could not update favorites."));
    } finally {
      setFavLoading(false);
    }
  };

  const handleAccessibilitySubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      showToast("Sign in to submit accessibility updates.");
      return;
    }
    setAccSaving(true);
    try {
      const res = await api.post(`/travels/${travel._id}/accessibility`, accDraft);
      setTravel(res.data?.data || travel);
      setShowAccForm(false);
      showToast("Accessibility report submitted. Thank you for helping fellow travellers!");
    } catch (err) {
      showToast(getErrorMessage(err, "Could not submit accessibility update."));
    } finally {
      setAccSaving(false);
    }
  };

  return (
    <div className="details-body">
      <div className="container">
        {/* HERO SECTION */}

        <div className="hero">
          <img src={travel.image?.url} alt={travel.title} />

          <div className="overlay"></div>

          <div className="hero-content">
            <span className="mini-badge">{travel.category}</span>
            <h1 className="title">{travel.title}</h1>

            <p className="location">
              📍 {[travel.city, travel.state, travel.country]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
        </div>

        {/* CONTENT */}

        <div className="content">
          <p className="description">{travel.description}</p>

          {/* INFO CARDS */}

          <div className="info-grid">
            <div className="card">
              <h3>💰 Est. Price / Night</h3>
              <p>
                $ {travel.pricePerNight}{" "}
                <span className="details-est-note">(Estimate)</span>
              </p>
              {travel.approximateBudget && (
                <p className="details-sub-meta">
                  Budget guide: {travel.approximateBudget}
                </p>
              )}
            </div>

            <div className="card">
              <h3>⭐ Guest Rating</h3>
              <p>{travel.rating} / 5</p>
              {travel.estimatedDuration && (
                <p className="details-sub-meta">
                  Suggested stay: {travel.estimatedDuration}
                </p>
              )}
            </div>

            <div className="card">
              <h3>🏝 Category</h3>
              <p>{travel.category}</p>
              {travel.maxCapacity && (
                <p className="details-sub-meta">
                  Daily capacity: up to {travel.maxCapacity} travellers
                </p>
              )}
            </div>

            <div className="card">
              <h3>🌤 Best Time To Visit</h3>
              <p>{travel.bestTimeToVisit}</p>
            </div>
          </div>

          {!travel.isAvailable && (
            <div className="state-error-banner dark" style={{ marginBottom: "24px" }}>
              <p>
                This destination is currently unavailable for new reservations.
              </p>
            </div>
          )}

          {/* USER BUTTONS */}

          <div className="action-buttons">
            <button
              type="button"
              className="action-btn book-btn"
              disabled={travel.isAvailable === false}
              onClick={() =>
                navigate(`/booking?travelId=${encodeURIComponent(travel._id)}`, {
                  state: {
                    travel,
                  },
                })
              }
            >
              ✈ {travel.isAvailable === false ? "Currently Unavailable" : "Book Tour"}
            </button>

            <button
              type="button"
              className={`action-btn fav-btn ${isFavorite ? "details-fav-active" : ""}`}
              onClick={handleFavorite}
              disabled={favLoading}
            >
              {isFavorite ? "♥ Saved in Favorites" : "❤ Add To Favorites"}
            </button>

            <button
              type="button"
              className="action-btn fav-btn"
              onClick={() => navigate(`/price-watcher?travelId=${encodeURIComponent(travel._id)}`)}
            >
              📉 Watch Price
            </button>

            <button
              type="button"
              className="action-btn fav-btn"
              onClick={() => navigate(`/compare?ids=${encodeURIComponent(travel._id)}`)}
            >
              ⚖️ Compare
            </button>

            {user?.role === "admin" && (
              <button
                type="button"
                className="action-btn fav-btn"
                onClick={() => navigate("/admin-profile")}
              >
                ⚙ Manage in Admin
              </button>
            )}
          </div>

          {/* INTERACTIVE MAP */}

          <div className="glass-section">
            <h2 className="section-title">🗺 Location &amp; Interactive Map</h2>
            <DestinationMap destination={travel} height="360px" theme="dark" />
          </div>

          {/* HIGHLIGHTS */}

          {Array.isArray(travel.highlights) && travel.highlights.length > 0 && (
            <div className="glass-section">
              <h2 className="section-title">✨ Highlights</h2>

              <div className="tag-container">
                {travel.highlights.map((highlight, index) => (
                  <span className="tag" key={index}>
                    {highlight}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVITIES */}

          {Array.isArray(travel.activities) && travel.activities.length > 0 && (
            <div className="glass-section">
              <h2 className="section-title">🧭 Recommended Activities</h2>

              <div className="tag-container">
                {travel.activities.map((activity, index) => (
                  <span className="tag" key={index}>
                    {activity}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AMENITIES */}

          {Array.isArray(travel.amenities) && travel.amenities.length > 0 && (
            <div className="glass-section">
              <h2 className="section-title">🛎 Premium Amenities</h2>

              <div className="tag-container">
                {travel.amenities.map((amenity, index) => (
                  <span className="tag amenity-tag" key={index}>
                    {amenity}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* TRAVEL TIPS */}

          {Array.isArray(travel.travelTips || travel.tips) &&
            (travel.travelTips || travel.tips).length > 0 && (
              <div className="glass-section">
                <h2 className="section-title">💡 Practical Travel Tips</h2>
                <ul className="details-tips-list">
                  {(travel.travelTips || travel.tips).map((tip, index) => (
                    <li key={index}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}

          {/* TRAVEL READINESS & RISK INTELLIGENCE (Feature 5) */}
          <TravelReadinessCard travelId={travel._id} />

          {/* ACCESSIBILITY PROFILE & COMMUNITY REPORTING (Feature 12) */}
          <div className="glass-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>
                ♿ Accessibility Profile (3-State Verified / Unknown)
              </h2>
              <button
                type="button"
                className="v2-btn v2-btn-secondary v2-btn-sm"
                onClick={() => setShowAccForm((s) => !s)}
              >
                {showAccForm ? "Close Form" : "Submit Accessibility Update"}
              </button>
            </div>
            <p className="v2-dark-muted" style={{ marginTop: "6px" }}>
              Source: {travel.accessibility?.source || "Travelogia baseline"} · Values marked
              &ldquo;UNKNOWN&rdquo; have not been independently verified and are never assumed accessible.
            </p>
            <div className="v2-dark-grid">
              {[
                ["Wheelchair Accessible", travel.accessibility?.wheelchairAccessible],
                ["Accessible Accommodation", travel.accessibility?.accessibleAccommodation],
                ["Public Transport", travel.accessibility?.publicTransport],
                ["Family Friendly", travel.accessibility?.familyFriendly],
                ["Accessible Attractions", travel.accessibility?.accessibleAttractions],
                ["Walking Intensity", travel.accessibility?.walkingIntensity],
              ].map(([label, val]) => {
                const status = val || "unknown";
                const cls =
                  status === "yes" || status === "low"
                    ? "v2-chip-yes"
                    : status === "no" || status === "high"
                      ? "v2-chip-no"
                      : "v2-chip-unknown";
                return (
                  <div className="v2-dark-box" key={label}>
                    <div style={{ fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}>{label}</div>
                    <span className={`v2-chip ${cls}`}>{status.toUpperCase()}</span>
                  </div>
                );
              })}
            </div>
            {travel.accessibility?.notes && (
              <p className="v2-dark-muted" style={{ marginTop: "10px" }}>
                📝 Note: {travel.accessibility.notes}
              </p>
            )}

            {showAccForm && (
              <form onSubmit={handleAccessibilitySubmit} style={{ marginTop: "16px", background: "rgba(15,23,42,0.55)", padding: "16px", borderRadius: "12px" }}>
                <div className="v2-dark-grid">
                  {[
                    ["wheelchairAccessible", "Wheelchair Accessible"],
                    ["accessibleAccommodation", "Accessible Stay"],
                    ["publicTransport", "Public Transport"],
                    ["familyFriendly", "Family Friendly"],
                    ["accessibleAttractions", "Accessible Attractions"],
                  ].map(([field, label]) => (
                    <div className="v2-field" key={field}>
                      <label style={{ color: "#e2e8f0" }}>{label}</label>
                      <select
                        className="v2-select"
                        value={accDraft[field]}
                        onChange={(e) => setAccDraft({ ...accDraft, [field]: e.target.value })}
                      >
                        <option value="unknown">Unknown</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                  ))}
                  <div className="v2-field">
                    <label style={{ color: "#e2e8f0" }}>Walking Intensity</label>
                    <select
                      className="v2-select"
                      value={accDraft.walkingIntensity}
                      onChange={(e) => setAccDraft({ ...accDraft, walkingIntensity: e.target.value })}
                    >
                      <option value="unknown">Unknown</option>
                      <option value="low">Low</option>
                      <option value="moderate">Moderate</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div className="v2-field" style={{ marginTop: "10px" }}>
                  <label style={{ color: "#e2e8f0" }}>Accessibility Notes</label>
                  <input
                    className="v2-input"
                    placeholder="e.g., Ramps available at main viewpoint, steep steps near old town"
                    value={accDraft.notes}
                    onChange={(e) => setAccDraft({ ...accDraft, notes: e.target.value })}
                  />
                </div>
                <button type="submit" className="v2-btn v2-btn-accent v2-btn-sm" disabled={accSaving}>
                  {accSaving ? "Submitting..." : "Submit Verified Report"}
                </button>
              </form>
            )}
          </div>

          {/* SIMILAR DESTINATIONS (Feature 8) */}
          {similar.length > 0 && (
            <div className="glass-section">
              <h2 className="section-title">🧭 Similar Destinations You May Like</h2>
              <div className="v2-dark-grid">
                {similar.map((item) => (
                  <div
                    key={item._id}
                    className="v2-dark-box"
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/travels/${item._id}`)}
                  >
                    <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>
                      {item.title}
                    </div>
                    <div className="v2-dark-muted">
                      {item.city}, {item.country} · Est. ${item.pricePerNight}/night
                    </div>
                    <div className="v2-dark-muted" style={{ fontSize: "12px", marginTop: "6px" }}>
                      {(item.similarityReasons || []).join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BACK BUTTON */}

          <button
            type="button"
            className="back-btn"
            onClick={() => navigate("/travels")}
          >
            ← Back to Destinations
          </button>
        </div>
      </div>

      {toast && (
        <div className="state-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
};

export default Details;
