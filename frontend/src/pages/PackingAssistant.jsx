import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";

const CATEGORIES = [
  "Clothing",
  "Toiletries",
  "Documents",
  "Electronics",
  "Medicines & Essentials",
  "Activity Gear",
  "Optional",
];

export default function PackingAssistant() {
  const { user } = useAuth();
  const [allDestinations, setAllDestinations] = useState([]);
  const [savedLists, setSavedLists] = useState([]);
  const [form, setForm] = useState({
    travelId: "",
    destinationName: "Darjeeling",
    duration: 4,
    season: "Autumn",
    travellerType: "solo",
    activities: "trekking, photography",
    includeAi: false,
  });
  const [activePlan, setActivePlan] = useState(null);
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState("Optional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const dRes = await api.get("/travels", { params: { limit: 100 } });
        if (active) setAllDestinations(dRes.data?.data || []);
      } catch {
        // ignore
      }
      if (user) {
        try {
          const pRes = await api.get("/packing");
          if (!active) return;
          const lists = pRes.data?.data || [];
          setSavedLists(lists);
          if (lists.length > 0) setActivePlan((prev) => prev || lists[0]);
        } catch {
          // ignore
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/packing/generate", {
        ...form,
        duration: Number(form.duration) || 4,
        activities: form.activities.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setActivePlan(res.data?.data || null);
      setSuccess("Smart packing checklist generated!");
    } catch (err) {
      setError(getErrorMessage(err, "Could not generate packing checklist."));
    } finally {
      setLoading(false);
    }
  };

  const persistIfSaved = async (nextPlan) => {
    setActivePlan(nextPlan);
    if (user && nextPlan._id) {
      try {
        const res = await api.put(`/packing/${nextPlan._id}`, {
          items: nextPlan.items,
          isTemplate: nextPlan.isTemplate,
        });
        const updated = res.data?.data;
        setSavedLists((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
      } catch {
        // ignore silent background sync failure
      }
    }
  };

  const handleToggleItem = (itemId) => {
    if (!activePlan) return;
    const nextItems = activePlan.items.map((it) =>
      it.id === itemId ? { ...it, checked: !it.checked } : it,
    );
    persistIfSaved({ ...activePlan, items: nextItems });
  };

  const handleAddCustomItem = (e) => {
    e.preventDefault();
    if (!activePlan || !customName.trim()) return;
    const nextItems = [
      ...activePlan.items,
      {
        id: `custom-${Date.now()}`,
        category: customCategory,
        name: customName.trim(),
        quantity: 1,
        checked: false,
        custom: true,
      },
    ];
    setCustomName("");
    persistIfSaved({ ...activePlan, items: nextItems });
  };

  const handleRemoveItem = (itemId) => {
    if (!activePlan) return;
    persistIfSaved({
      ...activePlan,
      items: activePlan.items.filter((i) => i.id !== itemId),
    });
  };

  const handleSaveList = async (asTemplate = false) => {
    if (!user) {
      setError("Sign in to save packing checklists and templates.");
      return;
    }
    if (!activePlan) return;
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/packing", {
        ...activePlan,
        isTemplate: asTemplate,
      });
      const created = res.data?.data;
      setActivePlan(created);
      setSavedLists((prev) => [created, ...prev]);
      setSuccess(asTemplate ? "Saved as a reusable packing template!" : "Packing checklist saved!");
    } catch (err) {
      setError(getErrorMessage(err, "Could not save packing list."));
    }
  };

  const totalItems = activePlan?.items?.length || 0;
  const checkedItems = (activePlan?.items || []).filter((i) => i.checked).length;
  const pct = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>🎒 Smart Packing Assistant</h1>
          <p>
            Destination-, weather-, duration-, and activity-aware packing checklists across 7
            categories with progress tracking, custom items, reusable templates, and optional AI tips.
          </p>
        </div>

        {error && <div className="v2-alert-error">{error}</div>}
        {success && <div className="v2-alert-success">{success}</div>}

        <div className="v2-grid-sidebar">
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <form className="v2-card" onSubmit={handleGenerate}>
              <div className="v2-card-title">Trip Details</div>

              <div className="v2-field">
                <label>Catalogue Destination (Optional)</label>
                <select
                  className="v2-select"
                  value={form.travelId}
                  onChange={(e) => {
                    const d = allDestinations.find((x) => x._id === e.target.value);
                    setForm({
                      ...form,
                      travelId: e.target.value,
                      destinationName: d ? d.title : form.destinationName,
                    });
                  }}
                >
                  <option value="">-- Custom destination --</option>
                  {allDestinations.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.title} ({d.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="v2-field">
                <label>Destination Name</label>
                <input
                  className="v2-input"
                  value={form.destinationName}
                  onChange={(e) => setForm({ ...form, destinationName: e.target.value })}
                  required
                />
              </div>

              <div className="v2-grid-2">
                <div className="v2-field">
                  <label>Days</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    className="v2-input"
                    value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Season</label>
                  <select
                    className="v2-select"
                    value={form.season}
                    onChange={(e) => setForm({ ...form, season: e.target.value })}
                  >
                    <option value="Spring">Spring</option>
                    <option value="Summer">Summer</option>
                    <option value="Monsoon">Monsoon</option>
                    <option value="Autumn">Autumn</option>
                    <option value="Winter">Winter</option>
                  </select>
                </div>
              </div>

              <div className="v2-field">
                <label>Traveller Type</label>
                <select
                  className="v2-select"
                  value={form.travellerType}
                  onChange={(e) => setForm({ ...form, travellerType: e.target.value })}
                >
                  <option value="solo">Solo Traveller</option>
                  <option value="couple">Couple</option>
                  <option value="family">Family</option>
                  <option value="backpacker">Backpacker</option>
                </select>
              </div>

              <div className="v2-field">
                <label>Planned Activities</label>
                <input
                  className="v2-input"
                  value={form.activities}
                  onChange={(e) => setForm({ ...form, activities: e.target.value })}
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", marginBottom: "14px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.includeAi}
                  onChange={(e) => setForm({ ...form, includeAi: e.target.checked })}
                />
                Include optional Gemini AI smart suggestions
              </label>

              <button type="submit" className="v2-btn v2-btn-primary" style={{ width: "100%" }} disabled={loading}>
                {loading ? "Generating..." : "Generate Packing Checklist"}
              </button>
            </form>

            {savedLists.length > 0 && (
              <div className="v2-card">
                <div className="v2-card-title">Saved Lists &amp; Templates ({savedLists.length})</div>
                {savedLists.map((list) => (
                  <button
                    key={list._id}
                    type="button"
                    onClick={() => setActivePlan(list)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "9px 11px",
                      borderRadius: "10px",
                      marginBottom: "8px",
                      cursor: "pointer",
                      border: activePlan?._id === list._id ? "2px solid #2563eb" : "1px solid #e2e8f0",
                      background: activePlan?._id === list._id ? "#eff6ff" : "#f8fafc",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "13.5px" }}>{list.title}</div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      {list.isTemplate ? "📌 Template · " : ""}
                      {list.items?.length || 0} items
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            {!activePlan ? (
              <div className="v2-card" style={{ textAlign: "center", padding: "48px 24px" }}>
                <h2>Generate a smart packing checklist</h2>
                <p style={{ color: "#64748b" }}>
                  Choose your destination, season, and activities on the left to build a structured
                  7-category checklist.
                </p>
              </div>
            ) : (
              <div className="v2-card">
                <div className="v2-card-title">
                  <span>{activePlan.title}</span>
                  <span className="v2-chip v2-chip-yes">
                    {checkedItems}/{totalItems} packed ({pct}%)
                  </span>
                </div>

                <div className="v2-progress-bar" style={{ marginBottom: "16px" }}>
                  <div className="v2-progress-fill" style={{ width: `${pct}%` }} />
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                  <button type="button" className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => handleSaveList(false)}>
                    Save Checklist
                  </button>
                  <button type="button" className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => handleSaveList(true)}>
                    Save as Reusable Template
                  </button>
                </div>

                {Array.isArray(activePlan.aiTips) && activePlan.aiTips.length > 0 && (
                  <div className="v2-alert-success">
                    <strong>AI Packing Tips:</strong>
                    <ul style={{ paddingLeft: "18px", marginTop: "6px" }}>
                      {activePlan.aiTips.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <form onSubmit={handleAddCustomItem} style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "18px" }}>
                  <input
                    className="v2-input"
                    style={{ flex: "2 1 200px" }}
                    placeholder="Add custom item..."
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                  <select
                    className="v2-select"
                    style={{ flex: "1 1 150px" }}
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="v2-btn v2-btn-accent v2-btn-sm">
                    + Add Item
                  </button>
                </form>

                <div className="v2-grid-2">
                  {CATEGORIES.map((cat) => {
                    const catItems = (activePlan.items || []).filter((i) => i.category === cat);
                    if (catItems.length === 0) return null;
                    return (
                      <div key={cat} className="v2-stat-box">
                        <div style={{ fontWeight: 700, marginBottom: "8px", color: "#0f172a" }}>
                          {cat} ({catItems.filter((i) => i.checked).length}/{catItems.length})
                        </div>
                        {catItems.map((item) => (
                          <div
                            key={item.id}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "4px 0" }}
                          >
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                fontSize: "13.5px",
                                textDecoration: item.checked ? "line-through" : "none",
                                color: item.checked ? "#94a3b8" : "#1e293b",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(item.checked)}
                                onChange={() => handleToggleItem(item.id)}
                              />
                              <span>
                                {item.name} {item.quantity > 1 ? `×${item.quantity}` : ""}
                              </span>
                            </label>
                            <button
                              type="button"
                              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                              onClick={() => handleRemoveItem(item.id)}
                              aria-label={`Remove ${item.name}`}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

                <div className="v2-disclaimer">
                  ℹ️ {activePlan.disclaimer || "General packing checklist only — not medical advice. Consult a doctor for personal medication needs."}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
