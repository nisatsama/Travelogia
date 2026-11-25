import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";

const CATEGORIES = ["Beach", "Mountain", "Historical", "Adventure", "City", "Nature", "Spiritual", "Cultural"];

export default function RecommendationSection() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTuner, setShowTuner] = useState(false);
  const [selectedCats, setSelectedCats] = useState([]);
  const [maxBudget, setMaxBudget] = useState(250);
  const [season, setSeason] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get("/recommendations", { params: { limit: 6 } });
        if (!active) return;
        const payload = res.data?.data;
        setData(payload || null);
        if (payload?.preferences) {
          setSelectedCats(payload.preferences.preferredCategories || []);
          setMaxBudget(payload.preferences.maxBudgetPerNight || 250);
          setSeason(payload.preferences.preferredSeason || "");
        }
      } catch {
        // non-blocking homepage enhancement
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const toggleCategory = (cat) => {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleSavePrefs = async () => {
    setSaving(true);
    setFeedback("");
    try {
      const res = await api.put("/recommendations/preferences", {
        preferredCategories: selectedCats,
        maxBudgetPerNight: Number(maxBudget) || 250,
        preferredSeason: season,
      });
      setData(res.data?.data || data);
      setFeedback("Personalization preferences updated.");
      setShowTuner(false);
    } catch (err) {
      setFeedback(getErrorMessage(err, "Sign in to save personalized preferences."));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setFeedback("");
    try {
      const res = await api.post("/recommendations/reset");
      setData(res.data?.data || data);
      setSelectedCats([]);
      setMaxBudget(300);
      setSeason("");
      setFeedback("Personalization reset to defaults.");
    } catch (err) {
      setFeedback(getErrorMessage(err, "Could not reset personalization."));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) return null;

  return (
    <section className="v2-home-rec-section" aria-label="Recommended for You">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
        <div>
          <h2 style={{ fontSize: "28px", fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>
            {user ? `Recommended for ${user.username}` : "Recommended Destinations"}
          </h2>
          <p style={{ fontSize: "14px", color: "#475569" }}>
            {data.algorithmLabel}
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {user && (
            <>
              <button
                type="button"
                className="v2-btn v2-btn-secondary v2-btn-sm"
                onClick={() => setShowTuner((s) => !s)}
              >
                {showTuner ? "Close Preferences" : "Tune Preferences"}
              </button>
              <button
                type="button"
                className="v2-btn v2-btn-secondary v2-btn-sm"
                onClick={handleReset}
                disabled={saving}
              >
                Reset
              </button>
            </>
          )}
          <Link to="/hidden-gems" className="v2-btn v2-btn-accent v2-btn-sm">
            Explore Hidden Gems →
          </Link>
        </div>
      </div>

      {feedback && <div className="v2-alert-success">{feedback}</div>}

      {showTuner && user && (
        <div className="v2-card" style={{ marginBottom: "18px" }}>
          <div className="v2-card-title">Personalize Your Scoring Weights &amp; Preferences</div>
          <div className="v2-chip-row" style={{ marginBottom: "12px" }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`v2-tab ${selectedCats.includes(cat) ? "active" : ""}`}
                onClick={() => toggleCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="v2-grid-2">
            <div className="v2-field">
              <label>Max Nightly Estimate (USD): ${maxBudget}</label>
              <input
                type="range"
                min="30"
                max="500"
                step="10"
                value={maxBudget}
                onChange={(e) => setMaxBudget(Number(e.target.value))}
              />
            </div>
            <div className="v2-field">
              <label>Preferred Travel Season</label>
              <select className="v2-select" value={season} onChange={(e) => setSeason(e.target.value)}>
                <option value="">Any Season</option>
                <option value="Spring">Spring</option>
                <option value="Summer">Summer</option>
                <option value="Autumn">Autumn</option>
                <option value="Winter">Winter</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            className="v2-btn v2-btn-primary v2-btn-sm"
            onClick={handleSavePrefs}
            disabled={saving}
          >
            {saving ? "Saving..." : "Apply Preferences"}
          </button>
        </div>
      )}

      <div className="v2-grid-3">
        {(data.recommendations || []).map((item) => (
          <div className="v2-rec-card" key={item._id}>
            <img src={item.image?.url} alt={item.title} loading="lazy" />
            <div className="v2-rec-card-body">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                <span className="v2-chip">{item.category}</span>
                <span className="v2-chip v2-chip-yes">{item.matchScore}% match</span>
              </div>
              <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>{item.title}</h3>
              <p style={{ fontSize: "13px", color: "#64748b" }}>
                📍 {[item.city, item.country].filter(Boolean).join(", ")} · Est. ${item.pricePerNight}/night
              </p>
              <div style={{ fontSize: "12px", color: "#334155", marginTop: "4px" }}>
                {(item.reasons || []).map((r, i) => (
                  <div key={i}>• {r}</div>
                ))}
              </div>
              <div style={{ marginTop: "auto", paddingTop: "10px" }}>
                <Link to={`/travels/${item._id}`} className="v2-btn v2-btn-primary v2-btn-sm" style={{ width: "100%" }}>
                  View Destination
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
