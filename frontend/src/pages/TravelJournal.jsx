import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";
import RouteMap from "../components/RouteMap";

export default function TravelJournal() {
  const { user } = useAuth();
  const [tab, setTab] = useState("mine");
  const [myEntries, setMyEntries] = useState([]);
  const [publicEntries, setPublicEntries] = useState([]);
  const [allDestinations, setAllDestinations] = useState([]);
  const [form, setForm] = useState({
    title: "",
    location: "",
    travelId: "",
    visitDate: new Date().toISOString().slice(0, 10),
    story: "",
    tags: "mountains, sunrise",
    rating: 5,
    isPublic: false,
  });
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [pubRes, destRes] = await Promise.all([
          api.get("/journals/public"),
          api.get("/travels", { params: { limit: 100 } }),
        ]);
        if (!active) return;
        setPublicEntries(pubRes.data?.data || []);
        setAllDestinations(destRes.data?.data || []);
      } catch {
        // ignore
      }
      if (user) {
        try {
          const mineRes = await api.get("/journals/mine");
          if (active) setMyEntries(mineRes.data?.data || []);
        } catch {
          // ignore
        }
      } else {
        setTab("public");
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!user) {
      setError("Sign in to write travel memories.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("location", form.location);
      fd.append("travelId", form.travelId);
      fd.append("visitDate", form.visitDate);
      fd.append("story", form.story);
      fd.append("tags", form.tags);
      fd.append("rating", String(form.rating));
      fd.append("isPublic", String(form.isPublic));
      files.slice(0, 4).forEach((f) => fd.append("photos", f));

      const res = await api.post("/journals", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const created = res.data?.data;
      setMyEntries((prev) => [created, ...prev]);
      if (created.isPublic) {
        setPublicEntries((prev) => [created, ...prev]);
      }
      setForm({
        title: "",
        location: "",
        travelId: "",
        visitDate: new Date().toISOString().slice(0, 10),
        story: "",
        tags: "",
        rating: 5,
        isPublic: false,
      });
      setFiles([]);
      setSuccess("Travel memory saved!");
    } catch (err) {
      setError(getErrorMessage(err, "Could not save journal entry."));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVisibility = async (entry) => {
    try {
      const res = await api.put(`/journals/${entry._id}`, { isPublic: !entry.isPublic });
      const updated = res.data?.data;
      setMyEntries((prev) => prev.map((e) => (e._id === updated._id ? updated : e)));
      if (updated.isPublic) {
        setPublicEntries((prev) => [updated, ...prev.filter((e) => e._id !== updated._id)]);
      } else {
        setPublicEntries((prev) => prev.filter((e) => e._id !== updated._id));
      }
    } catch (err) {
      setError(getErrorMessage(err, "Could not update visibility."));
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/journals/${id}`);
      setMyEntries((prev) => prev.filter((e) => e._id !== id));
      setPublicEntries((prev) => prev.filter((e) => e._id !== id));
      setSuccess("Memory deleted.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not delete entry."));
    }
  };

  const displayed = tab === "mine" ? myEntries : publicEntries;
  const mapStops = displayed
    .filter((e) => e.coordinates && Number.isFinite(e.coordinates.latitude))
    .map((e) => ({
      _id: e._id,
      title: e.title,
      city: e.location,
      coordinates: e.coordinates,
    }));

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>📔 Travel Memory Journal</h1>
          <p>
            Capture your journeys with uploaded photos, ratings, tags, visited locations on an
            interactive map, and full control over private vs. public community stories.
          </p>
        </div>

        {error && <div className="v2-alert-error">{error}</div>}
        {success && <div className="v2-alert-success">{success}</div>}

        <div className="v2-grid-sidebar">
          <div>
            {user ? (
              <form className="v2-card" onSubmit={handleCreate}>
                <div className="v2-card-title">Log a New Memory</div>

                <div className="v2-field">
                  <label>Entry Title</label>
                  <input
                    className="v2-input"
                    placeholder="e.g., Sunrise over Tiger Hill"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                  />
                </div>

                <div className="v2-field">
                  <label>Link to Travelogia Destination (for Map Pin)</label>
                  <select
                    className="v2-select"
                    value={form.travelId}
                    onChange={(e) => {
                      const d = allDestinations.find((x) => x._id === e.target.value);
                      setForm({
                        ...form,
                        travelId: e.target.value,
                        location: d ? `${d.city}, ${d.country}` : form.location,
                      });
                    }}
                  >
                    <option value="">-- Optional catalogue link --</option>
                    {allDestinations.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.title} ({d.city})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="v2-field">
                  <label>Location Name</label>
                  <input
                    className="v2-input"
                    placeholder="e.g., Darjeeling, West Bengal"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    required
                  />
                </div>

                <div className="v2-grid-2">
                  <div className="v2-field">
                    <label>Visit Date</label>
                    <input
                      type="date"
                      className="v2-input"
                      value={form.visitDate}
                      onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Rating (1–5)</label>
                    <select
                      className="v2-select"
                      value={form.rating}
                      onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
                    >
                      {[5, 4, 3, 2, 1].map((r) => (
                        <option key={r} value={r}>
                          {"★".repeat(r)} ({r}/5)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="v2-field">
                  <label>Your Story</label>
                  <textarea
                    rows="4"
                    className="v2-textarea"
                    placeholder="Share highlights, hidden cafes, tips, or unforgettable views..."
                    value={form.story}
                    onChange={(e) => setForm({ ...form, story: e.target.value })}
                    required
                  />
                </div>

                <div className="v2-field">
                  <label>Tags (comma-separated)</label>
                  <input
                    className="v2-input"
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  />
                </div>

                <div className="v2-field">
                  <label>Upload Photos (JPEG/PNG/WEBP, max 4 files, 5MB each)</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  />
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", marginBottom: "14px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.isPublic}
                    onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
                  />
                  Share publicly in Community Stories (unchecked = Private)
                </label>

                <button type="submit" className="v2-btn v2-btn-primary" style={{ width: "100%" }} disabled={saving}>
                  {saving ? "Saving Memory..." : "Save Travel Memory"}
                </button>
              </form>
            ) : (
              <div className="v2-card">
                <div className="v2-card-title">Write Your Travel Stories</div>
                <p style={{ fontSize: "14px", color: "#475569", marginBottom: "12px" }}>
                  Sign in to create private or public travel memories with photos and map pins.
                </p>
                <Link to="/login" className="v2-btn v2-btn-primary">
                  Sign In →
                </Link>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div className="v2-tabs">
              {user && (
                <button
                  type="button"
                  className={`v2-tab ${tab === "mine" ? "active" : ""}`}
                  onClick={() => setTab("mine")}
                >
                  My Memories ({myEntries.length})
                </button>
              )}
              <button
                type="button"
                className={`v2-tab ${tab === "public" ? "active" : ""}`}
                onClick={() => setTab("public")}
              >
                Public Community Stories ({publicEntries.length})
              </button>
            </div>

            {mapStops.length > 0 && (
              <div className="v2-card">
                <div className="v2-card-title">Visited Places Map ({mapStops.length} pinned)</div>
                <RouteMap stops={mapStops} height="260px" />
              </div>
            )}

            {displayed.length === 0 ? (
              <div className="v2-card" style={{ textAlign: "center", padding: "36px" }}>
                <p style={{ color: "#64748b" }}>
                  {tab === "mine"
                    ? "You have not logged any memories yet. Create your first travel story on the left!"
                    : "No public community travel stories shared yet."}
                </p>
              </div>
            ) : (
              displayed.map((entry) => (
                <div className="v2-card" key={entry._id}>
                  <div className="v2-card-title">
                    <span>{entry.title}</span>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span className={`v2-chip ${entry.isPublic ? "v2-chip-yes" : "v2-chip-unknown"}`}>
                        {entry.isPublic ? "Public" : "Private"}
                      </span>
                      <span className="v2-chip v2-chip-warn">{"★".repeat(entry.rating || 5)}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "10px" }}>
                    📍 {entry.location} · 📅 {entry.visitDate} · By {entry.authorName}
                  </div>
                  <p style={{ fontSize: "14.5px", lineHeight: 1.6, color: "#1e293b", whiteSpace: "pre-line" }}>
                    {entry.story}
                  </p>

                  {Array.isArray(entry.photos) && entry.photos.length > 0 && (
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                      {entry.photos.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`${entry.title} photo ${idx + 1}`}
                          style={{ width: "160px", height: "120px", objectFit: "cover", borderRadius: "10px", border: "1px solid #e2e8f0" }}
                        />
                      ))}
                    </div>
                  )}

                  {Array.isArray(entry.tags) && entry.tags.length > 0 && (
                    <div className="v2-chip-row" style={{ marginTop: "12px" }}>
                      {entry.tags.map((t, i) => (
                        <span key={i} className="v2-chip">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {user && String(entry.user) === String(user.id || user._id) && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                      <button
                        type="button"
                        className="v2-btn v2-btn-secondary v2-btn-sm"
                        onClick={() => handleToggleVisibility(entry)}
                      >
                        {entry.isPublic ? "Make Private" : "Share Publicly"}
                      </button>
                      <button
                        type="button"
                        className="v2-btn v2-btn-danger v2-btn-sm"
                        onClick={() => handleDelete(entry._id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
