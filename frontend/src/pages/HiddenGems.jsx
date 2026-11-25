import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";
import DestinationMap from "../components/DestinationMap";

export default function HiddenGems() {
  const { favoriteIds, toggleFavorite } = useAuth();
  const [gems, setGems] = useState([]);
  const [regions, setRegions] = useState([]);
  const [filters, setFilters] = useState({
    region: "",
    category: "",
    maxPrice: "",
    season: "",
    startCity: "Kolkata",
    maxDistanceKm: "",
    interest: "",
    crowdPreference: "offbeat",
  });
  const [viewMode, setViewMode] = useState("grid");
  const [loading, setLoading] = useState(true);
  const [aiAdvice, setAiAdvice] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get("/hidden-gems", { params: filters });
        if (!active) return;
        setGems(res.data?.data || []);
        if (res.data?.availableRegions) setRegions(res.data.availableRegions);
        setError("");
      } catch (err) {
        if (active) setError(getErrorMessage(err, "Could not load hidden gems."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [filters]);

  const handleAskAi = async () => {
    setAiLoading(true);
    setError("");
    try {
      const res = await api.post("/hidden-gems/ai-suggestions", {
        interests: filters.interest || "quiet mountains, rivers, local heritage",
        season: filters.season || "Autumn / Spring",
        budget: filters.maxPrice || "moderate",
        region: filters.region,
      });
      setAiAdvice(res.data?.data?.advice || "");
    } catch (err) {
      setError(getErrorMessage(err, "Could not generate AI hidden gem suggestions."));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>🌿 Beyond the Tourist Trail — Hidden Gems</h1>
          <p>
            Discover curated offbeat retreats across Northeast India, North Bengal, and quiet corners of
            the globe. Filter by region, season, budget, and distance from your starting city.
          </p>
        </div>

        {error && <div className="v2-alert-error">{error}</div>}

        <div className="v2-card" style={{ marginBottom: "20px" }}>
          <div className="v2-grid-3">
            <div className="v2-field" style={{ marginBottom: 0 }}>
              <label>Region</label>
              <select
                className="v2-select"
                value={filters.region}
                onChange={(e) => setFilters({ ...filters, region: e.target.value })}
              >
                <option value="">All Offbeat Regions</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="v2-field" style={{ marginBottom: 0 }}>
              <label>Category</label>
              <select
                className="v2-select"
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              >
                <option value="">All Categories</option>
                {["Mountain", "Nature", "Cultural", "Adventure", "Beach", "Spiritual", "Historical"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="v2-field" style={{ marginBottom: 0 }}>
              <label>Season</label>
              <select
                className="v2-select"
                value={filters.season}
                onChange={(e) => setFilters({ ...filters, season: e.target.value })}
              >
                <option value="">Any Season</option>
                <option value="Spring">Spring</option>
                <option value="Summer">Summer</option>
                <option value="Autumn">Autumn</option>
                <option value="Winter">Winter</option>
              </select>
            </div>
            <div className="v2-field" style={{ marginBottom: 0 }}>
              <label>Max Nightly Estimate ($)</label>
              <input
                type="number"
                min="20"
                className="v2-input"
                placeholder="e.g., 80"
                value={filters.maxPrice}
                onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
              />
            </div>
            <div className="v2-field" style={{ marginBottom: 0 }}>
              <label>Distance From City</label>
              <select
                className="v2-select"
                value={filters.startCity}
                onChange={(e) => setFilters({ ...filters, startCity: e.target.value })}
              >
                <option value="">None</option>
                <option value="Kolkata">Kolkata</option>
                <option value="Siliguri">Siliguri / NJP</option>
                <option value="Guwahati">Guwahati</option>
                <option value="New Delhi">New Delhi</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Bengaluru">Bengaluru</option>
              </select>
            </div>
            <div className="v2-field" style={{ marginBottom: 0 }}>
              <label>Interest Keyword</label>
              <input
                className="v2-input"
                placeholder="e.g., tea, valley, river, trek"
                value={filters.interest}
                onChange={(e) => setFilters({ ...filters, interest: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "14px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                className={`v2-tab ${viewMode === "grid" ? "active" : ""}`}
                onClick={() => setViewMode("grid")}
              >
                Grid ({gems.length})
              </button>
              <button
                type="button"
                className={`v2-tab ${viewMode === "map" ? "active" : ""}`}
                onClick={() => setViewMode("map")}
              >
                Map View
              </button>
            </div>
            <button
              type="button"
              className="v2-btn v2-btn-accent v2-btn-sm"
              disabled={aiLoading}
              onClick={handleAskAi}
            >
              {aiLoading ? "Consulting Guide..." : "✨ Ask AI for Offbeat Picks"}
            </button>
          </div>

          {aiAdvice && (
            <div className="v2-alert-success" style={{ marginTop: "14px", whiteSpace: "pre-line" }}>
              <strong>AI Hidden Gem Picks:</strong>
              <div style={{ marginTop: "6px" }}>{aiAdvice}</div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="v2-card">Loading offbeat hidden gems...</div>
        ) : viewMode === "map" ? (
          <div className="v2-card">
            <DestinationMap destinations={gems} height="520px" theme="light" />
          </div>
        ) : (
          <div className="v2-grid-3">
            {gems.map((gem) => {
              const isFav = favoriteIds.has(gem._id);
              return (
                <div key={gem._id} className="v2-rec-card">
                  <img src={gem.image?.url} alt={gem.title} loading="lazy" />
                  <div className="v2-rec-card-body">
                    <div className="v2-chip-row">
                      <span className="v2-chip v2-chip-yes">{gem.region || "Offbeat"}</span>
                      <span className="v2-chip">{gem.category}</span>
                    </div>
                    <h3 style={{ fontSize: "17px", fontWeight: 700 }}>{gem.title}</h3>
                    <div style={{ fontSize: "13px", color: "#64748b" }}>
                      📍 {[gem.city, gem.state, gem.country].filter(Boolean).join(", ")}
                    </div>
                    <div style={{ fontSize: "13px", color: "#334155" }}>
                      ⭐ {gem.rating}/5 · Est. ${gem.pricePerNight}/night
                      {gem.straightLineDistanceKm !== null && ` · ~${gem.straightLineDistanceKm} km (straight-line)`}
                    </div>
                    <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.45 }}>
                      {gem.description?.slice(0, 120)}...
                    </p>
                    <div style={{ display: "flex", gap: "8px", marginTop: "auto", paddingTop: "10px" }}>
                      <Link to={`/travels/${gem._id}`} className="v2-btn v2-btn-primary v2-btn-sm" style={{ flex: 1 }}>
                        Explore
                      </Link>
                      <button
                        type="button"
                        className="v2-btn v2-btn-secondary v2-btn-sm"
                        onClick={() => toggleFavorite(gem._id)}
                      >
                        {isFav ? "♥" : "♡"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
