import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";
import PriceHistoryChart from "../components/PriceHistoryChart";

export default function PriceWatcher() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [allDestinations, setAllDestinations] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get("travelId") || "");
  const [history, setHistory] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [targetPrice, setTargetPrice] = useState("70");
  const [obsPrice, setObsPrice] = useState("");
  const [obsNote, setObsNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const dRes = await api.get("/travels", { params: { limit: 100 } });
        if (!active) return;
        const list = dRes.data?.data || [];
        setAllDestinations(list);
        if (!selectedId && list.length > 0) {
          setSelectedId(list[0]._id);
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
    if (!selectedId) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get(`/price-watch/history/${encodeURIComponent(selectedId)}`);
        if (active) setHistory(res.data?.data || null);
      } catch (err) {
        if (active) setError(getErrorMessage(err, "Could not load price history."));
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedId, reloadNonce]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const [aRes, nRes] = await Promise.all([
          api.get("/price-watch/alerts"),
          api.get("/price-watch/notifications"),
        ]);
        if (!active) return;
        setAlerts(aRes.data?.data || []);
        setNotifications(nRes.data?.data || []);
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [user, reloadNonce]);

  const handleCreateAlert = async (e) => {
    e.preventDefault();
    if (!user) {
      setError("Sign in to create price alerts.");
      return;
    }
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/price-watch/alerts", {
        travelId: selectedId,
        targetPricePerNight: Number(targetPrice),
      });
      setSuccess(
        res.data?.triggeredImmediately
          ? "Alert created and matched immediately! Check your Notification Center."
          : "Target budget alert created!",
      );
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Could not create alert."));
    }
  };

  const handleRecordObservation = async (e) => {
    e.preventDefault();
    if (!user) {
      setError("Sign in to log an estimated price observation.");
      return;
    }
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/price-watch/observations", {
        travelId: selectedId,
        estimatedPricePerNight: Number(obsPrice),
        note: obsNote,
      });
      const triggeredCount = res.data?.data?.triggeredAlerts?.length || 0;
      setObsPrice("");
      setObsNote("");
      setSuccess(
        triggeredCount > 0
          ? `Observation recorded and triggered ${triggeredCount} price alert(s)!`
          : "Estimated price observation recorded.",
      );
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Could not record price observation."));
    }
  };

  const handleDeleteAlert = async (id) => {
    try {
      await api.delete(`/price-watch/alerts/${id}`);
      setAlerts((prev) => prev.filter((a) => a._id !== id));
    } catch (err) {
      setError(getErrorMessage(err, "Could not delete alert."));
    }
  };

  const handleRunEvaluation = async () => {
    try {
      const res = await api.post("/price-watch/alerts/evaluate");
      setSuccess(
        `Evaluated ${res.data?.data?.evaluatedCount || 0} active alert(s); triggered ${res.data?.data?.triggeredCount || 0} notification(s).`,
      );
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Could not evaluate alerts."));
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await api.patch(`/price-watch/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    } catch {
      // ignore
    }
  };

  const activeAlertForSelected = alerts.find((a) => a.travelId === selectedId);

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>📉 Travel Deal &amp; Price Watcher</h1>
          <p>
            Track historical estimated nightly prices, log new price observations, set target-budget
            alerts, and receive persistent notifications when estimates match your target.
          </p>
        </div>

        {error && <div className="v2-alert-error">{error}</div>}
        {success && <div className="v2-alert-success">{success}</div>}

        <div className="v2-grid-sidebar">
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="v2-card">
              <div className="v2-card-title">Select Destination</div>
              <select
                className="v2-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {allDestinations.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.title} (Est. ${d.pricePerNight}/night)
                  </option>
                ))}
              </select>
            </div>

            <form className="v2-card" onSubmit={handleCreateAlert}>
              <div className="v2-card-title">Set Target Budget Alert</div>
              <div className="v2-field">
                <label>Notify me when est. nightly price ≤ ($)</label>
                <input
                  type="number"
                  min="1"
                  className="v2-input"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="v2-btn v2-btn-primary" style={{ width: "100%" }} disabled={!user}>
                🔔 Create Target Alert
              </button>
              {!user && (
                <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "8px" }}>
                  <Link to="/login" style={{ color: "#2563eb" }}>Sign in</Link> to save alerts and receive notifications.
                </p>
              )}
            </form>

            <form className="v2-card" onSubmit={handleRecordObservation}>
              <div className="v2-card-title">Record Estimated Price Check</div>
              <div className="v2-field">
                <label>Observed Nightly Price ($)</label>
                <input
                  type="number"
                  min="1"
                  className="v2-input"
                  placeholder="e.g., 65"
                  value={obsPrice}
                  onChange={(e) => setObsPrice(e.target.value)}
                  required
                />
              </div>
              <div className="v2-field">
                <label>Note (Optional)</label>
                <input
                  className="v2-input"
                  placeholder="e.g., Off-season homestay estimate"
                  value={obsNote}
                  onChange={(e) => setObsNote(e.target.value)}
                />
              </div>
              <button type="submit" className="v2-btn v2-btn-accent" style={{ width: "100%" }} disabled={!user}>
                + Record Observation
              </button>
            </form>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {history && (
              <div className="v2-card">
                <div className="v2-card-title">
                  <span>{history.destinationTitle} — Estimated Price Trend</span>
                  <span className="v2-chip v2-chip-warn">Planning Estimates</span>
                </div>

                <div className="v2-stat-strip">
                  <div className="v2-stat-box">
                    <div className="v2-stat-label">Latest Estimate</div>
                    <div className="v2-stat-value">${history.stats.currentEstimatedPrice}</div>
                  </div>
                  <div className="v2-stat-box">
                    <div className="v2-stat-label">6-Period Low</div>
                    <div className="v2-stat-value">${history.stats.minEstimatedPrice}</div>
                  </div>
                  <div className="v2-stat-box">
                    <div className="v2-stat-label">Average Estimate</div>
                    <div className="v2-stat-value">${history.stats.avgEstimatedPrice}</div>
                  </div>
                  <div className="v2-stat-box">
                    <div className="v2-stat-label">6-Period High</div>
                    <div className="v2-stat-value">${history.stats.maxEstimatedPrice}</div>
                  </div>
                </div>

                <PriceHistoryChart
                  observations={history.observations}
                  targetPrice={activeAlertForSelected?.targetPricePerNight || Number(targetPrice) || null}
                  currency={history.currency}
                />

                <div className="v2-disclaimer">ℹ️ {history.disclaimer}</div>
              </div>
            )}

            {user && (
              <div className="v2-grid-2">
                <div className="v2-card">
                  <div className="v2-card-title">
                    <span>My Active Alerts ({alerts.length})</span>
                    <button type="button" className="v2-btn v2-btn-secondary v2-btn-sm" onClick={handleRunEvaluation}>
                      Check Now
                    </button>
                  </div>
                  {alerts.length === 0 ? (
                    <p style={{ fontSize: "13px", color: "#64748b" }}>No target alerts yet.</p>
                  ) : (
                    alerts.map((a) => (
                      <div
                        key={a._id}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "14px" }}>{a.destinationTitle}</div>
                          <div style={{ fontSize: "12px", color: "#64748b" }}>
                            Target ≤ ${a.targetPricePerNight}/night
                          </div>
                        </div>
                        <button
                          type="button"
                          className="v2-btn v2-btn-danger v2-btn-sm"
                          onClick={() => handleDeleteAlert(a._id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="v2-card">
                  <div className="v2-card-title">Notification Inbox ({notifications.length})</div>
                  {notifications.length === 0 ? (
                    <p style={{ fontSize: "13px", color: "#64748b" }}>No notifications yet.</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n._id}
                        style={{
                          padding: "10px",
                          borderRadius: "10px",
                          background: n.read ? "#f8fafc" : "#eff6ff",
                          border: "1px solid #e2e8f0",
                          marginBottom: "8px",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: "13.5px" }}>{n.title}</div>
                        <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "3px" }}>
                          {n.message}
                        </div>
                        {!n.read && (
                          <button
                            type="button"
                            className="v2-btn v2-btn-secondary v2-btn-sm"
                            style={{ marginTop: "6px" }}
                            onClick={() => handleMarkRead(n._id)}
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
