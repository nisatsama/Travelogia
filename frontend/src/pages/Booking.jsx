import { useLocation, useSearchParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import "./Booking.css";

function getTodayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function makeIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `bk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function Booking() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();

  const initialTravel = location.state?.travel || null;
  const queryTravelId = searchParams.get("travelId");

  const [travel, setTravel] = useState(initialTravel);
  const [loadingTravel, setLoadingTravel] = useState(!initialTravel && Boolean(queryTravelId));
  const [loadError, setLoadError] = useState("");

  const [travellers, setTravellers] = useState(1);
  const [duration, setDuration] = useState(3);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => makeIdempotencyKey());

  const todayStr = useMemo(() => getTodayDateString(), []);

  useEffect(() => {
    if (initialTravel || !queryTravelId) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get(`/travels/${encodeURIComponent(queryTravelId)}`);
        if (active) {
          setTravel(res.data?.data || null);
          setLoadError("");
        }
      } catch (err) {
        if (active) {
          setLoadError(getErrorMessage(err, "Unable to load selected destination."));
        }
      } finally {
        if (active) {
          setLoadingTravel(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [initialTravel, queryTravelId]);

  if (loadingTravel) {
    return (
      <div className="booking-page">
        <div className="booking-card">
          <div className="state-loading-inline dark" role="status">
            <span className="state-spinner" />
            <span>Loading booking details...</span>
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !travel) {
    return (
      <div className="booking-page">
        <div className="booking-card" style={{ textAlign: "center" }}>
          <h1>No Destination Selected</h1>
          <p style={{ marginBottom: "20px", color: "#cbd5e1" }}>
            {loadError || "Please select a destination from Travelogia before creating a booking."}
          </p>
          <Link to="/travels" className="confirm-btn" style={{ display: "inline-block", textDecoration: "none" }}>
            Browse Destinations
          </Link>
        </div>
      </div>
    );
  }

  const safeTravellers = Math.min(20, Math.max(1, Number(travellers) || 1));
  const safeDuration = Math.min(60, Math.max(1, Number(duration) || 1));
  const estimatedCost = safeTravellers * safeDuration * Number(travel.pricePerNight || 0);

  const handleBooking = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (!authLoading && !user) {
      navigate("/login", {
        state: {
          from: `/booking?travelId=${encodeURIComponent(travel._id)}`,
          message: "Please sign in to confirm your trip booking.",
        },
      });
      return;
    }

    if (!date) {
      setSubmitError("Please choose a start travel date.");
      return;
    }

    if (date < todayStr) {
      setSubmitError("Travel date cannot be in the past.");
      return;
    }

    setSubmitting(true);
    try {
      // Price is NEVER trusted from client; backend calculates authoritative totalCost from DB
      const bookingData = {
        travelId: travel._id,
        travelers: safeTravellers,
        duration: safeDuration,
        date,
        notes: notes.trim(),
        idempotencyKey,
      };

      const res = await api.post("/bookings", bookingData);

      if (res.data?.success && res.data?.booking) {
        setConfirmedBooking(res.data.booking);
        setIdempotencyKey(makeIdempotencyKey());
      }
    } catch (err) {
      setSubmitError(getErrorMessage(err, "Failed to create booking. Please check your details."));
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmedBooking) {
    return (
      <div className="booking-page">
        <div className="booking-card booking-confirmation">
          <h1>🎉 Booking Reserved!</h1>
          <p className="booking-ref-pill">
            Reference: <strong>{confirmedBooking.bookingReference}</strong>
          </p>

          <img
            src={travel.image?.url}
            alt={travel.title}
            className="booking-image"
          />

          <div className="booking-summary-grid">
            <div>
              <span>Destination</span>
              <strong>{confirmedBooking.destination || travel.title}</strong>
            </div>
            <div>
              <span>Start Date</span>
              <strong>
                {new Date(confirmedBooking.startDate || confirmedBooking.date).toLocaleDateString()}
              </strong>
            </div>
            <div>
              <span>End Date</span>
              <strong>
                {confirmedBooking.endDate
                  ? new Date(confirmedBooking.endDate).toLocaleDateString()
                  : `${confirmedBooking.duration} days`}
              </strong>
            </div>
            <div>
              <span>Travellers</span>
              <strong>{confirmedBooking.travelers}</strong>
            </div>
            <div>
              <span>Duration</span>
              <strong>{confirmedBooking.duration} day(s)</strong>
            </div>
            <div>
              <span>Verified Total (Estimate)</span>
              <strong className="booking-price-highlight">
                ${confirmedBooking.totalCost}
              </strong>
            </div>
          </div>

          <p className="booking-payment-note">
            Status: <strong>{confirmedBooking.status}</strong> — Reservation recorded in
            your Travelogia profile. No online card payment has been processed.
          </p>

          <div className="booking-confirm-actions">
            <Link to="/profile" className="confirm-btn" style={{ textDecoration: "none", textAlign: "center" }}>
              View in My Profile
            </Link>
            <Link to="/travels" className="booking-secondary-btn">
              Explore More Destinations
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-page">
      <div className="booking-card">
        <h1>✈ Complete Your Booking</h1>

        <img
          src={travel.image?.url}
          alt={travel.title}
          className="booking-image"
        />

        <h2>{travel.title}</h2>

        <p style={{ color: "#cbd5e1", marginTop: "4px" }}>
          📍 {[travel.city, travel.state, travel.country].filter(Boolean).join(", ")} · Est. $
          {travel.pricePerNight} / night
        </p>

        {!authLoading && !user && (
          <div className="booking-inline-notice">
            You will be prompted to sign in before finalizing your reservation.
          </div>
        )}

        {submitError && (
          <div className="booking-inline-error" role="alert">
            {submitError}
          </div>
        )}

        <form className="booking-form" onSubmit={handleBooking}>
          <label htmlFor="booking-travellers">Number of Travellers (1–20)</label>

          <input
            id="booking-travellers"
            type="number"
            min="1"
            max="20"
            value={travellers}
            onChange={(e) => setTravellers(e.target.value)}
            required
          />

          <label htmlFor="booking-date">Start Travel Date</label>

          <input
            id="booking-date"
            type="date"
            min={todayStr}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          <label htmlFor="booking-duration">Duration in Days (1–60)</label>

          <input
            id="booking-duration"
            type="number"
            min="1"
            max="60"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
          />

          <label htmlFor="booking-notes">Special Requests (Optional)</label>

          <input
            id="booking-notes"
            type="text"
            maxLength={400}
            placeholder="Dietary preferences, airport transfer notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="cost-box">
            <h3>Estimated Total (Verified Server-Side)</h3>

            <p>${estimatedCost.toLocaleString()}</p>

            <small>
              {safeTravellers} Traveller(s) × {safeDuration} Day(s) × Est. $
              {travel.pricePerNight}/night · No online payment charged
            </small>
          </div>

          <button type="submit" className="confirm-btn" disabled={submitting}>
            {submitting ? "Confirming Reservation..." : "✅ Confirm Booking"}
          </button>

          <Link
            to={`/travels/${travel._id}`}
            className="booking-secondary-btn"
          >
            ← Back to Destination
          </Link>
        </form>
      </div>
    </div>
  );
}

export default Booking;
