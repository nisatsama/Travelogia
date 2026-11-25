import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";

export default function TravelReadinessCard({ travelId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!travelId) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get(`/readiness/${encodeURIComponent(travelId)}`);
        if (!active) return;
        setReport(res.data?.data || null);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, "Could not load Travel Readiness insights."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [travelId]);

  if (loading) {
    return (
      <div className="glass-section">
        <h2 className="section-title">🛡️ Travel Readiness &amp; Risk Intelligence</h2>
        <p className="v2-dark-muted">Checking weather, permits, and regional access...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="glass-section">
        <h2 className="section-title">🛡️ Travel Readiness &amp; Risk Intelligence</h2>
        <p className="v2-dark-muted">{error || "Readiness intelligence currently unavailable."}</p>
      </div>
    );
  }

  const { weather, advisories } = report;

  return (
    <div className="glass-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          🛡️ Travel Readiness &amp; Risk Intelligence
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              background: report.readinessScore >= 80 ? "#16a34a" : report.readinessScore >= 60 ? "#d97706" : "#dc2626",
              color: "#fff",
              padding: "6px 14px",
              borderRadius: "999px",
              fontWeight: 700,
              fontSize: "14px",
            }}
          >
            Readiness Score: {report.readinessScore}/100 ({report.readinessBand})
          </span>
        </div>
      </div>

      <p className="v2-dark-muted" style={{ marginTop: "8px" }}>
        {report.scoreExplanation}
      </p>

      <div className="v2-dark-grid">
        <div className="v2-dark-box">
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>
            🌦️ Live Weather{" "}
            <span style={{ fontSize: "11px", opacity: 0.8 }}>
              ({weather?.available ? "Live: Open-Meteo" : "Fallback"})
            </span>
          </div>
          {weather?.available ? (
            <>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>
                {weather.temperatureC}°C · {weather.condition}
              </div>
              <div className="v2-dark-muted">
                Wind: {weather.windspeedKmh} km/h
                {weather.precipProbabilityPct !== null ? ` · Rain prob: ${weather.precipProbabilityPct}%` : ""}
              </div>
              <div className="v2-dark-muted" style={{ fontSize: "11px", marginTop: "4px" }}>
                Updated: {new Date(weather.fetchedAt).toLocaleTimeString()}
              </div>
            </>
          ) : (
            <p className="v2-dark-muted">{weather?.note}</p>
          )}
        </div>

        <div className="v2-dark-box">
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>
            📄 Permits &amp; Entry{" "}
            <span style={{ fontSize: "11px", opacity: 0.8 }}>(Curated Estimate)</span>
          </div>
          <div style={{ fontWeight: 600, color: advisories.permitRequired ? "#fbbf24" : "#86efac", marginBottom: "4px" }}>
            {advisories.permitRequired ? "Advance Permit Required" : "Standard ID / Entry"}
          </div>
          <p className="v2-dark-muted">{advisories.permitDetails}</p>
        </div>

        <div className="v2-dark-box">
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>🛣️ Road &amp; Transit Access</div>
          <p className="v2-dark-muted">{advisories.roadAccessibility}</p>
          <div className="v2-dark-muted" style={{ marginTop: "6px" }}>
            <strong>Seasonal Advisory:</strong> {advisories.seasonalAdvisory}
          </div>
        </div>

        <div className="v2-dark-box">
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>🚑 Emergency Contacts</div>
          <p className="v2-dark-muted">{advisories.emergencyNumber}</p>
          <div className="v2-dark-muted" style={{ fontSize: "11px", marginTop: "6px" }}>
            Source: {advisories.source} · Reviewed: {advisories.lastUpdated}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "16px" }}>
        <div style={{ fontWeight: 600, marginBottom: "8px", color: "#fff" }}>
          Score Breakdown &amp; Preparation Checklist
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
          {(report.factors || []).map((f, idx) => (
            <span
              key={idx}
              style={{
                fontSize: "12px",
                padding: "4px 10px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.18)",
                color: "#f8fafc",
              }}
            >
              {f.label}: {f.impact >= 0 ? `+${f.impact}` : f.impact}
            </span>
          ))}
        </div>
        <ul className="details-tips-list">
          {(advisories.preparationChecklist || []).map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>

      <p className="v2-dark-muted" style={{ marginTop: "10px", fontSize: "12px", opacity: 0.85 }}>
        ℹ️ {report.disclaimer}
      </p>
    </div>
  );
}
