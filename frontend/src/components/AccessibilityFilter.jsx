import { useState } from "react";

const TRI_OPTIONS = [
  { value: "", label: "Any" },
  { value: "yes", label: "Yes (Confirmed)" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown / Unverified" },
];

export default function AccessibilityFilter({ values, onChange }) {
  const [expanded, setExpanded] = useState(false);

  const activeCount = Object.values(values || {}).filter(Boolean).length;

  return (
    <div className="v2-acc-filter-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <button
          type="button"
          className="v2-btn v2-btn-secondary v2-btn-sm"
          onClick={() => setExpanded((e) => !e)}
        >
          ♿ Accessibility Filters {activeCount > 0 ? `(${activeCount} active)` : ""}{" "}
          {expanded ? "▲" : "▼"}
        </button>
        <span style={{ fontSize: "12px", color: "#64748b" }}>
          3-state filter: &ldquo;Unknown&rdquo; is never assumed accessible.
        </span>
      </div>

      {expanded && (
        <div className="v2-acc-filter-grid">
          <div className="v2-field" style={{ marginBottom: 0 }}>
            <label>Wheelchair Accessible</label>
            <select
              className="v2-select"
              value={values.wheelchairAccessible || ""}
              onChange={(e) => onChange("wheelchairAccessible", e.target.value)}
            >
              {TRI_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="v2-field" style={{ marginBottom: 0 }}>
            <label>Accessible Accommodation</label>
            <select
              className="v2-select"
              value={values.accessibleAccommodation || ""}
              onChange={(e) => onChange("accessibleAccommodation", e.target.value)}
            >
              {TRI_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="v2-field" style={{ marginBottom: 0 }}>
            <label>Public Transport Access</label>
            <select
              className="v2-select"
              value={values.publicTransport || ""}
              onChange={(e) => onChange("publicTransport", e.target.value)}
            >
              {TRI_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="v2-field" style={{ marginBottom: 0 }}>
            <label>Family Friendly</label>
            <select
              className="v2-select"
              value={values.familyFriendly || ""}
              onChange={(e) => onChange("familyFriendly", e.target.value)}
            >
              {TRI_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="v2-field" style={{ marginBottom: 0 }}>
            <label>Walking Intensity</label>
            <select
              className="v2-select"
              value={values.walkingIntensity || ""}
              onChange={(e) => onChange("walkingIntensity", e.target.value)}
            >
              <option value="">Any Intensity</option>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
