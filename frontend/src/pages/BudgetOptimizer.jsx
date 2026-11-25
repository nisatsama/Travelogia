import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";

export default function BudgetOptimizer() {
  const { user } = useAuth();
  const [allDestinations, setAllDestinations] = useState([]);
  const [savedPlans, setSavedPlans] = useState([]);
  const [form, setForm] = useState({
    name: "Himalayan Escape Budget",
    totalBudget: 900,
    currency: "USD",
    travelers: 2,
    duration: 5,
    accommodationPreference: "mid-range",
    transportPreference: "train-or-economy",
    destinationIds: [],
  });
  const [result, setResult] = useState(null);
  const [activeSaved, setActiveSaved] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get("/travels", { params: { limit: 100 } });
        if (active) setAllDestinations(res.data?.data || []);
      } catch {
        // ignore
      }
      if (user) {
        try {
          const bRes = await api.get("/budgets");
          if (active) setSavedPlans(bRes.data?.data || []);
        } catch {
          // ignore
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const handleCalculate = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/budgets/calculate", {
        ...form,
        totalBudget: Number(form.totalBudget),
        travelers: Number(form.travelers),
        duration: Number(form.duration),
      });
      setResult(res.data?.data);
      setActiveSaved(null);
    } catch (err) {
      setError(getErrorMessage(err, "Could not calculate budget breakdown."));
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlan = async (useRevisedPlan = false) => {
    if (!user) {
      setError("Sign in to save and track budget plans.");
      return;
    }
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/budgets", {
        ...form,
        totalBudget: Number(form.totalBudget),
        travelers: Number(form.travelers),
        duration: Number(form.duration),
        useRevisedPlan,
      });
      const saved = res.data?.data;
      setSavedPlans((prev) => [saved, ...prev]);
      setActiveSaved(saved);
      setSuccess(
        useRevisedPlan
          ? "Saved optimized target-budget plan! You can now track actual expenses below."
          : "Saved estimated budget plan!",
      );
    } catch (err) {
      setError(getErrorMessage(err, "Could not save budget plan."));
    }
  };

  const handleUpdateSavedCategories = async (updatedCategories) => {
    if (!activeSaved?._id) return;
    try {
      const res = await api.put(`/budgets/${activeSaved._id}`, {
        categories: updatedCategories,
      });
      const updated = res.data?.data;
      setActiveSaved(updated);
      setSavedPlans((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
      setSuccess("Updated estimated/actual spending.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not update category amounts."));
    }
  };

  const handleCompareScenarios = async () => {
    setError("");
    try {
      const base = {
        totalBudget: Number(form.totalBudget),
        currency: form.currency,
        travelers: Number(form.travelers),
        duration: Number(form.duration),
        destinationIds: form.destinationIds,
      };
      const res = await api.post("/budgets/compare", {
        scenarios: [
          { ...base, label: "Backpacker / Budget", accommodationPreference: "budget", transportPreference: "public-bus" },
          { ...base, label: "Balanced Mid-Range", accommodationPreference: "mid-range", transportPreference: "train-or-economy" },
          { ...base, label: "Comfort / Luxury", accommodationPreference: "luxury", transportPreference: "domestic-flight" },
        ],
      });
      setComparison(res.data?.data || null);
    } catch (err) {
      setError(getErrorMessage(err, "Could not compare budget tiers."));
    }
  };

  const toggleDest = (id) => {
    setForm((prev) => ({
      ...prev,
      destinationIds: prev.destinationIds.includes(id)
        ? prev.destinationIds.filter((d) => d !== id)
        : [...prev.destinationIds, id].slice(0, 6),
    }));
  };

  const sym = form.currency === "INR" ? "₹" : "$";

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>💰 Intelligent Budget Optimizer</h1>
          <p>
            Server-calculated 7-category trip cost estimator with automatic over-budget detection,
            one-click target-budget optimization, cheaper catalogue alternatives, and actual spend tracking.
          </p>
        </div>

        {error && <div className="v2-alert-error">{error}</div>}
        {success && <div className="v2-alert-success">{success}</div>}

        <div className="v2-grid-sidebar">
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <form className="v2-card" onSubmit={handleCalculate}>
              <div className="v2-card-title">Budget Configuration</div>

              <div className="v2-field">
                <label>Plan Name</label>
                <input
                  className="v2-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
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
                  <label>Travellers</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    className="v2-input"
                    value={form.travelers}
                    onChange={(e) => setForm({ ...form, travelers: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Duration (Days)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    className="v2-input"
                    value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: e.target.value })}
                  />
                </div>
              </div>

              <div className="v2-field">
                <label>Accommodation Tier</label>
                <select
                  className="v2-select"
                  value={form.accommodationPreference}
                  onChange={(e) => setForm({ ...form, accommodationPreference: e.target.value })}
                >
                  <option value="budget">Budget / Homestay</option>
                  <option value="mid-range">Mid-Range</option>
                  <option value="luxury">Luxury</option>
                </select>
              </div>

              <div className="v2-field">
                <label>Primary Transit Tier</label>
                <select
                  className="v2-select"
                  value={form.transportPreference}
                  onChange={(e) => setForm({ ...form, transportPreference: e.target.value })}
                >
                  <option value="public-bus">Public Bus / Shared Transit</option>
                  <option value="train-or-economy">Train / Economy</option>
                  <option value="private-car">Private Car / Cab</option>
                  <option value="domestic-flight">Domestic Flight</option>
                </select>
              </div>

              <div className="v2-field">
                <label>Anchor Destinations ({form.destinationIds.length}/6 selected)</label>
                <div style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "8px" }}>
                  {allDestinations.slice(0, 40).map((d) => (
                    <label
                      key={d._id}
                      style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "3px 0", cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={form.destinationIds.includes(d._id)}
                        onChange={() => toggleDest(d._id)}
                      />
                      <span>
                        {d.title} (Est. ${d.pricePerNight}/night)
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button type="submit" className="v2-btn v2-btn-primary" disabled={loading}>
                  {loading ? "Calculating..." : "Calculate & Optimize Budget"}
                </button>
                <button type="button" className="v2-btn v2-btn-secondary" onClick={handleCompareScenarios}>
                  Compare Budget / Mid / Luxury Tiers
                </button>
              </div>
            </form>

            {savedPlans.length > 0 && (
              <div className="v2-card">
                <div className="v2-card-title">Saved Budget Plans</div>
                {savedPlans.map((p) => (
                  <div
                    key={p._id}
                    style={{
                      padding: "10px",
                      borderRadius: "10px",
                      border: activeSaved?._id === p._id ? "2px solid #2563eb" : "1px solid #e2e8f0",
                      marginBottom: "8px",
                      cursor: "pointer",
                    }}
                    onClick={() => setActiveSaved(p)}
                  >
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>{p.name}</div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      Target: {p.currency} {p.totalBudget} · Est: {p.estimatedGroupTotal} · Actual: {p.actualGroupTotal || 0}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {activeSaved && (
              <div className="v2-card">
                <div className="v2-card-title">
                  <span>Tracking Saved Plan: {activeSaved.name}</span>
                  <span className="v2-chip">
                    Actual vs Est: {activeSaved.currency} {activeSaved.actualGroupTotal || 0} /{" "}
                    {activeSaved.estimatedGroupTotal}
                  </span>
                </div>
                <table className="v2-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Estimated ({activeSaved.currency})</th>
                      <th>Actual Spent ({activeSaved.currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeSaved.categories || []).map((cat, idx) => (
                      <tr key={cat.key || idx}>
                        <td>{cat.label}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="v2-input"
                            style={{ maxWidth: "130px", padding: "6px 8px" }}
                            value={cat.estimated}
                            onChange={(e) => {
                              const next = activeSaved.categories.map((c, i) =>
                                i === idx ? { ...c, estimated: Number(e.target.value) || 0 } : c,
                              );
                              setActiveSaved({ ...activeSaved, categories: next });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="v2-input"
                            style={{ maxWidth: "130px", padding: "6px 8px" }}
                            value={cat.actual || 0}
                            onChange={(e) => {
                              const next = activeSaved.categories.map((c, i) =>
                                i === idx ? { ...c, actual: Number(e.target.value) || 0 } : c,
                              );
                              setActiveSaved({ ...activeSaved, categories: next });
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: "12px", display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    className="v2-btn v2-btn-primary v2-btn-sm"
                    onClick={() => handleUpdateSavedCategories(activeSaved.categories)}
                  >
                    Save Manual Adjustments &amp; Actual Spend
                  </button>
                </div>
              </div>
            )}

            {result && (
              <div className="v2-card">
                <div className="v2-card-title">
                  <span>Estimated Breakdown ({result.currency})</span>
                  <span className={`v2-chip ${result.overBudget ? "v2-chip-no" : "v2-chip-yes"}`}>
                    {result.overBudget
                      ? `Over budget by ${sym}${result.overBudgetAmount.toLocaleString()}`
                      : "Within Target Budget"}
                  </span>
                </div>

                <div className="v2-stat-strip">
                  <div className="v2-stat-box">
                    <div className="v2-stat-label">Estimated Group Total</div>
                    <div className="v2-stat-value">
                      {sym}
                      {result.estimatedGroupTotal.toLocaleString()}
                    </div>
                  </div>
                  <div className="v2-stat-box">
                    <div className="v2-stat-label">Estimated Per Person</div>
                    <div className="v2-stat-value">
                      {sym}
                      {result.estimatedPerPerson.toLocaleString()}
                    </div>
                  </div>
                  <div className="v2-stat-box">
                    <div className="v2-stat-label">Target Budget</div>
                    <div className="v2-stat-value">
                      {sym}
                      {result.totalBudget.toLocaleString()}
                    </div>
                  </div>
                </div>

                <table className="v2-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Estimated ({result.currency})</th>
                      <th>Share</th>
                      {result.revisedPlan && <th>Optimized Target ({result.currency})</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.categories.map((cat, idx) => (
                      <tr key={cat.key}>
                        <td>{cat.label}</td>
                        <td>
                          {sym}
                          {cat.estimated.toLocaleString()}
                        </td>
                        <td>{cat.percentage}%</td>
                        {result.revisedPlan && (
                          <td style={{ color: "#15803d", fontWeight: 600 }}>
                            {sym}
                            {result.revisedPlan.categories[idx]?.estimated.toLocaleString()}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: "14px" }}>
                  <strong>Optimization Recommendations</strong>
                  <ul style={{ paddingLeft: "18px", marginTop: "6px", fontSize: "13.5px" }}>
                    {(result.optimizationSuggestions || []).map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginTop: "14px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="v2-btn v2-btn-primary v2-btn-sm"
                    onClick={() => handleSavePlan(false)}
                  >
                    Save Plan
                  </button>
                  {result.revisedPlan && (
                    <button
                      type="button"
                      className="v2-btn v2-btn-accent v2-btn-sm"
                      onClick={() => handleSavePlan(true)}
                    >
                      Apply &amp; Save Optimized Target Plan ({sym}
                      {result.revisedPlan.revisedGroupTotal.toLocaleString()})
                    </button>
                  )}
                </div>

                {Array.isArray(result.cheaperAlternatives) && result.cheaperAlternatives.length > 0 && (
                  <div style={{ marginTop: "18px" }}>
                    <strong>Budget-Friendly Catalogue Alternatives</strong>
                    <div className="v2-grid-2" style={{ marginTop: "10px" }}>
                      {result.cheaperAlternatives.map((alt) => (
                        <div key={alt._id} className="v2-stat-box">
                          <div style={{ fontWeight: 700 }}>{alt.title}</div>
                          <div style={{ fontSize: "12.5px", color: "#64748b" }}>
                            {alt.city}, {alt.country} · Est. {sym}
                            {alt.estimatedPricePerNightLocal}/night
                          </div>
                          <Link
                            to={`/travels/${alt._id}`}
                            style={{ fontSize: "12.5px", color: "#2563eb", fontWeight: 600 }}
                          >
                            Explore →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="v2-disclaimer">ℹ️ {result.disclaimer}</div>
              </div>
            )}

            {comparison && (
              <div className="v2-card">
                <div className="v2-card-title">Multi-Tier Budget Comparison</div>
                <div className="v2-grid-3">
                  {comparison.map((c, idx) => (
                    <div key={idx} className="v2-stat-box">
                      <div style={{ fontWeight: 700, marginBottom: "4px" }}>{c.label}</div>
                      <div className="v2-stat-value">
                        {sym}
                        {c.estimatedGroupTotal.toLocaleString()}
                      </div>
                      <div style={{ fontSize: "12.5px", color: "#64748b" }}>
                        {sym}
                        {c.estimatedPerPerson.toLocaleString()} / person
                      </div>
                      <span
                        className={`v2-chip ${c.overBudget ? "v2-chip-no" : "v2-chip-yes"}`}
                        style={{ marginTop: "8px", display: "inline-block" }}
                      >
                        {c.overBudget ? "Over Target" : "Fits Target"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
