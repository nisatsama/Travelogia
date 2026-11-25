import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import V2NavBar from "../components/V2NavBar";

function TriBadge({ value }) {
  const v = value || "unknown";
  const cls =
    v === "yes" ? "v2-chip-yes" : v === "no" ? "v2-chip-no" : "v2-chip-unknown";
  return <span className={`v2-chip ${cls}`}>{v.toUpperCase()}</span>;
}

export default function DestinationCompare() {
  const [searchParams] = useSearchParams();
  const [allDestinations, setAllDestinations] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => {
    const raw = searchParams.get("ids") || "";
    return raw ? raw.split(",").filter(Boolean).slice(0, 3) : [];
  });
  const [startCity, setStartCity] = useState("Kolkata");
  const [preferences, setPreferences] = useState("");
  const [result, setResult] = useState(null);
  const [aiSummary, setAiSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get("/travels", { params: { limit: 100 } });
        if (!active) return;
        const list = res.data?.data || [];
        setAllDestinations(list);
        if (selectedIds.length === 0 && list.length >= 2) {
          setSelectedIds([list[0]._id, list[1]._id]);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedIds.length < 2) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.post("/compare", {
          destinationIds: selectedIds,
          startCity,
        });
        if (active) setResult(res.data?.data || null);
      } catch (err) {
        if (active) setError(getErrorMessage(err, "Could not compare selected destinations."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedIds, startCity]);

  const handleSlotChange = (slotIdx, nextId) => {
    const copy = [...selectedIds];
    if (!nextId) {
      copy.splice(slotIdx, 1);
    } else {
      copy[slotIdx] = nextId;
    }
    setSelectedIds(Array.from(new Set(copy.filter(Boolean))).slice(0, 3));
    setAiSummary("");
  };

  const handleGenerateAiSummary = async () => {
    setAiLoading(true);
    setError("");
    try {
      const res = await api.post("/compare/ai-summary", {
        destinationIds: selectedIds,
        startCity,
        preferences,
      });
      setAiSummary(res.data?.data?.summary || "");
    } catch (err) {
      setError(getErrorMessage(err, "Could not generate AI comparison summary."));
    } finally {
      setAiLoading(false);
    }
  };

  const destinations = result?.destinations || [];
  const adv = result?.advantages || {};

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>⚖️ Smart Destination Comparison</h1>
          <p>
            Compare up to 3 Travelogia destinations side-by-side across estimated budget, rating,
            season, straight-line distance from your starting city, and 3-state accessibility data.
          </p>
        </div>

        {error && <div className="v2-alert-error">{error}</div>}

        <div className="v2-card" style={{ marginBottom: "20px" }}>
          <div className="v2-grid-3">
            {[0, 1, 2].map((idx) => (
              <div className="v2-field" key={idx} style={{ marginBottom: 0 }}>
                <label>Destination {idx + 1} {idx === 2 ? "(Optional)" : ""}</label>
                <select
                  className="v2-select"
                  value={selectedIds[idx] || ""}
                  onChange={(e) => handleSlotChange(idx, e.target.value)}
                >
                  <option value="">-- Select destination --</option>
                  {allDestinations.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.title} ({d.city}, {d.country})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="v2-grid-2" style={{ marginTop: "12px" }}>
            <div className="v2-field" style={{ marginBottom: 0 }}>
              <label>Starting City (for distance estimate)</label>
              <select className="v2-select" value={startCity} onChange={(e) => setStartCity(e.target.value)}>
                <option value="Kolkata">Kolkata</option>
                <option value="New Delhi">New Delhi</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Bengaluru">Bengaluru</option>
                <option value="Guwahati">Guwahati</option>
                <option value="London">London</option>
                <option value="New York">New York</option>
              </select>
            </div>
            <div className="v2-field" style={{ marginBottom: 0 }}>
              <label>Your Priorities (for grounded AI comparison)</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  className="v2-input"
                  placeholder="e.g., family comfort, low budget, scenic photography"
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                />
                <button
                  type="button"
                  className="v2-btn v2-btn-accent v2-btn-sm"
                  disabled={aiLoading || selectedIds.length < 2}
                  onClick={handleGenerateAiSummary}
                >
                  {aiLoading ? "Comparing..." : "✨ AI Summary"}
                </button>
              </div>
            </div>
          </div>

          {aiSummary && (
            <div className="v2-alert-success" style={{ marginTop: "14px", whiteSpace: "pre-line" }}>
              <strong>Grounded Travelogia AI Comparison:</strong>
              <div style={{ marginTop: "6px" }}>{aiSummary}</div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="v2-card">Loading side-by-side matrix...</div>
        ) : destinations.length >= 2 ? (
          <div className="v2-card" style={{ overflowX: "auto" }}>
            <table className="v2-table">
              <thead>
                <tr>
                  <th style={{ width: "180px" }}>Attribute</th>
                  {destinations.map((d) => (
                    <th key={d._id}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{d.title}</div>
                      <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 400 }}>
                        {d.city}, {d.country}
                      </div>
                      <div className="v2-chip-row" style={{ marginTop: "6px" }}>
                        {adv.mostBudgetFriendlyId === d._id && (
                          <span className="v2-chip v2-chip-yes">Best Budget</span>
                        )}
                        {adv.highestRatedId === d._id && (
                          <span className="v2-chip v2-chip-warn">Top Rated</span>
                        )}
                        {adv.closestFromStartId === d._id && (
                          <span className="v2-chip">Closest</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Photo</th>
                  {destinations.map((d) => (
                    <td key={d._id}>
                      <img
                        src={d.image?.url}
                        alt={d.title}
                        style={{ width: "100%", height: "140px", objectFit: "cover", borderRadius: "10px" }}
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Est. Price / Night</th>
                  {destinations.map((d) => (
                    <td key={d._id}>
                      <strong>${d.pricePerNight}</strong> <span style={{ fontSize: "12px", color: "#64748b" }}>(Estimate)</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Rating</th>
                  {destinations.map((d) => (
                    <td key={d._id}>⭐ {d.rating} / 5</td>
                  ))}
                </tr>
                <tr>
                  <th>Category &amp; Region</th>
                  {destinations.map((d) => (
                    <td key={d._id}>
                      {d.category} · {d.region || d.country}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Distance from {startCity}</th>
                  {destinations.map((d) => (
                    <td key={d._id}>
                      {d.distanceFromStartKm !== null
                        ? `~${d.distanceFromStartKm} km (straight-line)`
                        : "N/A"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Best Time &amp; Stay</th>
                  {destinations.map((d) => (
                    <td key={d._id}>
                      {d.bestTimeToVisit}
                      <div style={{ fontSize: "12px", color: "#64748b" }}>{d.estimatedDuration}</div>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Wheelchair Accessible</th>
                  {destinations.map((d) => (
                    <td key={d._id}>
                      <TriBadge value={d.accessibility?.wheelchairAccessible} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Accessible Stay</th>
                  {destinations.map((d) => (
                    <td key={d._id}>
                      <TriBadge value={d.accessibility?.accessibleAccommodation} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Public Transit</th>
                  {destinations.map((d) => (
                    <td key={d._id}>
                      <TriBadge value={d.accessibility?.publicTransport} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Family Friendly</th>
                  {destinations.map((d) => (
                    <td key={d._id}>
                      <TriBadge value={d.accessibility?.familyFriendly} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Walking Intensity</th>
                  {destinations.map((d) => (
                    <td key={d._id}>
                      <span className="v2-chip v2-chip-unknown">
                        {(d.accessibility?.walkingIntensity || "unknown").toUpperCase()}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Highlights</th>
                  {destinations.map((d) => (
                    <td key={d._id}>{(d.highlights || []).slice(0, 4).join(" · ")}</td>
                  ))}
                </tr>
                <tr>
                  <th>Action</th>
                  {destinations.map((d) => (
                    <td key={d._id}>
                      <Link to={`/travels/${d._id}`} className="v2-btn v2-btn-primary v2-btn-sm">
                        View Details →
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            {result?.disclaimer && <div className="v2-disclaimer">ℹ️ {result.disclaimer}</div>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
