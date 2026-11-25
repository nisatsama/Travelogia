import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";
import RouteMap from "../components/RouteMap";

export default function TripBuilder() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    startingCity: "Kolkata",
    destinationPreferences: "Darjeeling, Gangtok, Kalimpong",
    startDate: "",
    days: 4,
    travelers: 2,
    totalBudget: 1200,
    currency: "USD",
    travelStyle: "balanced",
    interests: "mountains, tea gardens, culture, local food",
    preferredActivities: "scenic drives, monastery visits, café hopping",
    accommodationPreference: "mid-range",
  });

  const [generating, setGenerating] = useState(false);
  const [regenDay, setRegenDay] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeItinerary, setActiveItinerary] = useState(null);
  const [groundedDestinations, setGroundedDestinations] = useState([]);
  const [savedList, setSavedList] = useState([]);
  const [editingNoteDay, setEditingNoteDay] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get("/itineraries");
        if (!active) return;
        const items = res.data?.data || [];
        setSavedList(items);
        if (items.length > 0) {
          setActiveItinerary((prev) => prev || items[0]);
        }
      } catch {
        // non-blocking load
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!user) {
      setError("Please sign in to generate and save AI trip itineraries.");
      return;
    }
    setGenerating(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/itineraries/generate", {
        ...form,
        days: Number(form.days),
        travelers: Number(form.travelers),
        totalBudget: Number(form.totalBudget),
        destinationPreferences: form.destinationPreferences
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        interests: form.interests
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        preferredActivities: form.preferredActivities
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      const created = res.data?.data;
      setActiveItinerary(created);
      setGroundedDestinations(res.data?.groundedDestinations || []);
      setSavedList((prev) => [created, ...prev.filter((i) => i._id !== created._id)]);
      setSuccess("Smart itinerary generated, grounded against Travelogia's catalogue, and saved.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to generate itinerary."));
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateDay = async (dayNumber) => {
    if (!activeItinerary?._id) return;
    setRegenDay(dayNumber);
    setError("");
    setSuccess("");
    try {
      const res = await api.post(`/itineraries/${activeItinerary._id}/regenerate-day`, {
        dayNumber,
        focusNote: "Offer fresh local sights and food spots distinct from the other days.",
      });
      const updated = res.data?.data;
      setActiveItinerary(updated);
      setSavedList((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
      setSuccess(`Day ${dayNumber} regenerated and saved.`);
    } catch (err) {
      setError(getErrorMessage(err, `Could not regenerate Day ${dayNumber}.`));
    } finally {
      setRegenDay(null);
    }
  };

  const handleSaveNote = async (dayNumber) => {
    if (!activeItinerary?._id) return;
    try {
      const nextDays = (activeItinerary.dayPlans || []).map((d) =>
        d.dayNumber === dayNumber ? { ...d, notes: noteDraft } : d,
      );
      const res = await api.put(`/itineraries/${activeItinerary._id}`, { dayPlans: nextDays });
      const updated = res.data?.data;
      setActiveItinerary(updated);
      setSavedList((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
      setEditingNoteDay(null);
      setSuccess(`Updated Day ${dayNumber} notes.`);
    } catch (err) {
      setError(getErrorMessage(err, "Could not update day note."));
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/itineraries/${id}`);
      const remaining = savedList.filter((i) => i._id !== id);
      setSavedList(remaining);
      if (activeItinerary?._id === id) {
        setActiveItinerary(remaining[0] || null);
      }
      setSuccess("Itinerary deleted.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not delete itinerary."));
    }
  };

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>✨ AI-Powered Smart Trip Builder</h1>
          <p>
            Generate structured day-by-day itineraries grounded in Travelogia&apos;s curated database,
            with authoritative server-calculated budget breakdowns and single-day regeneration.
          </p>
        </div>

        {!user && (
          <div className="v2-alert-error">
            Sign in to generate, edit, and save AI trip plans.{" "}
            <Link to="/login" style={{ fontWeight: 700, color: "#991b1b" }}>
              Go to Login →
            </Link>
          </div>
        )}
        {error && <div className="v2-alert-error">{error}</div>}
        {success && <div className="v2-alert-success">{success}</div>}

        <div className="v2-grid-sidebar">
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <form className="v2-card" onSubmit={handleGenerate}>
              <div className="v2-card-title">Plan Parameters</div>

              <div className="v2-field">
                <label>Starting City</label>
                <input
                  className="v2-input"
                  value={form.startingCity}
                  onChange={(e) => setForm({ ...form, startingCity: e.target.value })}
                  required
                />
              </div>

              <div className="v2-field">
                <label>Destination / Region Preferences (comma-separated)</label>
                <input
                  className="v2-input"
                  value={form.destinationPreferences}
                  onChange={(e) => setForm({ ...form, destinationPreferences: e.target.value })}
                />
              </div>

              <div className="v2-grid-2">
                <div className="v2-field">
                  <label>Days (1–21)</label>
                  <input
                    type="number"
                    min="1"
                    max="21"
                    className="v2-input"
                    value={form.days}
                    onChange={(e) => setForm({ ...form, days: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Travellers</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    className="v2-input"
                    value={form.travelers}
                    onChange={(e) => setForm({ ...form, travelers: e.target.value })}
                  />
                </div>
              </div>

              <div className="v2-grid-2">
                <div className="v2-field">
                  <label>Target Total Budget</label>
                  <input
                    type="number"
                    min="50"
                    className="v2-input"
                    value={form.totalBudget}
                    onChange={(e) => setForm({ ...form, totalBudget: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Currency</label>
                  <select
                    className="v2-select"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                  </select>
                </div>
              </div>

              <div className="v2-grid-2">
                <div className="v2-field">
                  <label>Travel Style</label>
                  <select
                    className="v2-select"
                    value={form.travelStyle}
                    onChange={(e) => setForm({ ...form, travelStyle: e.target.value })}
                  >
                    <option value="relaxed">Relaxed</option>
                    <option value="balanced">Balanced</option>
                    <option value="adventure">Adventure</option>
                    <option value="luxury">Luxury</option>
                    <option value="budget-backpacker">Budget</option>
                  </select>
                </div>
                <div className="v2-field">
                  <label>Stay Preference</label>
                  <select
                    className="v2-select"
                    value={form.accommodationPreference}
                    onChange={(e) => setForm({ ...form, accommodationPreference: e.target.value })}
                  >
                    <option value="budget">Budget</option>
                    <option value="mid-range">Mid-range</option>
                    <option value="luxury">Luxury</option>
                  </select>
                </div>
              </div>

              <div className="v2-field">
                <label>Interests</label>
                <input
                  className="v2-input"
                  value={form.interests}
                  onChange={(e) => setForm({ ...form, interests: e.target.value })}
                />
              </div>

              <div className="v2-field">
                <label>Start Date (Optional)</label>
                <input
                  type="date"
                  className="v2-input"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>

              <button
                type="submit"
                className="v2-btn v2-btn-primary"
                style={{ width: "100%" }}
                disabled={generating || !user}
              >
                {generating ? "Generating Structured Plan..." : "✨ Generate Smart Itinerary"}
              </button>
            </form>

            {savedList.length > 0 && (
              <div className="v2-card">
                <div className="v2-card-title">Saved Itineraries ({savedList.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {savedList.map((item) => (
                    <div
                      key={item._id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border:
                          activeItinerary?._id === item._id
                            ? "2px solid #2563eb"
                            : "1px solid #e2e8f0",
                        background: activeItinerary?._id === item._id ? "#eff6ff" : "#f8fafc",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <button
                        type="button"
                        style={{
                          background: "none",
                          border: "none",
                          textAlign: "left",
                          cursor: "pointer",
                          flex: 1,
                        }}
                        onClick={() => setActiveItinerary(item)}
                      >
                        <div style={{ fontWeight: 600, fontSize: "13.5px", color: "#0f172a" }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          {item.days} days · {item.travelers} pax · {item.currency} {item.totalBudget}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="v2-btn v2-btn-danger v2-btn-sm"
                        onClick={() => handleDelete(item._id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {!activeItinerary ? (
              <div className="v2-card" style={{ textAlign: "center", padding: "48px 24px" }}>
                <h2 style={{ marginBottom: "8px" }}>Ready to design your next journey</h2>
                <p style={{ color: "#64748b", maxWidth: "480px", margin: "0 auto" }}>
                  Fill out your trip preferences on the left and click Generate Smart Itinerary.
                  Every destination ID is validated against Travelogia&apos;s database and budgets are
                  computed server-side.
                </p>
              </div>
            ) : (
              <>
                <div className="v2-card">
                  <div className="v2-card-title">
                    <span>{activeItinerary.title}</span>
                    <span className={`v2-chip ${activeItinerary.budgetSummary?.overBudget ? "v2-chip-warn" : "v2-chip-yes"}`}>
                      {activeItinerary.budgetSummary?.overBudget ? "Above Target Budget" : "Within Target Budget"}
                    </span>
                  </div>

                  <div className="v2-stat-strip">
                    <div className="v2-stat-box">
                      <div className="v2-stat-label">Starting City</div>
                      <div className="v2-stat-value" style={{ fontSize: "16px" }}>
                        {activeItinerary.startingCity}
                      </div>
                    </div>
                    <div className="v2-stat-box">
                      <div className="v2-stat-label">Server Est. Group Total</div>
                      <div className="v2-stat-value">
                        {activeItinerary.currency}{" "}
                        {(activeItinerary.budgetSummary?.estimatedGroupTotal || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="v2-stat-box">
                      <div className="v2-stat-label">Server Est. Per Person</div>
                      <div className="v2-stat-value">
                        {activeItinerary.currency}{" "}
                        {(activeItinerary.budgetSummary?.estimatedPerPerson || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="v2-stat-box">
                      <div className="v2-stat-label">Target Budget</div>
                      <div className="v2-stat-value">
                        {activeItinerary.currency} {(activeItinerary.totalBudget || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {groundedDestinations.length > 0 && (
                    <div style={{ marginBottom: "14px" }}>
                      <RouteMap stops={groundedDestinations} height="280px" />
                    </div>
                  )}

                  {activeItinerary.budgetSummary?.disclaimer && (
                    <div className="v2-disclaimer">ℹ️ {activeItinerary.budgetSummary.disclaimer}</div>
                  )}
                </div>

                {(activeItinerary.dayPlans || []).map((day) => (
                  <div className="v2-card" key={day.dayNumber}>
                    <div className="v2-card-title">
                      <span>
                        Day {day.dayNumber}: {day.title}
                      </span>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {day.destinationId && (
                          <Link
                            to={`/travels/${day.destinationId}`}
                            className="v2-btn v2-btn-secondary v2-btn-sm"
                          >
                            View Catalogue Page →
                          </Link>
                        )}
                        <button
                          type="button"
                          className="v2-btn v2-btn-accent v2-btn-sm"
                          disabled={regenDay === day.dayNumber}
                          onClick={() => handleRegenerateDay(day.dayNumber)}
                        >
                          {regenDay === day.dayNumber ? "Regenerating..." : "↻ Regenerate Day"}
                        </button>
                      </div>
                    </div>

                    {day.accommodationArea && (
                      <p style={{ fontSize: "13.5px", color: "#475569", marginBottom: "10px" }}>
                        🏨 <strong>Suggested Stay Area:</strong> {day.accommodationArea}
                      </p>
                    )}

                    <div className="v2-grid-2">
                      <div>
                        <strong style={{ fontSize: "13px", color: "#1e3a8a" }}>Activities</strong>
                        <ul style={{ paddingLeft: "18px", marginTop: "6px", fontSize: "13.5px" }}>
                          {(day.activities || []).map((a, idx) => (
                            <li key={idx}>{a}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <strong style={{ fontSize: "13px", color: "#1e3a8a" }}>
                          Key Attractions &amp; Food
                        </strong>
                        <ul style={{ paddingLeft: "18px", marginTop: "6px", fontSize: "13.5px" }}>
                          {(day.attractions || []).map((a, idx) => (
                            <li key={`att-${idx}`}>📍 {a}</li>
                          ))}
                          {(day.foodRecommendations || []).map((f, idx) => (
                            <li key={`food-${idx}`}>🍽️ {f}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {Array.isArray(day.travelTips) && day.travelTips.length > 0 && (
                      <div className="v2-disclaimer" style={{ marginTop: "10px" }}>
                        <strong>Tips:</strong> {day.travelTips.join(" · ")}
                      </div>
                    )}

                    <div style={{ marginTop: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
                      {editingNoteDay === day.dayNumber ? (
                        <div style={{ display: "flex", gap: "8px" }}>
                          <input
                            className="v2-input"
                            placeholder="Add personal note for this day..."
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                          />
                          <button
                            type="button"
                            className="v2-btn v2-btn-primary v2-btn-sm"
                            onClick={() => handleSaveNote(day.dayNumber)}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "13px", color: "#64748b" }}>
                            📝 {day.notes || "No personal notes yet."}
                          </span>
                          <button
                            type="button"
                            className="v2-btn v2-btn-secondary v2-btn-sm"
                            onClick={() => {
                              setEditingNoteDay(day.dayNumber);
                              setNoteDraft(day.notes || "");
                            }}
                          >
                            Edit Note
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
