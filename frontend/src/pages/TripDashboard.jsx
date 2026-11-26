import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";
import { launchRazorpayCheckout } from "../utils/razorpayCheckout";

const PREF_LABELS = [
  ["bookingConfirmations", "Booking confirmations"],
  ["paymentUpdates", "Payment & refund updates"],
  ["cancellationUpdates", "Cancellation alerts"],
  ["checkInReminders", "Hotel check-in reminders (48h)"],
  ["transportReminders", "Transport departure reminders (48h)"],
  ["activityReminders", "Activity start reminders (48h)"],
  ["priceAlerts", "Price drop alerts"],
];

export default function TripDashboard() {
  const { user } = useAuth();
  const [tripFilter, setTripFilter] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [gatewayConfig, setGatewayConfig] = useState(null);
  const [notifData, setNotifData] = useState({ data: [], preferences: {}, unreadCount: 0 });
  const [activeInvoice, setActiveInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    (async () => {
      try {
        const [dashRes, gwRes, notifRes] = await Promise.all([
          api.get("/dashboard", { params: tripFilter ? { tripId: tripFilter } : {} }),
          api.get("/payments/config"),
          api.get("/notifications"),
        ]);
        if (!active) return;
        setDashboard(dashRes.data);
        setGatewayConfig(gwRes.data);
        setNotifData({
          data: notifRes.data?.data || [],
          preferences: notifRes.data?.preferences || {},
          unreadCount: notifRes.data?.unreadCount || 0,
        });
        setError("");
      } catch (err) {
        if (active) setError(getErrorMessage(err, "Unable to load Unified Trip Dashboard."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, tripFilter, reloadNonce]);

  const handlePayNow = async (bookingType, bookingId) => {
    setError("");
    setNotice("");
    await launchRazorpayCheckout({
      bookingType,
      bookingId,
      prefill: { name: user?.username, email: user?.email },
      onVerified: (tx) => {
        setNotice(`Payment verified via Razorpay HMAC! Invoice ${tx?.invoiceNumber} generated.`);
        setReloadNonce((n) => n + 1);
      },
      onError: (msg) => setError(msg),
    });
  };

  const handleRefund = async (txId) => {
    setError("");
    setNotice("");
    try {
      const res = await api.post(`/payments/${txId}/refund`, {
        reason: "Requested from Unified Trip Dashboard",
      });
      setNotice(`Refund processed (${res.data?.data?.refundId || "completed"}).`);
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Refund request failed."));
    }
  };

  const handleViewInvoice = async (txId) => {
    setError("");
    try {
      const res = await api.get(`/payments/${txId}/invoice`);
      setActiveInvoice(res.data?.invoice || null);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to fetch invoice."));
    }
  };

  const handleTogglePref = async (key) => {
    const nextVal = !notifData.preferences?.[key];
    try {
      const res = await api.put("/notifications/preferences", { [key]: nextVal });
      setNotifData((prev) => ({ ...prev, preferences: res.data?.data || prev.preferences }));
      setNotice("Notification preference saved.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update notification preferences."));
    }
  };

  const handleRunReminders = async () => {
    setError("");
    setNotice("");
    try {
      const res = await api.post("/notifications/run-reminders");
      setNotice(
        `Reminder scan complete: ${res.data?.data?.remindersCreated || 0} new upcoming reminder(s) created.`,
      );
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Reminder scan failed."));
    }
  };

  const handleMarkNotifRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setReloadNonce((n) => n + 1);
    } catch {
      // ignore
    }
  };

  if (!user) {
    return (
      <div className="v2-page">
        <V2NavBar />
        <div className="v2-container">
          <div className="v2-card">
            <h2>Sign in to open your Unified Trip Dashboard</h2>
            <p style={{ margin: "10px 0 16px", color: "#475569" }}>
              View your hotel reservations, transport timeline, activities, itineraries, budgets,
              Razorpay payment invoices, wallet documents, and smart reminders in one workspace.
            </p>
            <Link to="/login" className="v2-btn v2-btn-primary">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const summary = dashboard?.summary || {};
  const data = dashboard?.data || {};

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>📊 Unified Trip Dashboard &amp; Payments</h1>
          <p>
            Central command center connecting stays, multimodal transport, activities, local guides,
            dining, AI itineraries, budgets, Razorpay payment verification &amp; invoices, travel
            journal, wallet documents, and smart travel notifications.
          </p>
        </div>

        {error && <div className="v2-alert-error">{error}</div>}
        {notice && <div className="v2-alert-success">{notice}</div>}

        {/* Trip Scope Selector */}
        <div
          className="v2-card"
          style={{
            marginBottom: "18px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <label style={{ fontWeight: 600, fontSize: "14px" }}>Filter by Trip:</label>
            <select
              className="v2-select"
              style={{ width: "260px" }}
              value={tripFilter}
              onChange={(e) => setTripFilter(e.target.value)}
            >
              <option value="">All My Trips &amp; Reservations</option>
              {(data.collabTrips || []).map((t) => (
                <option key={t._id} value={t._id}>
                  {t.title} ({t.destination})
                </option>
              ))}
            </select>
          </div>
          <div className="v2-chip-row">
            <Link to="/stays" className="v2-btn v2-btn-secondary v2-btn-sm">
              + Book Stay
            </Link>
            <Link to="/transport" className="v2-btn v2-btn-secondary v2-btn-sm">
              + Add Transport
            </Link>
            <Link to="/experiences" className="v2-btn v2-btn-secondary v2-btn-sm">
              + Book Activity
            </Link>
            <Link to="/wallet" className="v2-btn v2-btn-primary v2-btn-sm">
              Open Travel Wallet ({summary.walletCount || 0})
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="v2-card">Loading unified trip overview...</div>
        ) : (
          <>
            {/* KPI Summary Strip */}
            <div className="v2-stat-strip">
              <div className="v2-stat-box">
                <div className="v2-stat-label">Stays</div>
                <div className="v2-stat-value">{summary.stayCount || 0}</div>
              </div>
              <div className="v2-stat-box">
                <div className="v2-stat-label">Transport Legs</div>
                <div className="v2-stat-value">{summary.transportCount || 0}</div>
              </div>
              <div className="v2-stat-box">
                <div className="v2-stat-label">Activities &amp; Guides</div>
                <div className="v2-stat-value">
                  {(summary.activityCount || 0) + (summary.guideCount || 0)}
                </div>
              </div>
              <div className="v2-stat-box">
                <div className="v2-stat-label">Dining / Itineraries</div>
                <div className="v2-stat-value">
                  {(summary.restaurantCount || 0) + (summary.itineraryCount || 0)}
                </div>
              </div>
              <div className="v2-stat-box">
                <div className="v2-stat-label">Active Total (INR)</div>
                <div className="v2-stat-value">
                  ₹{Number(summary.activeReservationTotalINR || 0).toLocaleString()}
                </div>
              </div>
              <div className="v2-stat-box">
                <div className="v2-stat-label">Verified Paid (INR)</div>
                <div className="v2-stat-value" style={{ color: "#15803d" }}>
                  ₹{Number(summary.verifiedPaidTotalINR || 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Active Reservations & Razorpay Checkout */}
            <div className="v2-grid-2" style={{ marginBottom: "20px" }}>
              <div className="v2-card">
                <div className="v2-card-title">🏨 Stay Reservations</div>
                {(data.stays || []).length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: "14px" }}>No stay bookings yet.</p>
                ) : (
                  (data.stays || []).map((s) => (
                    <div
                      key={s._id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        marginBottom: "10px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong>{s.propertyName}</strong>
                        <strong>
                          {s.currency} {s.totalAmount}
                        </strong>
                      </div>
                      <div style={{ fontSize: "12.5px", color: "#475569", margin: "4px 0" }}>
                        {s.bookingReference} · {s.checkInDate} → {s.checkOutDate} · {s.roomTypeName}
                      </div>
                      <div className="v2-chip-row">
                        <span className="v2-chip">{s.status}</span>
                        <span
                          className={`v2-chip ${
                            s.paymentStatus === "PAID" ? "v2-chip-yes" : "v2-chip-warn"
                          }`}
                        >
                          {s.paymentStatus}
                        </span>
                        {s.status === "CONFIRMED" && s.paymentStatus !== "PAID" && (
                          <button
                            type="button"
                            className="v2-btn v2-btn-primary v2-btn-sm"
                            onClick={() => handlePayNow("STAY", s._id)}
                          >
                            Pay via Razorpay
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="v2-card">
                <div className="v2-card-title">✈️ Transport, Activities &amp; Dining</div>
                {(data.transport || []).length === 0 &&
                (data.activities || []).length === 0 &&
                (data.restaurants || []).length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: "14px" }}>
                    No transport, activities, or restaurant bookings yet.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: "8px" }}>
                    {(data.transport || []).map((t) => (
                      <div
                        key={t._id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "10px 12px",
                        }}
                      >
                        <strong>
                          [{t.mode}] {t.origin} → {t.destination}
                        </strong>
                        <div style={{ fontSize: "12.5px", color: "#475569" }}>
                          {t.travelDate} · Ref: {t.externalProviderReference || t.bookingReference} ·{" "}
                          {t.status}
                        </div>
                        {!t.isExternalReference &&
                          t.status === "CONFIRMED" &&
                          t.paymentStatus !== "PAID" && (
                            <button
                              type="button"
                              className="v2-btn v2-btn-primary v2-btn-sm"
                              style={{ marginTop: "6px" }}
                              onClick={() => handlePayNow(t.mode, t._id)}
                            >
                              Pay {t.currency} {t.totalAmount}
                            </button>
                          )}
                      </div>
                    ))}
                    {(data.activities || []).map((a) => (
                      <div
                        key={a._id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "10px 12px",
                        }}
                      >
                        <strong>[ACTIVITY] {a.activityTitle}</strong>
                        <div style={{ fontSize: "12.5px", color: "#475569" }}>
                          {a.date} at {a.timeSlot} · {a.participants} pax · {a.status} (
                          {a.paymentStatus})
                        </div>
                      </div>
                    ))}
                    {(data.restaurants || []).map((r) => (
                      <div
                        key={r._id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "10px 12px",
                        }}
                      >
                        <strong>[DINING] {r.restaurantName}</strong>
                        <div style={{ fontSize: "12.5px", color: "#475569" }}>
                          {r.date} at {r.timeSlot} · {r.guests} guests · {r.status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* MODULE 26: RAZORPAY PAYMENTS, TRANSACTIONS & INVOICES */}
            <div className="v2-card" style={{ marginBottom: "20px" }}>
              <div className="v2-card-title">
                <span>💳 Razorpay Payment Transactions &amp; Invoices</span>
                <span className={`v2-chip ${gatewayConfig?.configured ? "v2-chip-yes" : "v2-chip-warn"}`}>
                  {gatewayConfig?.configured ? "Razorpay SDK Active" : "Gateway Keys Pending"}
                </span>
              </div>
              {gatewayConfig?.disclosure && (
                <div className="v2-disclaimer" style={{ marginBottom: "14px" }}>
                  {gatewayConfig.disclosure}
                </div>
              )}

              {(data.payments || []).length === 0 ? (
                <p style={{ color: "#64748b", fontSize: "14px" }}>No payment transactions recorded yet.</p>
              ) : (
                <table className="v2-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Booking Ref</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Verified</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.payments || []).map((tx) => (
                      <tr key={tx._id}>
                        <td>
                          <strong>{tx.invoiceNumber}</strong>
                        </td>
                        <td>
                          {tx.bookingReference} ({tx.bookingType})
                        </td>
                        <td>
                          {tx.currency} {tx.amount}
                        </td>
                        <td>
                          <span
                            className={`v2-chip ${
                              tx.status === "PAID"
                                ? "v2-chip-yes"
                                : tx.status === "FAILED"
                                  ? "v2-chip-no"
                                  : "v2-chip-warn"
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td>{tx.signatureVerified || tx.webhookVerified ? "HMAC ✓" : "Pending"}</td>
                        <td>
                          <div className="v2-chip-row">
                            <button
                              type="button"
                              className="v2-btn v2-btn-secondary v2-btn-sm"
                              onClick={() => handleViewInvoice(tx._id)}
                            >
                              Invoice
                            </button>
                            {tx.status === "PAID" && (
                              <button
                                type="button"
                                className="v2-btn v2-btn-danger v2-btn-sm"
                                onClick={() => handleRefund(tx._id)}
                              >
                                Refund
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeInvoice && (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "16px",
                    borderRadius: "12px",
                    background: "#f8fafc",
                    border: "2px solid #0f172a",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>INVOICE {activeInvoice.invoiceNumber}</strong>
                    <button
                      type="button"
                      className="v2-btn v2-btn-secondary v2-btn-sm"
                      onClick={() => setActiveInvoice(null)}
                    >
                      Close
                    </button>
                  </div>
                  <div style={{ fontSize: "13.5px", marginTop: "8px", lineHeight: 1.7 }}>
                    <div>Issuer: {activeInvoice.issuedBy}</div>
                    <div>
                      Customer: {activeInvoice.customerName} ({activeInvoice.customerEmail})
                    </div>
                    <div>
                      Reservation: {activeInvoice.bookingReference} ({activeInvoice.bookingType})
                    </div>
                    <div>
                      Total: {activeInvoice.currency} {activeInvoice.amount} · Status:{" "}
                      <strong>{activeInvoice.paymentStatus}</strong>
                    </div>
                    <div>Razorpay Order ID: {activeInvoice.razorpayOrderId}</div>
                    {activeInvoice.razorpayPaymentId && (
                      <div>Razorpay Payment ID: {activeInvoice.razorpayPaymentId}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* MODULE 28: SMART TRAVEL NOTIFICATIONS & PREFERENCES */}
            <div className="v2-grid-2">
              <div className="v2-card">
                <div className="v2-card-title">
                  <span>🔔 Smart Notifications ({notifData.unreadCount} unread)</span>
                  <button
                    type="button"
                    className="v2-btn v2-btn-secondary v2-btn-sm"
                    onClick={handleRunReminders}
                  >
                    Scan Upcoming Reminders
                  </button>
                </div>
                {notifData.data.length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: "14px" }}>No notifications yet.</p>
                ) : (
                  notifData.data.slice(0, 10).map((n) => (
                    <div
                      key={n._id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: n.read ? "#f8fafc" : "#eff6ff",
                        border: "1px solid #e2e8f0",
                        marginBottom: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                        <strong style={{ fontSize: "13.5px" }}>{n.title}</strong>
                        <span className="v2-chip v2-chip-unknown">{n.type}</span>
                      </div>
                      <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "4px" }}>
                        {n.message}
                      </div>
                      {!n.read && (
                        <button
                          type="button"
                          className="v2-btn v2-btn-secondary v2-btn-sm"
                          style={{ marginTop: "6px" }}
                          onClick={() => handleMarkNotifRead(n._id)}
                        >
                          Mark Read
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="v2-card">
                <div className="v2-card-title">⚙️ Notification Preferences &amp; Trip Links</div>
                <div style={{ display: "grid", gap: "10px", marginBottom: "18px" }}>
                  {PREF_LABELS.map(([key, label]) => (
                    <label
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        fontSize: "14px",
                      }}
                    >
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={notifData.preferences?.[key] !== false}
                        onChange={() => handleTogglePref(key)}
                      />
                    </label>
                  ))}
                </div>

                <div className="v2-chip-row">
                  <Link to="/trip-builder" className="v2-btn v2-btn-secondary v2-btn-sm">
                    Itineraries ({summary.itineraryCount || 0})
                  </Link>
                  <Link to="/budget-optimizer" className="v2-btn v2-btn-secondary v2-btn-sm">
                    Budgets ({summary.budgetCount || 0})
                  </Link>
                  <Link to="/journal" className="v2-btn v2-btn-secondary v2-btn-sm">
                    Journal ({summary.journalCount || 0})
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
