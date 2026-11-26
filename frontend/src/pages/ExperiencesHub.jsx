import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";
import { launchRazorpayCheckout } from "../utils/razorpayCheckout";

const ACTIVITY_CATEGORIES = [
  "All",
  "Adventure Sports",
  "Trekking",
  "Guided Sightseeing",
  "Cultural Experience",
  "Local Tour",
  "Water Sports",
  "Workshop",
  "Nature Experience",
];

function futureDate(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export default function ExperiencesHub() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState("activities");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  // Module 22: Activities
  const [actFilter, setActFilter] = useState({
    city: searchParams.get("city") || "",
    category: "All",
    date: futureDate(3),
  });
  const [activities, setActivities] = useState([]);
  const [actSelection, setActSelection] = useState({ activity: null, timeSlot: "", participants: 2 });
  const [myActivities, setMyActivities] = useState([]);

  // Module 23: Local Tour Guides
  const [guideFilter, setGuideFilter] = useState({ city: "", language: "", expertise: "" });
  const [guides, setGuides] = useState([]);
  const [guideDraft, setGuideDraft] = useState({
    guide: null,
    startDate: futureDate(4),
    days: 2,
    languageRequested: "English",
    notes: "",
  });
  const [myGuides, setMyGuides] = useState([]);
  const [guideReviewDraft, setGuideReviewDraft] = useState({ guideId: "", rating: 5, comment: "" });

  // Module 24: Restaurants
  const [restFilter, setRestFilter] = useState({
    city: searchParams.get("city") || "",
    cuisine: "",
    date: futureDate(2),
  });
  const [restaurants, setRestaurants] = useState([]);
  const [restDraft, setRestDraft] = useState({
    restaurant: null,
    timeSlot: "",
    guests: 2,
    dietaryNotes: "",
  });
  const [myRestaurants, setMyRestaurants] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [aRes, gRes, rRes] = await Promise.all([
          api.get("/experiences/activities", {
            params: {
              city: actFilter.city || undefined,
              category: actFilter.category !== "All" ? actFilter.category : undefined,
              date: actFilter.date,
            },
          }),
          api.get("/experiences/guides", {
            params: {
              city: guideFilter.city || undefined,
              language: guideFilter.language || undefined,
              expertise: guideFilter.expertise || undefined,
            },
          }),
          api.get("/experiences/restaurants", {
            params: {
              city: restFilter.city || undefined,
              cuisine: restFilter.cuisine || undefined,
              date: restFilter.date,
            },
          }),
        ]);
        if (!active) return;
        setActivities(aRes.data?.data || []);
        setGuides(gRes.data?.data || []);
        setRestaurants(rRes.data?.data || []);
      } catch (err) {
        if (active) setError(getErrorMessage(err, "Failed to load experiences catalogue."));
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadNonce, actFilter, guideFilter, restFilter]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const [aRes, gRes, rRes] = await Promise.all([
          api.get("/experiences/activities/bookings/mine"),
          api.get("/experiences/guides/bookings/mine"),
          api.get("/experiences/restaurants/reservations/mine"),
        ]);
        if (!active) return;
        setMyActivities(aRes.data?.data || []);
        setMyGuides(gRes.data?.data || []);
        setMyRestaurants(rRes.data?.data || []);
      } catch {
        // non-blocking
      }
    })();
    return () => {
      active = false;
    };
  }, [user, reloadNonce]);

  const handleBookActivity = async (e) => {
    e.preventDefault();
    if (!user) return setError("Please sign in to book an activity.");
    if (!actSelection.activity) return;
    setError("");
    setNotice("");
    try {
      const res = await api.post("/experiences/activities/book", {
        activityId: actSelection.activity._id,
        date: actFilter.date,
        timeSlot: actSelection.timeSlot,
        participants: Number(actSelection.participants),
      });
      const bk = res.data?.data;
      setNotice(
        `Activity confirmed (${bk.bookingReference}) for ${bk.participants} participant(s) · ${bk.currency} ${bk.totalAmount}.`,
      );
      setActSelection({ activity: null, timeSlot: "", participants: 2 });
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Activity booking failed."));
    }
  };

  const handleCancelActivity = async (id) => {
    setError("");
    setNotice("");
    try {
      await api.patch(`/experiences/activities/bookings/${id}/cancel`);
      setNotice("Activity booking cancelled and slot capacity restored.");
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to cancel activity."));
    }
  };

  const handleRequestGuide = async (e) => {
    e.preventDefault();
    if (!user) return setError("Please sign in to request a tour guide.");
    if (!guideDraft.guide) return;
    setError("");
    setNotice("");
    try {
      const res = await api.post("/experiences/guides/book", {
        guideId: guideDraft.guide._id,
        startDate: guideDraft.startDate,
        days: Number(guideDraft.days),
        languageRequested: guideDraft.languageRequested,
        notes: guideDraft.notes,
      });
      const bk = res.data?.data;
      setNotice(
        `Guide booking request ${bk.bookingReference} sent (${bk.currency} ${bk.totalAmount}).`,
      );
      setGuideDraft({ ...guideDraft, guide: null, notes: "" });
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Guide booking request failed."));
    }
  };

  const handleGuideStatus = async (id, status) => {
    setError("");
    setNotice("");
    try {
      await api.patch(`/experiences/guides/bookings/${id}/status`, { status });
      setNotice(`Guide booking marked ${status}.`);
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to update guide booking."));
    }
  };

  const handleSubmitGuideReview = async (e) => {
    e.preventDefault();
    if (!guideReviewDraft.guideId) return;
    setError("");
    setNotice("");
    try {
      await api.post(`/experiences/guides/${guideReviewDraft.guideId}/reviews`, {
        rating: Number(guideReviewDraft.rating),
        comment: guideReviewDraft.comment,
      });
      setNotice("Verified tour guide review published!");
      setGuideReviewDraft({ guideId: "", rating: 5, comment: "" });
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to publish guide review."));
    }
  };

  const handleReserveRestaurant = async (e) => {
    e.preventDefault();
    if (!user) return setError("Please sign in to reserve a table.");
    if (!restDraft.restaurant) return;
    setError("");
    setNotice("");
    try {
      const res = await api.post("/experiences/restaurants/reserve", {
        restaurantId: restDraft.restaurant._id,
        date: restFilter.date,
        timeSlot: restDraft.timeSlot,
        guests: Number(restDraft.guests),
        dietaryNotes: restDraft.dietaryNotes,
      });
      const bk = res.data?.data;
      setNotice(
        `Table reserved (${bk.bookingReference}) at ${bk.restaurantName} on ${bk.date} at ${bk.timeSlot}.`,
      );
      setRestDraft({ restaurant: null, timeSlot: "", guests: 2, dietaryNotes: "" });
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Table reservation failed."));
    }
  };

  const handleCancelRestaurant = async (id) => {
    setError("");
    setNotice("");
    try {
      await api.patch(`/experiences/restaurants/reservations/${id}/cancel`);
      setNotice("Restaurant reservation cancelled.");
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Cancellation failed."));
    }
  };

  const handlePayItem = async (bookingType, bookingId) => {
    setError("");
    setNotice("");
    await launchRazorpayCheckout({
      bookingType,
      bookingId,
      prefill: { name: user?.username, email: user?.email },
      onVerified: (tx) => {
        setNotice(`Payment verified server-side! Invoice ${tx?.invoiceNumber}.`);
        setReloadNonce((n) => n + 1);
      },
      onError: (msg) => setError(msg),
    });
  };

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>🧭 Activities, Local Tour Guides &amp; Dining</h1>
          <p>
            Book curated adventure sports, treks, cultural immersions, and workshops with strict
            slot capacity limits, hire verified local tour guides, and reserve restaurant tables
            against configured seat availability.
          </p>
        </div>

        <div className="v2-tabs">
          <button
            type="button"
            className={`v2-tab ${tab === "activities" ? "active" : ""}`}
            onClick={() => setTab("activities")}
          >
            🧗 Activities &amp; Experiences ({activities.length})
          </button>
          <button
            type="button"
            className={`v2-tab ${tab === "guides" ? "active" : ""}`}
            onClick={() => setTab("guides")}
          >
            🗣️ Local Tour Guides ({guides.length})
          </button>
          <button
            type="button"
            className={`v2-tab ${tab === "restaurants" ? "active" : ""}`}
            onClick={() => setTab("restaurants")}
          >
            🍽️ Restaurants &amp; Dining ({restaurants.length})
          </button>
        </div>

        {error && <div className="v2-alert-error">{error}</div>}
        {notice && <div className="v2-alert-success">{notice}</div>}

        {/* MODULE 22: ACTIVITIES */}
        {tab === "activities" && (
          <div>
            <div className="v2-card" style={{ marginBottom: "18px" }}>
              <div className="v2-grid-3">
                <div className="v2-field">
                  <label>City / Destination</label>
                  <input
                    className="v2-input"
                    placeholder="Darjeeling, Goa, Jaipur, Manali, Majuli..."
                    value={actFilter.city}
                    onChange={(e) => setActFilter({ ...actFilter, city: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Category</label>
                  <select
                    className="v2-select"
                    value={actFilter.category}
                    onChange={(e) => setActFilter({ ...actFilter, category: e.target.value })}
                  >
                    {ACTIVITY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="v2-field">
                  <label>Activity Date</label>
                  <input
                    type="date"
                    className="v2-input"
                    value={actFilter.date}
                    onChange={(e) => setActFilter({ ...actFilter, date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {actSelection.activity && (
              <form
                onSubmit={handleBookActivity}
                className="v2-card"
                style={{ marginBottom: "18px", borderColor: "#2563eb" }}
              >
                <div className="v2-card-title">
                  <span>Book {actSelection.activity.title}</span>
                  <button
                    type="button"
                    className="v2-btn v2-btn-secondary v2-btn-sm"
                    onClick={() => setActSelection({ activity: null, timeSlot: "", participants: 2 })}
                  >
                    Close
                  </button>
                </div>
                <div className="v2-grid-3">
                  <div className="v2-field">
                    <label>Time Slot ({actFilter.date})</label>
                    <select
                      className="v2-select"
                      value={actSelection.timeSlot}
                      onChange={(e) =>
                        setActSelection({ ...actSelection, timeSlot: e.target.value })
                      }
                    >
                      {(actSelection.activity.slotAvailability || []).map((s) => (
                        <option key={s.slot} value={s.slot} disabled={s.remaining <= 0}>
                          {s.slot} ({s.remaining}/{s.maxCapacity} spots left)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="v2-field">
                    <label>Participants</label>
                    <input
                      type="number"
                      min="1"
                      max="15"
                      className="v2-input"
                      value={actSelection.participants}
                      onChange={(e) =>
                        setActSelection({ ...actSelection, participants: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="v2-field">
                    <label>Estimated Total</label>
                    <div style={{ paddingTop: "10px", fontWeight: 700, fontSize: "16px" }}>
                      {actSelection.activity.currency}{" "}
                      {actSelection.activity.pricePerPerson * actSelection.participants}
                    </div>
                  </div>
                </div>
                <button type="submit" className="v2-btn v2-btn-accent">
                  Confirm Activity Booking
                </button>
              </form>
            )}

            <div className="v2-grid-3" style={{ marginBottom: "22px" }}>
              {activities.map((a) => (
                <div key={a._id} className="v2-rec-card">
                  <img src={a.image} alt={a.title} loading="lazy" />
                  <div className="v2-rec-card-body">
                    <div className="v2-chip-row">
                      <span className="v2-chip">{a.category}</span>
                      <span className="v2-chip v2-chip-yes">★ {a.rating}</span>
                    </div>
                    <h3 style={{ fontSize: "16px", marginTop: "4px" }}>{a.title}</h3>
                    <div style={{ fontSize: "13px", color: "#475569" }}>
                      {a.city} · {a.durationHours}h · {a.providerName}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "15px" }}>
                      {a.currency} {a.pricePerPerson} / person
                    </div>
                    <div className="v2-chip-row" style={{ margin: "4px 0" }}>
                      {(a.slotAvailability || []).map((s) => (
                        <span key={s.slot} className="v2-chip v2-chip-unknown">
                          {s.slot}: {s.remaining} left
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="v2-btn v2-btn-primary v2-btn-sm"
                      style={{ marginTop: "auto" }}
                      onClick={() =>
                        setActSelection({
                          activity: a,
                          timeSlot: a.timeSlots?.[0] || "",
                          participants: 2,
                        })
                      }
                    >
                      Select Time Slot
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {user && myActivities.length > 0 && (
              <div className="v2-card">
                <div className="v2-card-title">My Activity Bookings</div>
                <table className="v2-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Activity</th>
                      <th>Date / Slot</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myActivities.map((b) => (
                      <tr key={b._id}>
                        <td>
                          <strong>{b.bookingReference}</strong>
                        </td>
                        <td>
                          {b.activityTitle} ({b.participants} pax)
                        </td>
                        <td>
                          {b.date} · {b.timeSlot}
                        </td>
                        <td>
                          {b.currency} {b.totalAmount}
                        </td>
                        <td>
                          <span
                            className={`v2-chip ${
                              b.status === "CANCELLED" ? "v2-chip-no" : "v2-chip-yes"
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td>
                          <div className="v2-chip-row">
                            {b.status === "CONFIRMED" && b.paymentStatus !== "PAID" && (
                              <button
                                type="button"
                                className="v2-btn v2-btn-primary v2-btn-sm"
                                onClick={() => handlePayItem("ACTIVITY", b._id)}
                              >
                                Pay
                              </button>
                            )}
                            {b.status === "CONFIRMED" && (
                              <button
                                type="button"
                                className="v2-btn v2-btn-danger v2-btn-sm"
                                onClick={() => handleCancelActivity(b._id)}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MODULE 23: LOCAL TOUR GUIDES */}
        {tab === "guides" && (
          <div>
            <div className="v2-card" style={{ marginBottom: "18px" }}>
              <div className="v2-grid-3">
                <div className="v2-field">
                  <label>City / Region</label>
                  <input
                    className="v2-input"
                    placeholder="Darjeeling, Jaipur, Guwahati..."
                    value={guideFilter.city}
                    onChange={(e) => setGuideFilter({ ...guideFilter, city: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Language</label>
                  <input
                    className="v2-input"
                    placeholder="English, Hindi, French, Nepali..."
                    value={guideFilter.language}
                    onChange={(e) => setGuideFilter({ ...guideFilter, language: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Expertise</label>
                  <input
                    className="v2-input"
                    placeholder="Treks, Architecture, Wildlife..."
                    value={guideFilter.expertise}
                    onChange={(e) => setGuideFilter({ ...guideFilter, expertise: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {guideDraft.guide && (
              <form
                onSubmit={handleRequestGuide}
                className="v2-card"
                style={{ marginBottom: "18px", borderColor: "#2563eb" }}
              >
                <div className="v2-card-title">
                  <span>Request Local Guide: {guideDraft.guide.name}</span>
                  <button
                    type="button"
                    className="v2-btn v2-btn-secondary v2-btn-sm"
                    onClick={() => setGuideDraft({ ...guideDraft, guide: null })}
                  >
                    Close
                  </button>
                </div>
                <div className="v2-grid-3">
                  <div className="v2-field">
                    <label>Start Date</label>
                    <input
                      type="date"
                      required
                      className="v2-input"
                      value={guideDraft.startDate}
                      onChange={(e) => setGuideDraft({ ...guideDraft, startDate: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Duration (Days)</label>
                    <input
                      type="number"
                      min="1"
                      max="14"
                      className="v2-input"
                      value={guideDraft.days}
                      onChange={(e) =>
                        setGuideDraft({ ...guideDraft, days: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="v2-field">
                    <label>Preferred Language</label>
                    <select
                      className="v2-select"
                      value={guideDraft.languageRequested}
                      onChange={(e) =>
                        setGuideDraft({ ...guideDraft, languageRequested: e.target.value })
                      }
                    >
                      {(guideDraft.guide.languages || ["English"]).map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="v2-field">
                  <label>Trip Notes</label>
                  <input
                    className="v2-input"
                    placeholder="Interests, pace, accessibility notes..."
                    value={guideDraft.notes}
                    onChange={(e) => setGuideDraft({ ...guideDraft, notes: e.target.value })}
                  />
                </div>
                <button type="submit" className="v2-btn v2-btn-accent">
                  Send Booking Request ({guideDraft.guide.currency}{" "}
                  {guideDraft.guide.pricePerDay * guideDraft.days})
                </button>
              </form>
            )}

            <div className="v2-grid-3" style={{ marginBottom: "22px" }}>
              {guides.map((g) => (
                <div key={g._id} className="v2-card">
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "10px" }}>
                    <img
                      src={g.photo}
                      alt={g.name}
                      style={{ width: "60px", height: "60px", borderRadius: "999px", objectFit: "cover" }}
                    />
                    <div>
                      <strong>{g.name}</strong>
                      <div style={{ fontSize: "12.5px", color: "#64748b" }}>
                        {g.city} · {g.experienceYears} yrs exp · ★ {g.rating}
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: "13.5px", color: "#334155", marginBottom: "10px" }}>{g.bio}</p>
                  <div className="v2-chip-row" style={{ marginBottom: "8px" }}>
                    {(g.languages || []).map((l) => (
                      <span key={l} className="v2-chip">
                        {l}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#475569", marginBottom: "10px" }}>
                    Expertise: {(g.expertise || []).join(" · ")}
                  </div>
                  <div style={{ fontWeight: 700, marginBottom: "10px" }}>
                    {g.currency} {g.pricePerDay} / day
                  </div>
                  <button
                    type="button"
                    className="v2-btn v2-btn-primary v2-btn-sm"
                    onClick={() => setGuideDraft({ ...guideDraft, guide: g })}
                  >
                    Request Guide
                  </button>
                </div>
              ))}
            </div>

            {user && myGuides.length > 0 && (
              <div className="v2-card">
                <div className="v2-card-title">My Tour Guide Requests</div>
                <table className="v2-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Guide</th>
                      <th>Start &amp; Days</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myGuides.map((b) => (
                      <tr key={b._id}>
                        <td>
                          <strong>{b.bookingReference}</strong>
                        </td>
                        <td>
                          {b.guideName} ({b.city})
                        </td>
                        <td>
                          {b.startDate} · {b.days}d
                        </td>
                        <td>
                          {b.currency} {b.totalAmount}
                        </td>
                        <td>
                          <span className="v2-chip">{b.status}</span>
                        </td>
                        <td>
                          <div className="v2-chip-row">
                            {b.status === "PENDING" && (
                              <button
                                type="button"
                                className="v2-btn v2-btn-secondary v2-btn-sm"
                                onClick={() => handleGuideStatus(b._id, "CONFIRMED")}
                              >
                                Confirm
                              </button>
                            )}
                            {b.status === "CONFIRMED" && (
                              <button
                                type="button"
                                className="v2-btn v2-btn-secondary v2-btn-sm"
                                onClick={() => handleGuideStatus(b._id, "COMPLETED")}
                              >
                                Mark Completed
                              </button>
                            )}
                            {b.status === "COMPLETED" && (
                              <button
                                type="button"
                                className="v2-btn v2-btn-primary v2-btn-sm"
                                onClick={() =>
                                  setGuideReviewDraft({ guideId: b.guideId, rating: 5, comment: "" })
                                }
                              >
                                Review Guide
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {guideReviewDraft.guideId && (
                  <form onSubmit={handleSubmitGuideReview} style={{ marginTop: "14px" }}>
                    <h4>Submit Verified Guide Review</h4>
                    <div className="v2-grid-2">
                      <div className="v2-field">
                        <label>Rating (1–5)</label>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          className="v2-input"
                          value={guideReviewDraft.rating}
                          onChange={(e) =>
                            setGuideReviewDraft({ ...guideReviewDraft, rating: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="v2-field">
                        <label>Comment</label>
                        <input
                          className="v2-input"
                          required
                          value={guideReviewDraft.comment}
                          onChange={(e) =>
                            setGuideReviewDraft({ ...guideReviewDraft, comment: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <button type="submit" className="v2-btn v2-btn-accent v2-btn-sm">
                      Submit Review
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {/* MODULE 24: RESTAURANTS */}
        {tab === "restaurants" && (
          <div>
            <div className="v2-card" style={{ marginBottom: "18px" }}>
              <div className="v2-grid-3">
                <div className="v2-field">
                  <label>City</label>
                  <input
                    className="v2-input"
                    placeholder="Darjeeling, Goa, Jaipur, Gangtok..."
                    value={restFilter.city}
                    onChange={(e) => setRestFilter({ ...restFilter, city: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Cuisine</label>
                  <input
                    className="v2-input"
                    placeholder="Himalayan, Goan, Rajasthani, Tibetan..."
                    value={restFilter.cuisine}
                    onChange={(e) => setRestFilter({ ...restFilter, cuisine: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Dining Date</label>
                  <input
                    type="date"
                    className="v2-input"
                    value={restFilter.date}
                    onChange={(e) => setRestFilter({ ...restFilter, date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {restDraft.restaurant && (
              <form
                onSubmit={handleReserveRestaurant}
                className="v2-card"
                style={{ marginBottom: "18px", borderColor: "#2563eb" }}
              >
                <div className="v2-card-title">
                  <span>Reserve Table at {restDraft.restaurant.name}</span>
                  <button
                    type="button"
                    className="v2-btn v2-btn-secondary v2-btn-sm"
                    onClick={() =>
                      setRestDraft({ restaurant: null, timeSlot: "", guests: 2, dietaryNotes: "" })
                    }
                  >
                    Close
                  </button>
                </div>
                <div className="v2-grid-3">
                  <div className="v2-field">
                    <label>Configured Dining Slot ({restFilter.date})</label>
                    <select
                      className="v2-select"
                      value={restDraft.timeSlot}
                      onChange={(e) => setRestDraft({ ...restDraft, timeSlot: e.target.value })}
                    >
                      {(restDraft.restaurant.slotAvailability || []).map((s) => (
                        <option key={s.slot} value={s.slot} disabled={s.remainingSeats <= 0}>
                          {s.slot} ({s.remainingSeats}/{s.maxSeats} seats free)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="v2-field">
                    <label>Guest Count</label>
                    <input
                      type="number"
                      min="1"
                      max="16"
                      className="v2-input"
                      value={restDraft.guests}
                      onChange={(e) =>
                        setRestDraft({ ...restDraft, guests: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="v2-field">
                    <label>Dietary / Seating Notes</label>
                    <input
                      className="v2-input"
                      placeholder="Vegetarian, nut allergy, terrace table..."
                      value={restDraft.dietaryNotes}
                      onChange={(e) =>
                        setRestDraft({ ...restDraft, dietaryNotes: e.target.value })
                      }
                    />
                  </div>
                </div>
                <button type="submit" className="v2-btn v2-btn-accent">
                  Confirm Table Reservation
                </button>
              </form>
            )}

            <div className="v2-grid-2" style={{ marginBottom: "22px" }}>
              {restaurants.map((r) => (
                <div key={r._id} className="v2-rec-card">
                  <img src={r.image} alt={r.name} loading="lazy" />
                  <div className="v2-rec-card-body">
                    <div className="v2-chip-row">
                      <span className="v2-chip">{r.city}</span>
                      <span className="v2-chip v2-chip-unknown">{r.priceTier}</span>
                      <span className="v2-chip v2-chip-yes">★ {r.rating}</span>
                    </div>
                    <h3 style={{ fontSize: "17px", marginTop: "4px" }}>{r.name}</h3>
                    <div style={{ fontSize: "13px", color: "#475569" }}>
                      {(r.cuisines || []).join(" · ")} — {r.address}
                    </div>
                    <p style={{ fontSize: "13px", color: "#334155" }}>{r.description}</p>
                    <div className="v2-chip-row">
                      {(r.slotAvailability || []).map((s) => (
                        <span key={s.slot} className="v2-chip v2-chip-unknown">
                          {s.slot}: {s.remainingSeats} seats
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="v2-btn v2-btn-primary v2-btn-sm"
                      style={{ marginTop: "8px" }}
                      onClick={() =>
                        setRestDraft({
                          restaurant: r,
                          timeSlot: r.timeSlots?.[0]?.slot || "",
                          guests: 2,
                          dietaryNotes: "",
                        })
                      }
                    >
                      Reserve Table
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {user && myRestaurants.length > 0 && (
              <div className="v2-card">
                <div className="v2-card-title">My Restaurant Reservations</div>
                <table className="v2-table">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Restaurant</th>
                      <th>Date &amp; Slot</th>
                      <th>Guests</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRestaurants.map((r) => (
                      <tr key={r._id}>
                        <td>
                          <strong>{r.bookingReference}</strong>
                        </td>
                        <td>
                          {r.restaurantName} ({r.city})
                        </td>
                        <td>
                          {r.date} · {r.timeSlot}
                        </td>
                        <td>{r.guests}</td>
                        <td>
                          <span
                            className={`v2-chip ${
                              r.status === "CANCELLED" ? "v2-chip-no" : "v2-chip-yes"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td>
                          {r.status !== "CANCELLED" && (
                            <button
                              type="button"
                              className="v2-btn v2-btn-danger v2-btn-sm"
                              onClick={() => handleCancelRestaurant(r._id)}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!user && (
          <div className="v2-disclaimer" style={{ marginTop: "18px" }}>
            <Link to="/login">Sign in</Link> to book activities, request local tour guides, or
            confirm restaurant tables.
          </div>
        )}
      </div>
    </div>
  );
}
