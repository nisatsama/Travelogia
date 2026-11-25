import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import V2NavBar from "../components/V2NavBar";
import RouteMap from "../components/RouteMap";

export default function RoutePlanner() {
  const [hubs, setHubs] = useState([]);
  const [allDestinations, setAllDestinations] = useState([]);
  const [startCity, setStartCity] = useState("Kolkata");
  const [selectedIds, setSelectedIds] = useState([]);
  const [returnToStart, setReturnToStart] = useState(true);
  const [travelers, setTravelers] = useState(2);
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [hRes, dRes] = await Promise.all([
          api.get("/routes/hubs"),
          api.get("/travels", { params: { limit: 100 } }),
        ]);
        if (!active) return;
        setHubs(hRes.data?.data || []);
        setAllDestinations(dRes.data?.data || []);
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const runPlan = async (ids, optimize = true) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/routes/optimize", {
        startCity,
        destinationIds: ids,
        returnToStart,
        optimize,
        travelers: Number(travelers) || 1,
      });
      const data = res.data?.data;
      setRouteData(data);
      if (data?.orderedStops) {
        setSelectedIds(data.orderedStops.map((s) => s._id));
      }
    } catch (err) {
      setError(getErrorMessage(err, "Could not optimize multi-destination route."));
    } finally {
      setLoading(false);
    }
  };

  const toggleStop = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 12),
    );
  };

  const loadNorthBengalPreset = () => {
    const presetTitles = ["darjeeling", "gangtok", "kalimpong", "kurseong", "sandakphu"];
    const ids = allDestinations
      .filter((d) => presetTitles.some((p) => d.title.toLowerCase().includes(p)))
      .slice(0, 4)
      .map((d) => d._id);
    if (ids.length >= 2) {
      setStartCity("Kolkata");
      setSelectedIds(ids);
      runPlan(ids, true);
    }
  };

  const moveStop = (idx, dir) => {
    const next = [...selectedIds];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setSelectedIds(next);
    runPlan(next, false);
  };

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>🗺️ Route Intelligence &amp; Multi-Destination Optimizer</h1>
          <p>
            Optimize multi-stop road &amp; regional trips using Nearest-Neighbour + 2-Opt TSP heuristics.
            Clearly separates Haversine straight-line km from estimated road distances and links directly
            to OpenStreetMap and Google Maps directions.
          </p>
        </div>

        {error && <div className="v2-alert-error">{error}</div>}

        <div className="v2-grid-sidebar">
          <div className="v2-card">
            <div className="v2-card-title">Route Controls</div>

            <div className="v2-field">
              <label>Starting Hub City</label>
              <select className="v2-select" value={startCity} onChange={(e) => setStartCity(e.target.value)}>
                <option value="">No fixed start hub</option>
                {hubs.map((h) => (
                  <option key={h.key} value={h.name}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="v2-grid-2">
              <div className="v2-field">
                <label>Travellers</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  className="v2-input"
                  value={travelers}
                  onChange={(e) => setTravelers(e.target.value)}
                />
              </div>
              <div className="v2-field" style={{ justifyContent: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginTop: "18px" }}>
                  <input
                    type="checkbox"
                    checked={returnToStart}
                    onChange={(e) => setReturnToStart(e.target.checked)}
                  />
                  Round trip
                </label>
              </div>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <button
                type="button"
                className="v2-btn v2-btn-secondary v2-btn-sm"
                style={{ width: "100%" }}
                onClick={loadNorthBengalPreset}
              >
                ⚡ Load Preset: Kolkata → Darjeeling / Sikkim Loop
              </button>
            </div>

            <div className="v2-field">
              <label>Select Stops ({selectedIds.length}/12 selected)</label>
              <div style={{ maxHeight: "260px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "8px" }}>
                {allDestinations.map((d) => (
                  <label
                    key={d._id}
                    style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "4px 0", cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(d._id)}
                      onChange={() => toggleStop(d._id)}
                    />
                    <span>
                      {d.title} ({d.city})
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="v2-btn v2-btn-primary"
              style={{ width: "100%" }}
              disabled={loading || selectedIds.length < 2}
              onClick={() => runPlan(selectedIds, true)}
            >
              {loading ? "Optimizing Route..." : "🧭 Optimize Stop Sequence (2-Opt)"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div className="v2-card">
              <div className="v2-card-title">
                <span>Interactive Route Map</span>
                {routeData?.algorithm && <span className="v2-chip">{routeData.algorithm}</span>}
              </div>
              <RouteMap
                startHub={routeData?.startHub || null}
                stops={routeData?.orderedStops || []}
                polyline={routeData?.polyline || []}
                height="400px"
              />
            </div>

            {routeData && (
              <>
                <div className="v2-card">
                  <div className="v2-stat-strip">
                    <div className="v2-stat-box">
                      <div className="v2-stat-label">Straight-Line Total (Haversine)</div>
                      <div className="v2-stat-value">{routeData.summary.totalStraightLineKm} km</div>
                    </div>
                    <div className="v2-stat-box">
                      <div className="v2-stat-label">Estimated Road Distance</div>
                      <div className="v2-stat-value">{routeData.summary.totalEstimatedRoadKm} km</div>
                    </div>
                    <div className="v2-stat-box">
                      <div className="v2-stat-label">Approx. Transit Time</div>
                      <div className="v2-stat-value">{routeData.summary.totalEstimatedHours} hrs</div>
                    </div>
                    <div className="v2-stat-box">
                      <div className="v2-stat-label">Est. Transfer Cost</div>
                      <div className="v2-stat-value">${routeData.summary.estimatedTransferCostUSD}</div>
                    </div>
                  </div>

                  <div className="v2-card-title">Stop Order (Reorder Anytime)</div>
                  {(routeData.orderedStops || []).map((stop, idx) => (
                    <div
                      key={stop._id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 10px",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <div>
                        <strong>#{idx + 1} {stop.title}</strong> · {stop.city}, {stop.country}
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="v2-btn v2-btn-secondary v2-btn-sm"
                          disabled={idx === 0}
                          onClick={() => moveStop(idx, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="v2-btn v2-btn-secondary v2-btn-sm"
                          disabled={idx === routeData.orderedStops.length - 1}
                          onClick={() => moveStop(idx, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="v2-card">
                  <div className="v2-card-title">Leg-by-Leg Breakdown</div>
                  <table className="v2-table">
                    <thead>
                      <tr>
                        <th>Leg</th>
                        <th>Straight-Line</th>
                        <th>Est. Road</th>
                        <th>Approx. Mode &amp; Time</th>
                        <th>Live Maps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(routeData.legs || []).map((leg, i) => (
                        <tr key={i}>
                          <td>
                            <strong>{leg.fromTitle}</strong> → <strong>{leg.toTitle}</strong>
                          </td>
                          <td>{leg.straightLineKm} km</td>
                          <td>{leg.estimatedRoadKm} km</td>
                          <td>
                            {leg.suggestedMode} (~{leg.estimatedTravelHours}h)
                          </td>
                          <td style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <a
                              href={leg.osmDirectionsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="v2-btn v2-btn-secondary v2-btn-sm"
                            >
                              OSM
                            </a>
                            <a
                              href={leg.googleMapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="v2-btn v2-btn-secondary v2-btn-sm"
                            >
                              Google Maps
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="v2-disclaimer">ℹ️ {routeData.summary.disclaimer}</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
