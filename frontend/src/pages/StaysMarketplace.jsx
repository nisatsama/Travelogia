import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";
import { launchRazorpayCheckout } from "../utils/razorpayCheckout";

const PROPERTY_TYPES = [
  "All",
  "Hotel",
  "Homestay",
  "Hostel",
  "Villa",
  "Resort",
  "Guesthouse",
  "Apartment",
];
const CATEGORIES = ["All", "Budget", "Mid-Range", "Luxury", "Boutique", "Heritage", "Eco-Stay"];

function defaultDateOffset(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export default function StaysMarketplace() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("browse");

  // Search filters
  const [filters, setFilters] = useState({
    destination: searchParams.get("city") || "",
    propertyType: "All",
    category: "All",
    amenity: "",
    minRating: "0",
    maxPrice: "",
    checkInDate: defaultDateOffset(3),
    checkOutDate: defaultDateOffset(5),
    guests: 2,
    rooms: 1,
  });

  const [properties, setProperties] = useState([]);
  const [disclosure, setDisclosure] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchTrigger, setSearchTrigger] = useState(0);

  // Selected property details
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedTripId, setSelectedTripId] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [bookingBusy, setBookingBusy] = useState(false);

  // User data
  const [myBookings, setMyBookings] = useState([]);
  const [myTrips, setMyTrips] = useState([]);

  // Module 16: Verified stay review state
  const [reviewDraft, setReviewDraft] = useState({
    overallRating: 5,
    cleanlinessScore: 5,
    locationScore: 5,
    serviceScore: 5,
    comment: "",
  });
  const [reviewPhotos, setReviewPhotos] = useState([]);
  const [reviewBusy, setReviewBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const params = {
          destination: filters.destination || undefined,
          propertyType: filters.propertyType !== "All" ? filters.propertyType : undefined,
          category: filters.category !== "All" ? filters.category : undefined,
          amenity: filters.amenity || undefined,
          minRating: Number(filters.minRating) > 0 ? filters.minRating : undefined,
          maxPrice: filters.maxPrice || undefined,
          checkInDate: filters.checkInDate,
          checkOutDate: filters.checkOutDate,
          guests: filters.guests,
          rooms: filters.rooms,
        };
        const res = await api.get("/stays", { params });
        if (!active) return;
        setProperties(res.data?.data || []);
        setDisclosure(res.data?.disclosure || "");
        setError("");
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, "Unable to search accommodations."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    searchTrigger,
    filters.destination,
    filters.propertyType,
    filters.category,
    filters.amenity,
    filters.minRating,
    filters.maxPrice,
    filters.checkInDate,
    filters.checkOutDate,
    filters.guests,
    filters.rooms,
  ]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const [bkRes, tripRes] = await Promise.all([
          api.get("/stays/bookings/mine"),
          api.get("/trips").catch(() => ({ data: { data: [] } })),
        ]);
        if (!active) return;
        setMyBookings(bkRes.data?.data || []);
        setMyTrips(tripRes.data?.data || []);
      } catch {
        // non-blocking
      }
    })();
    return () => {
      active = false;
    };
  }, [user, searchTrigger]);

  const openPropertyDetail = async (propId) => {
    setNotice("");
    setError("");
    try {
      const res = await api.get(`/stays/${propId}`, {
        params: {
          checkInDate: filters.checkInDate,
          checkOutDate: filters.checkOutDate,
        },
      });
      const detail = res.data?.data || null;
      setSelectedProperty(detail);
      setSelectedRoomId(detail?.roomTypes?.[0]?._id || "");
    } catch (err) {
      setError(getErrorMessage(err, "Could not load property details."));
    }
  };

  const handleBookRoom = async (e) => {
    e.preventDefault();
    if (!user) {
      setError("Please sign in to reserve a room.");
      return;
    }
    if (!selectedProperty || !selectedRoomId) return;
    setBookingBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await api.post("/stays/bookings", {
        propertyId: selectedProperty._id,
        roomTypeId: selectedRoomId,
        checkInDate: filters.checkInDate,
        checkOutDate: filters.checkOutDate,
        guests: Number(filters.guests),
        roomsBooked: Number(filters.rooms),
        tripId: selectedTripId,
        specialRequests,
      });
      const created = res.data?.data;
      setNotice(
        `Reservation ${created?.bookingReference} confirmed! Server total: ${created?.currency} ${created?.totalAmount} (saved to Travel Wallet).`,
      );
      setSpecialRequests("");
      setSearchTrigger((n) => n + 1);
      await openPropertyDetail(selectedProperty._id);
    } catch (err) {
      setError(getErrorMessage(err, "Room reservation failed."));
    } finally {
      setBookingBusy(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    setError("");
    setNotice("");
    try {
      await api.patch(`/stays/bookings/${bookingId}/cancel`);
      setNotice("Booking cancelled and room inventory returned to availability.");
      setSearchTrigger((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Could not cancel stay booking."));
    }
  };

  const handleMarkCompleted = async (bookingId) => {
    setError("");
    setNotice("");
    try {
      await api.patch(`/stays/bookings/${bookingId}/complete`);
      setNotice("Stay marked COMPLETED — verified stay review is now unlocked on this property.");
      setSearchTrigger((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Could not mark stay completed."));
    }
  };

  const handlePayBooking = async (booking) => {
    setError("");
    setNotice("");
    await launchRazorpayCheckout({
      bookingType: "STAY",
      bookingId: booking._id,
      prefill: { name: user?.username, email: user?.email },
      onVerified: (tx) => {
        setNotice(`Payment verified server-side! Invoice ${tx?.invoiceNumber} added to your Wallet.`);
        setSearchTrigger((n) => n + 1);
      },
      onError: (msg) => setError(msg),
    });
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!selectedProperty || !user) return;
    setReviewBusy(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("overallRating", String(reviewDraft.overallRating));
      formData.append("cleanlinessScore", String(reviewDraft.cleanlinessScore));
      formData.append("locationScore", String(reviewDraft.locationScore));
      formData.append("serviceScore", String(reviewDraft.serviceScore));
      formData.append("comment", reviewDraft.comment);
      reviewPhotos.slice(0, 4).forEach((file) => formData.append("photos", file));

      await api.post(`/stays/${selectedProperty._id}/reviews`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setNotice("Verified stay review published!");
      setReviewDraft({
        overallRating: 5,
        cleanlinessScore: 5,
        locationScore: 5,
        serviceScore: 5,
        comment: "",
      });
      setReviewPhotos([]);
      await openPropertyDetail(selectedProperty._id);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to publish review."));
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>🏨 Stays, Hotels &amp; Vacation Rentals</h1>
          <p>
            Search hotels, homestays, villas, resorts, hostels, guesthouses, and apartments with
            atomic room inventory protection, seasonal rate calculation, and verified guest reviews.
          </p>
        </div>

        <div className="v2-tabs">
          <button
            type="button"
            className={`v2-tab ${activeTab === "browse" ? "active" : ""}`}
            onClick={() => setActiveTab("browse")}
          >
            🔍 Search Properties ({properties.length})
          </button>
          <button
            type="button"
            className={`v2-tab ${activeTab === "bookings" ? "active" : ""}`}
            onClick={() => setActiveTab("bookings")}
          >
            🛎️ My Stay Bookings ({myBookings.length})
          </button>
        </div>

        {error && <div className="v2-alert-error">{error}</div>}
        {notice && <div className="v2-alert-success">{notice}</div>}

        {activeTab === "browse" && (
          <>
            <div className="v2-card" style={{ marginBottom: "20px" }}>
              <div className="v2-grid-3">
                <div className="v2-field">
                  <label>Destination / City</label>
                  <input
                    className="v2-input"
                    placeholder="Darjeeling, Goa, Jaipur, Ziro, Paris..."
                    value={filters.destination}
                    onChange={(e) => setFilters({ ...filters, destination: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Property Type (Module 15)</label>
                  <select
                    className="v2-select"
                    value={filters.propertyType}
                    onChange={(e) => setFilters({ ...filters, propertyType: e.target.value })}
                  >
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="v2-field">
                  <label>Category</label>
                  <select
                    className="v2-select"
                    value={filters.category}
                    onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="v2-field">
                  <label>Check-in Date</label>
                  <input
                    type="date"
                    className="v2-input"
                    value={filters.checkInDate}
                    onChange={(e) => setFilters({ ...filters, checkInDate: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Check-out Date</label>
                  <input
                    type="date"
                    className="v2-input"
                    value={filters.checkOutDate}
                    onChange={(e) => setFilters({ ...filters, checkOutDate: e.target.value })}
                  />
                </div>
                <div className="v2-grid-2" style={{ gap: "10px" }}>
                  <div className="v2-field">
                    <label>Guests</label>
                    <input
                      type="number"
                      min="1"
                      max="16"
                      className="v2-input"
                      value={filters.guests}
                      onChange={(e) => setFilters({ ...filters, guests: Number(e.target.value) })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Rooms</label>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      className="v2-input"
                      value={filters.rooms}
                      onChange={(e) => setFilters({ ...filters, rooms: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="v2-field">
                  <label>Amenity Filter</label>
                  <input
                    className="v2-input"
                    placeholder="Pool, WiFi, Breakfast, Kitchen..."
                    value={filters.amenity}
                    onChange={(e) => setFilters({ ...filters, amenity: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Max Nightly Rate (INR)</label>
                  <input
                    type="number"
                    className="v2-input"
                    placeholder="e.g. 9000"
                    value={filters.maxPrice}
                    onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Minimum Rating</label>
                  <select
                    className="v2-select"
                    value={filters.minRating}
                    onChange={(e) => setFilters({ ...filters, minRating: e.target.value })}
                  >
                    <option value="0">Any Rating</option>
                    <option value="4">4.0+ Stars</option>
                    <option value="4.5">4.5+ Stars</option>
                    <option value="4.8">4.8+ Stars</option>
                  </select>
                </div>
              </div>
              {disclosure && <div className="v2-disclaimer">{disclosure}</div>}
            </div>

            {selectedProperty && (
              <div className="v2-card" style={{ marginBottom: "22px", borderColor: "#2563eb" }}>
                <div className="v2-card-title">
                  <span>
                    {selectedProperty.name} ({selectedProperty.propertyType} · {selectedProperty.city})
                  </span>
                  <button
                    type="button"
                    className="v2-btn v2-btn-secondary v2-btn-sm"
                    onClick={() => setSelectedProperty(null)}
                  >
                    Close Details
                  </button>
                </div>

                <div className="v2-grid-2" style={{ marginBottom: "16px" }}>
                  <div>
                    <div className="v2-grid-2" style={{ gap: "10px", marginBottom: "12px" }}>
                      {(selectedProperty.images || []).map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt={`${selectedProperty.name} view ${i + 1}`}
                          style={{ width: "100%", height: "165px", objectFit: "cover", borderRadius: "10px" }}
                        />
                      ))}
                    </div>
                    <p style={{ fontSize: "14px", color: "#334155", lineHeight: 1.6 }}>
                      {selectedProperty.description}
                    </p>
                    <div className="v2-chip-row" style={{ marginTop: "10px" }}>
                      {(selectedProperty.amenities || []).map((a) => (
                        <span key={a} className="v2-chip">
                          {a}
                        </span>
                      ))}
                    </div>
                    {selectedProperty.hostProfile?.name && (
                      <div className="v2-disclaimer" style={{ marginTop: "12px" }}>
                        <strong>Host: {selectedProperty.hostProfile.name}</strong> (
                        {selectedProperty.hostProfile.responseTime}) —{" "}
                        {selectedProperty.hostProfile.bio}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 style={{ fontSize: "16px", marginBottom: "10px" }}>
                      Select Room Inventory ({filters.checkInDate} → {filters.checkOutDate})
                    </h3>
                    {(selectedProperty.roomTypes || []).map((rt) => (
                      <div
                        key={rt._id}
                        style={{
                          border:
                            selectedRoomId === rt._id
                              ? "2px solid #2563eb"
                              : "1px solid #e2e8f0",
                          borderRadius: "12px",
                          padding: "12px",
                          marginBottom: "10px",
                          background: selectedRoomId === rt._id ? "#eff6ff" : "#f8fafc",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                          <strong>
                            {rt.name} ({rt.roomCategory})
                          </strong>
                          <strong>
                            {rt.currency} {rt.effectiveNightlyRate}/night
                          </strong>
                        </div>
                        <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "4px" }}>
                          Max {rt.capacity} guests/room ·{" "}
                          <span
                            className={`v2-chip ${rt.availableRooms > 0 ? "v2-chip-yes" : "v2-chip-no"}`}
                          >
                            {rt.availableRooms} / {rt.totalQuantity} available
                          </span>
                        </div>
                        <div style={{ marginTop: "8px" }}>
                          <button
                            type="button"
                            className="v2-btn v2-btn-secondary v2-btn-sm"
                            disabled={rt.availableRooms < filters.rooms}
                            onClick={() => setSelectedRoomId(rt._id)}
                          >
                            {selectedRoomId === rt._id ? "Selected ✓" : "Choose Room"}
                          </button>
                        </div>
                      </div>
                    ))}

                    <form onSubmit={handleBookRoom} style={{ marginTop: "12px" }}>
                      {myTrips.length > 0 && (
                        <div className="v2-field">
                          <label>Link to Collaborative Trip (Optional)</label>
                          <select
                            className="v2-select"
                            value={selectedTripId}
                            onChange={(e) => setSelectedTripId(e.target.value)}
                          >
                            <option value="">Standalone Booking</option>
                            {myTrips.map((t) => (
                              <option key={t._id} value={t._id}>
                                {t.title} ({t.destination})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="v2-field">
                        <label>Special Requests (Optional)</label>
                        <input
                          className="v2-input"
                          placeholder="Early check-in, vegetarian breakfast, quiet floor..."
                          value={specialRequests}
                          onChange={(e) => setSpecialRequests(e.target.value)}
                        />
                      </div>
                      {user ? (
                        <button
                          type="submit"
                          className="v2-btn v2-btn-accent"
                          disabled={bookingBusy || !selectedRoomId}
                        >
                          {bookingBusy ? "Locking Inventory..." : "Confirm Room Reservation"}
                        </button>
                      ) : (
                        <Link to="/login" className="v2-btn v2-btn-primary">
                          Sign In to Book Stay
                        </Link>
                      )}
                    </form>
                  </div>
                </div>

                {/* Module 16: Verified Guest Reviews */}
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "16px", marginTop: "12px" }}>
                  <h3 style={{ fontSize: "16px", marginBottom: "10px" }}>
                    ⭐ Verified Guest Reviews ({(selectedProperty.reviews || []).length})
                  </h3>
                  {(selectedProperty.reviews || []).length === 0 ? (
                    <p style={{ fontSize: "13.5px", color: "#64748b" }}>
                      No verified stay reviews yet. Complete a booked stay to leave the first review.
                    </p>
                  ) : (
                    (selectedProperty.reviews || []).map((rev) => (
                      <div
                        key={rev._id}
                        style={{
                          padding: "12px",
                          borderRadius: "10px",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          marginBottom: "10px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                          <strong>
                            {rev.authorName} <span className="v2-chip v2-chip-yes">Verified Stay</span>
                          </strong>
                          <span style={{ fontSize: "13px", fontWeight: 600 }}>
                            Overall {rev.overallRating}/5 · Cleanliness {rev.cleanlinessScore} ·
                            Location {rev.locationScore} · Service {rev.serviceScore}
                          </span>
                        </div>
                        <p style={{ fontSize: "14px", marginTop: "6px" }}>{rev.comment}</p>
                        {rev.ownerResponse?.message && (
                          <div className="v2-disclaimer" style={{ marginTop: "8px" }}>
                            <strong>Host Response:</strong> {rev.ownerResponse.message}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {user && (
                    <form onSubmit={handleSubmitReview} style={{ marginTop: "14px" }}>
                      <h4 style={{ fontSize: "14px", marginBottom: "8px" }}>
                        Write a Verified Stay Review (requires a COMPLETED stay here)
                      </h4>
                      <div className="v2-grid-2" style={{ gap: "10px" }}>
                        {[
                          ["overallRating", "Overall (1-5)"],
                          ["cleanlinessScore", "Cleanliness (1-5)"],
                          ["locationScore", "Location (1-5)"],
                          ["serviceScore", "Service (1-5)"],
                        ].map(([key, label]) => (
                          <div className="v2-field" key={key}>
                            <label>{label}</label>
                            <input
                              type="number"
                              min="1"
                              max="5"
                              className="v2-input"
                              value={reviewDraft[key]}
                              onChange={(e) =>
                                setReviewDraft({ ...reviewDraft, [key]: Number(e.target.value) })
                              }
                            />
                          </div>
                        ))}
                      </div>
                      <div className="v2-field">
                        <label>Review Comment</label>
                        <textarea
                          rows={2}
                          className="v2-textarea"
                          placeholder="Share verified details about rooms, host hospitality, and location..."
                          value={reviewDraft.comment}
                          onChange={(e) =>
                            setReviewDraft({ ...reviewDraft, comment: e.target.value })
                          }
                        />
                      </div>
                      <div className="v2-field">
                        <label>Attach Stay Photos (optional, JPEG/PNG/WEBP)</label>
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => setReviewPhotos(Array.from(e.target.files || []))}
                        />
                      </div>
                      <button type="submit" className="v2-btn v2-btn-primary v2-btn-sm" disabled={reviewBusy}>
                        {reviewBusy ? "Submitting..." : "Publish Verified Review"}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}

            {loading ? (
              <div className="v2-card">Loading properties and room availability...</div>
            ) : properties.length === 0 ? (
              <div className="v2-card">No properties matched your filters. Try adjusting dates or price.</div>
            ) : (
              <div className="v2-grid-3">
                {properties.map((p) => (
                  <div key={p._id} className="v2-rec-card">
                    <img src={p.images?.[0]} alt={p.name} loading="lazy" />
                    <div className="v2-rec-card-body">
                      <div className="v2-chip-row">
                        <span className="v2-chip">{p.propertyType}</span>
                        <span className="v2-chip v2-chip-unknown">{p.category}</span>
                        <span className="v2-chip v2-chip-yes">★ {p.guestRating}</span>
                      </div>
                      <h3 style={{ fontSize: "17px", marginTop: "4px" }}>{p.name}</h3>
                      <div style={{ fontSize: "13px", color: "#64748b" }}>
                        {p.city}, {p.country}
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                        From {p.currency} {p.startingPrice} / night
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>
                        {(p.amenities || []).slice(0, 4).join(" · ")}
                      </div>
                      <button
                        type="button"
                        className="v2-btn v2-btn-primary v2-btn-sm"
                        style={{ marginTop: "auto" }}
                        onClick={() => openPropertyDetail(p._id)}
                      >
                        View Rooms &amp; Book
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "bookings" && (
          <div className="v2-card">
            <div className="v2-card-title">
              <span>My Stay Reservations</span>
              <Link to="/dashboard" className="v2-btn v2-btn-secondary v2-btn-sm">
                Open Unified Trip Dashboard
              </Link>
            </div>
            {!user ? (
              <p>
                Please <Link to="/login">sign in</Link> to view your stay bookings.
              </p>
            ) : myBookings.length === 0 ? (
              <p style={{ color: "#64748b" }}>No stay reservations yet.</p>
            ) : (
              <table className="v2-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Property &amp; Room</th>
                    <th>Dates</th>
                    <th>Total</th>
                    <th>Status / Payment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myBookings.map((b) => (
                    <tr key={b._id}>
                      <td>
                        <strong>{b.bookingReference}</strong>
                      </td>
                      <td>
                        <div>{b.propertyName}</div>
                        <small style={{ color: "#64748b" }}>
                          {b.roomTypeName} ({b.roomsBooked} room, {b.guests} guest)
                        </small>
                      </td>
                      <td>
                        {b.checkInDate} → {b.checkOutDate} ({b.nights}n)
                      </td>
                      <td>
                        <strong>
                          {b.currency} {b.totalAmount}
                        </strong>
                      </td>
                      <td>
                        <div className="v2-chip-row">
                          <span
                            className={`v2-chip ${
                              b.status === "CANCELLED" ? "v2-chip-no" : "v2-chip-yes"
                            }`}
                          >
                            {b.status}
                          </span>
                          <span
                            className={`v2-chip ${
                              b.paymentStatus === "PAID" ? "v2-chip-yes" : "v2-chip-warn"
                            }`}
                          >
                            {b.paymentStatus}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="v2-chip-row">
                          {b.status === "CONFIRMED" && b.paymentStatus !== "PAID" && (
                            <button
                              type="button"
                              className="v2-btn v2-btn-primary v2-btn-sm"
                              onClick={() => handlePayBooking(b)}
                            >
                              Pay via Razorpay
                            </button>
                          )}
                          {b.status === "CONFIRMED" && (
                            <>
                              <button
                                type="button"
                                className="v2-btn v2-btn-secondary v2-btn-sm"
                                onClick={() => handleMarkCompleted(b._id)}
                              >
                                Mark Completed
                              </button>
                              <button
                                type="button"
                                className="v2-btn v2-btn-danger v2-btn-sm"
                                onClick={() => handleCancelBooking(b._id)}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
