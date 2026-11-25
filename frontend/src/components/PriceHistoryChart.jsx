export default function PriceHistoryChart({ observations = [], targetPrice = null, currency = "USD" }) {
  if (!observations || observations.length === 0) {
    return <p className="v2-disclaimer">No price observations recorded yet for this destination.</p>;
  }

  const width = 620;
  const height = 220;
  const padX = 46;
  const padY = 24;

  const prices = observations.map((o) => Number(o.estimatedPricePerNight || 0));
  if (targetPrice && Number.isFinite(Number(targetPrice))) {
    prices.push(Number(targetPrice));
  }
  const minVal = Math.max(0, Math.min(...prices) * 0.88);
  const maxVal = Math.max(...prices) * 1.12 || 100;
  const span = Math.max(1, maxVal - minVal);

  const getX = (idx) => {
    if (observations.length === 1) return width / 2;
    return padX + (idx / (observations.length - 1)) * (width - padX * 2);
  };
  const getY = (val) => height - padY - ((val - minVal) / span) * (height - padY * 2);

  const polyPoints = observations
    .map((o, idx) => `${getX(idx).toFixed(1)},${getY(Number(o.estimatedPricePerNight)).toFixed(1)}`)
    .join(" ");

  const targetY =
    targetPrice && Number.isFinite(Number(targetPrice)) ? getY(Number(targetPrice)) : null;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxHeight: "240px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((ratio, i) => {
          const val = Math.round(minVal + span * (1 - ratio));
          const y = padY + ratio * (height - padY * 2);
          return (
            <g key={i}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
              <text x={6} y={y + 4} fontSize="11" fill="#64748b">
                {currency === "INR" ? "₹" : "$"}
                {val}
              </text>
            </g>
          );
        })}

        {/* Target budget threshold */}
        {targetY !== null && (
          <g>
            <line
              x1={padX}
              y1={targetY}
              x2={width - padX}
              y2={targetY}
              stroke="#10b981"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <text x={width - padX - 110} y={targetY - 6} fontSize="11" fill="#047857" fontWeight="600">
              Target: ${targetPrice}
            </text>
          </g>
        )}

        {/* Trend polyline */}
        <polyline
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polyPoints}
        />

        {/* Data points */}
        {observations.map((o, idx) => {
          const cx = getX(idx);
          const cy = getY(Number(o.estimatedPricePerNight));
          const dateLabel = new Date(o.observedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
          return (
            <g key={o._id || idx}>
              <circle cx={cx} cy={cy} r="5" fill="#2563eb" stroke="#ffffff" strokeWidth="2">
                <title>
                  {dateLabel}: ${o.estimatedPricePerNight}/night ({o.source})
                </title>
              </circle>
              <text x={cx} y={height - 6} textAnchor="middle" fontSize="10" fill="#64748b">
                {dateLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
