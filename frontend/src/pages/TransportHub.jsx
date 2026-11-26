import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";
import { launchRazorpayCheckout } from "../utils/razorpayCheckout";

function futureDate(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export default function TransportHub() {
  const { user } = useAuth();
  const [tab, setTab] = useState("flights");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  // Module 17: Flights
  const [airports, setAirports] = useState([]);
  const [flightQuery, setFlightQuery] = useState({
    origin: "CCU",
    destination: "IXB",
    departureDate: futureDate(7),
    returnDate: "",
    passengers: 1,
    cabinClass: "Economy",
    airline: "",
  });
  const [flightResult, setFlightResult] = useState(null);
  const [flightRef, setFlightRef] = useState({
    pnr: "",
    airline: "IndiGo",
    flightNumber: "6E-612",
    origin: "CCU",
    destination: "IXB",
    travelDate: futureDate(7),
    departureTime: "09:15",
  });

  // Module 18: Trains
  const [stations, setStations] = useState([]);
  const [trainQuery, setTrainQuery] = useState({ from: "", to: "", journeyDate: futureDate(7) });
  const [trainResult, setTrainResult] = useState(null);
  const [trainRef, setTrainRef] = useState({
    pnr: "",
    trainNumber: "22301",
    trainName: "Vande Bharat Express",
    origin: "HWH",
    destination: "NJP",
    travelDate: futureDate(7),
    departureTime: "05:55",
    travelClass: "CC",
  });

  // Module 19: Bus Booking
  const [busQuery, setBusQuery] = useState({ origin: "", destination: "", travelDate: futureDate(3) });
  const [buses, setBuses] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [boardingPoint, setBoardingPoint] = useState("");
  const [droppingPoint, setDroppingPoint] = useState("");

  // Module 20: Car Rental & Cabs
  const [carQuery, setCarQuery] = useState({ city: "", serviceType: "All", vehicleCategory: "All" });
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [carBooking, setCarBooking] = useState({
    travelDate: futureDate(3),
    departureTime: "09:00",
    pickupLocation: "",
    dropoffLocation: "",
    rentalDays: 2,
  });

  // Module 21: Unified Timeline
  const [timeline, setTimeline] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [aRes, sRes, bRes, cRes, tRes] = await Promise.all([
          api.get("/transport/flights/airports"),
          api.get("/transport/trains/stations"),
          api.get("/transport/buses/search", { params: busQuery }),
          api.get("/transport/cars/search", { params: carQuery }),
          api.get("/transport/trains/search", { params: trainQuery }),
        ]);
        if (!active) return;
        setAirports(aRes.data?.data || []);
        setStations(sRes.data?.data || []);
        setBuses(bRes.data?.data || []);
        setCars(cRes.data?.data || []);
        setTrainResult(tRes.data || null);
      } catch (err) {
        if (active) setError(getErrorMessage(err, "Unable to load transport catalogue."));
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadNonce, busQuery, carQuery, trainQuery]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get("/transport/reservations/mine");
        if (active) setTimeline(res.data?.data || []);
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [user, reloadNonce]);

  const handleFlightSearch = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api.get("/transport/flights/search", { params: flightQuery });
      setFlightResult(res.data);
    } catch (err) {
      setError(getErrorMessage(err, "Flight search failed."));
    }
  };

  const handleSaveFlightRef = async (e) => {
    e.preventDefault();
    if (!user) return setError("Please sign in to save a flight reference.");
    setError("");
    setNotice("");
    try {
      await api.post("/transport/flights/save-reference", flightRef);
      setNotice("External flight PNR added to your Unified Transport Timeline and Travel Wallet.");
      setFlightRef((prev) => ({ ...prev, pnr: "" }));
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save flight reference."));
    }
  };

  const handleSaveTrainRef = async (e) => {
    e.preventDefault();
    if (!user) return setError("Please sign in to save an IRCTC train reference.");
    setError("");
    setNotice("");
    try {
      await api.post("/transport/trains/save-reference", trainRef);
      setNotice("External train PNR saved to Unified Transport Timeline and Travel Wallet.");
      setTrainRef((prev) => ({ ...prev, pnr: "" }));
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save train PNR."));
    }
  };

  const toggleSeat = (seatNum) => {
    setSelectedSeats((prev) =>
      prev.includes(seatNum) ? prev.filter((s) => s !== seatNum) : [...prev, seatNum],
    );
  };

  const handleBookBus = async () => {
    if (!user) return setError("Please sign in to book bus seats.");
    if (!selectedBus || selectedSeats.length === 0) {
      return setError("Select at least one available seat first.");
    }
    setError("");
    setNotice("");
    try {
      const res = await api.post("/transport/buses/book", {
        routeId: selectedBus._id,
        travelDate: busQuery.travelDate,
        seatNumbers: selectedSeats,
        boardingPoint: boardingPoint || selectedBus.boardingPoints?.[0]?.name || "",
        droppingPoint: droppingPoint || selectedBus.droppingPoints?.[0]?.name || "",
      });
      const bk = res.data?.data;
      setNotice(
        `Bus seats ${bk.seatNumbers.join(", ")} confirmed (${bk.bookingReference}) · Total ${bk.currency} ${bk.totalAmount}.`,
      );
      setSelectedSeats([]);
      setSelectedBus(null);
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Bus seat booking failed."));
    }
  };

  const handleBookCar = async (e) => {
    e.preventDefault();
    if (!user) return setError("Please sign in to reserve a vehicle.");
    if (!selectedCar) return;
    setError("");
    setNotice("");
    try {
      const res = await api.post("/transport/cars/book", {
        vehicleId: selectedCar._id,
        ...carBooking,
      });
      const bk = res.data?.data;
      setNotice(
        `Transport confirmed (${bk.bookingReference}) · Total ${bk.currency} ${bk.totalAmount}.`,
      );
      setSelectedCar(null);
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Vehicle booking failed."));
    }
  };

  const handleCancelTransport = async (id) => {
    setError("");
    setNotice("");
    try {
      await api.patch(`/transport/reservations/${id}/cancel`);
      setNotice("Transport reservation cancelled.");
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Cancellation failed."));
    }
  };

  const handlePayTransport = async (resv) => {
    setError("");
    setNotice("");
    await launchRazorpayCheckout({
      bookingType: resv.mode,
      bookingId: resv._id,
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
          <h1>✈️ Multimodal Transport Hub</h1>
          <p>
            Search flights via official fare portals, plan Indian Rail journeys with IRCTC links,
            book seats on demo intercity buses with double-booking prevention, rent cars/cabs, and
            track every leg in your Unified Transport Timeline.
          </p>
        </div>

        <div className="v2-tabs">
          {[
            ["flights", "✈️ Flights"],
            ["trains", "🚆 Trains"],
            ["buses", "🚌 Bus Booking"],
            ["cars", "🚗 Cars & Cabs"],
            ["timeline", `🗓️ Unified Timeline (${timeline.length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`v2-tab ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="v2-alert-error">{error}</div>}
        {notice && <div className="v2-alert-success">{notice}</div>}

        {/* MODULE 17: FLIGHTS */}
        {tab === "flights" && (
          <div className="v2-grid-2">
            <div className="v2-card">
              <div className="v2-card-title">Flight Search &amp; Official Fare Comparison</div>
              <form onSubmit={handleFlightSearch}>
                <div className="v2-grid-2">
                  <div className="v2-field">
                    <label>Origin Airport</label>
                    <select
                      className="v2-select"
                      value={flightQuery.origin}
                      onChange={(e) => setFlightQuery({ ...flightQuery, origin: e.target.value })}
                    >
                      {airports.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} — {a.city}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="v2-field">
                    <label>Destination Airport</label>
                    <select
                      className="v2-select"
                      value={flightQuery.destination}
                      onChange={(e) =>
                        setFlightQuery({ ...flightQuery, destination: e.target.value })
                      }
                    >
                      {airports.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} — {a.city}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="v2-field">
                    <label>Departure Date</label>
                    <input
                      type="date"
                      className="v2-input"
                      value={flightQuery.departureDate}
                      onChange={(e) =>
                        setFlightQuery({ ...flightQuery, departureDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="v2-field">
                    <label>Return Date (Optional)</label>
                    <input
                      type="date"
                      className="v2-input"
                      value={flightQuery.returnDate}
                      onChange={(e) =>
                        setFlightQuery({ ...flightQuery, returnDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="v2-field">
                    <label>Passengers</label>
                    <input
                      type="number"
                      min="1"
                      max="9"
                      className="v2-input"
                      value={flightQuery.passengers}
                      onChange={(e) =>
                        setFlightQuery({ ...flightQuery, passengers: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="v2-field">
                    <label>Cabin Class</label>
                    <select
                      className="v2-select"
                      value={flightQuery.cabinClass}
                      onChange={(e) =>
                        setFlightQuery({ ...flightQuery, cabinClass: e.target.value })
                      }
                    >
                      <option value="Economy">Economy</option>
                      <option value="Premium Economy">Premium Economy</option>
                      <option value="Business">Business</option>
                    </select>
                  </div>
                </div>
                <div className="v2-field">
                  <label>Preferred Airline Filter (Optional)</label>
                  <input
                    className="v2-input"
                    placeholder="IndiGo, Air India..."
                    value={flightQuery.airline}
                    onChange={(e) => setFlightQuery({ ...flightQuery, airline: e.target.value })}
                  />
                </div>
                <button type="submit" className="v2-btn v2-btn-primary">
                  Compare Live Fares on Official Portals
                </button>
              </form>

              {flightResult && (
                <div style={{ marginTop: "16px" }}>
                  <div className="v2-disclaimer">{flightResult.disclosure}</div>
                  <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                    {(flightResult.externalComparisonPortals || []).map((p) => (
                      <div
                        key={p.provider}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <div>
                          <strong>{p.provider}</strong>{" "}
                          <span className="v2-chip">{p.type}</span>
                          <div style={{ fontSize: "12.5px", color: "#64748b", marginTop: "3px" }}>
                            {p.note}
                          </div>
                        </div>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="v2-btn v2-btn-accent v2-btn-sm"
                        >
                          Open Portal ↗
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="v2-card">
              <div className="v2-card-title">Save Confirmed Airline PNR to Trip Timeline</div>
              <p style={{ fontSize: "13.5px", color: "#475569", marginBottom: "12px" }}>
                Booked your flight externally? Record your carrier PNR so it appears in your Unified
                Transport Timeline and Digital Travel Wallet.
              </p>
              <form onSubmit={handleSaveFlightRef}>
                <div className="v2-grid-2">
                  <div className="v2-field">
                    <label>Airline PNR / Reference</label>
                    <input
                      className="v2-input"
                      placeholder="e.g. AB12CD"
                      required
                      value={flightRef.pnr}
                      onChange={(e) => setFlightRef({ ...flightRef, pnr: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Airline</label>
                    <input
                      className="v2-input"
                      value={flightRef.airline}
                      onChange={(e) => setFlightRef({ ...flightRef, airline: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Flight Number</label>
                    <input
                      className="v2-input"
                      value={flightRef.flightNumber}
                      onChange={(e) => setFlightRef({ ...flightRef, flightNumber: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Departure Date</label>
                    <input
                      type="date"
                      className="v2-input"
                      value={flightRef.travelDate}
                      onChange={(e) => setFlightRef({ ...flightRef, travelDate: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Origin Code</label>
                    <input
                      className="v2-input"
                      value={flightRef.origin}
                      onChange={(e) => setFlightRef({ ...flightRef, origin: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Destination Code</label>
                    <input
                      className="v2-input"
                      value={flightRef.destination}
                      onChange={(e) => setFlightRef({ ...flightRef, destination: e.target.value })}
                    />
                  </div>
                </div>
                <button type="submit" className="v2-btn v2-btn-primary">
                  Link Flight PNR to My Trip
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MODULE 18: TRAINS */}
        {tab === "trains" && (
          <div className="v2-grid-2">
            <div className="v2-card">
              <div className="v2-card-title">Indian Railways Journey Planner</div>
              <div className="v2-grid-3" style={{ marginBottom: "12px" }}>
                <div className="v2-field">
                  <label>Source Station</label>
                  <select
                    className="v2-select"
                    value={trainQuery.from}
                    onChange={(e) => setTrainQuery({ ...trainQuery, from: e.target.value })}
                  >
                    <option value="">All Stations</option>
                    {stations.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="v2-field">
                  <label>Destination Station</label>
                  <select
                    className="v2-select"
                    value={trainQuery.to}
                    onChange={(e) => setTrainQuery({ ...trainQuery, to: e.target.value })}
                  >
                    <option value="">All Stations</option>
                    {stations.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="v2-field">
                  <label>Journey Date</label>
                  <input
                    type="date"
                    className="v2-input"
                    value={trainQuery.journeyDate}
                    onChange={(e) => setTrainQuery({ ...trainQuery, journeyDate: e.target.value })}
                  />
                </div>
              </div>

              {trainResult?.disclosure && (
                <div className="v2-disclaimer" style={{ marginBottom: "12px" }}>
                  {trainResult.disclosure}
                </div>
              )}

              <div style={{ display: "grid", gap: "10px" }}>
                {(trainResult?.data || []).map((t) => (
                  <div
                    key={t.trainNumber}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      padding: "12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                      <strong>
                        {t.trainNumber} — {t.trainName}
                      </strong>
                      <span className="v2-chip">
                        {t.fromCode} ({t.departureTime}) → {t.toCode} ({t.arrivalTime})
                      </span>
                    </div>
                    <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "6px" }}>
                      Duration: {t.duration} · Runs: {t.runsOn.join(", ")} · Classes:{" "}
                      {t.classes.join(", ")}
                    </div>
                    <div className="v2-chip-row" style={{ marginTop: "8px" }}>
                      <a
                        href={t.officialBookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="v2-btn v2-btn-accent v2-btn-sm"
                      >
                        Check Live Seats on IRCTC ↗
                      </a>
                      <a
                        href={t.liveRunningStatusUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="v2-btn v2-btn-secondary v2-btn-sm"
                      >
                        NTES Running Status ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="v2-card">
              <div className="v2-card-title">Save IRCTC PNR to Trip Timeline</div>
              <form onSubmit={handleSaveTrainRef}>
                <div className="v2-grid-2">
                  <div className="v2-field">
                    <label>10-Digit IRCTC PNR</label>
                    <input
                      className="v2-input"
                      placeholder="e.g. 6428910345"
                      required
                      value={trainRef.pnr}
                      onChange={(e) => setTrainRef({ ...trainRef, pnr: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Train Number</label>
                    <input
                      className="v2-input"
                      value={trainRef.trainNumber}
                      onChange={(e) => setTrainRef({ ...trainRef, trainNumber: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>From Station</label>
                    <input
                      className="v2-input"
                      value={trainRef.origin}
                      onChange={(e) => setTrainRef({ ...trainRef, origin: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>To Station</label>
                    <input
                      className="v2-input"
                      value={trainRef.destination}
                      onChange={(e) => setTrainRef({ ...trainRef, destination: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Journey Date</label>
                    <input
                      type="date"
                      className="v2-input"
                      value={trainRef.travelDate}
                      onChange={(e) => setTrainRef({ ...trainRef, travelDate: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Class</label>
                    <select
                      className="v2-select"
                      value={trainRef.travelClass}
                      onChange={(e) => setTrainRef({ ...trainRef, travelClass: e.target.value })}
                    >
                      {["SL", "3A", "2A", "1A", "CC", "EC"].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button type="submit" className="v2-btn v2-btn-primary">
                  Save Train Reference to Trip
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MODULE 19: BUS BOOKING WITH INTERACTIVE SEAT MAP */}
        {tab === "buses" && (
          <div>
            <div className="v2-card" style={{ marginBottom: "18px" }}>
              <div className="v2-grid-3">
                <div className="v2-field">
                  <label>Origin City</label>
                  <input
                    className="v2-input"
                    placeholder="Kolkata, New Delhi, Mumbai, Guwahati..."
                    value={busQuery.origin}
                    onChange={(e) => setBusQuery({ ...busQuery, origin: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Destination City</label>
                  <input
                    className="v2-input"
                    placeholder="Siliguri, Manali, Goa, Shillong..."
                    value={busQuery.destination}
                    onChange={(e) => setBusQuery({ ...busQuery, destination: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Travel Date</label>
                  <input
                    type="date"
                    className="v2-input"
                    value={busQuery.travelDate}
                    onChange={(e) => setBusQuery({ ...busQuery, travelDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="v2-disclaimer">
                Demo Operator Inventory: Real seat-level double-booking prevention is active per
                route &amp; travel date.
              </div>
            </div>

            {selectedBus && (
              <div className="v2-card" style={{ marginBottom: "20px", borderColor: "#2563eb" }}>
                <div className="v2-card-title">
                  <span>
                    Seat Selection — {selectedBus.operatorName} ({selectedBus.originCity} →{" "}
                    {selectedBus.destinationCity})
                  </span>
                  <button
                    type="button"
                    className="v2-btn v2-btn-secondary v2-btn-sm"
                    onClick={() => {
                      setSelectedBus(null);
                      setSelectedSeats([]);
                    }}
                  >
                    Close
                  </button>
                </div>

                <div className="v2-grid-2">
                  <div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: "8px",
                        maxWidth: "340px",
                      }}
                    >
                      {(selectedBus.seatLayout?.seats || []).map((seat) => {
                        const isBooked = (selectedBus.bookedSeats || []).includes(seat.seatNumber);
                        const isSelected = selectedSeats.includes(seat.seatNumber);
                        return (
                          <button
                            key={seat.seatNumber}
                            type="button"
                            disabled={isBooked}
                            onClick={() => toggleSeat(seat.seatNumber)}
                            className="v2-btn v2-btn-sm"
                            style={{
                              background: isBooked
                                ? "#cbd5e1"
                                : isSelected
                                  ? "#2563eb"
                                  : "#f8fafc",
                              color: isBooked ? "#64748b" : isSelected ? "#ffffff" : "#0f172a",
                              border: "1px solid #94a3b8",
                            }}
                          >
                            {seat.seatNumber}
                            {seat.type === "sleeper" ? "🛏️" : ""}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                      Rows 1–2 include sleeper berth (+INR 150). Grey seats are already reserved.
                    </div>
                  </div>

                  <div>
                    <div className="v2-field">
                      <label>Boarding Point</label>
                      <select
                        className="v2-select"
                        value={boardingPoint}
                        onChange={(e) => setBoardingPoint(e.target.value)}
                      >
                        {(selectedBus.boardingPoints || []).map((bp) => (
                          <option key={bp.name} value={bp.name}>
                            {bp.name} ({bp.time})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="v2-field">
                      <label>Dropping Point</label>
                      <select
                        className="v2-select"
                        value={droppingPoint}
                        onChange={(e) => setDroppingPoint(e.target.value)}
                      >
                        {(selectedBus.droppingPoints || []).map((dp) => (
                          <option key={dp.name} value={dp.name}>
                            {dp.name} ({dp.time})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ marginBottom: "12px", fontWeight: 600 }}>
                      Selected Seats: {selectedSeats.length > 0 ? selectedSeats.join(", ") : "None"}
                    </div>
                    <button
                      type="button"
                      className="v2-btn v2-btn-accent"
                      onClick={handleBookBus}
                      disabled={selectedSeats.length === 0}
                    >
                      Confirm Bus Seat Booking
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="v2-grid-2">
              {buses.map((b) => (
                <div key={b._id} className="v2-card">
                  <div className="v2-card-title">
                    <span>
                      {b.originCity} → {b.destinationCity}
                    </span>
                    <span className="v2-chip v2-chip-yes">{b.availableSeatCount} seats left</span>
                  </div>
                  <div style={{ fontWeight: 600 }}>{b.operatorName}</div>
                  <div style={{ fontSize: "13px", color: "#475569", margin: "6px 0" }}>
                    {b.busType} · Departs {b.departureTime} · Arrives {b.arrivalTime} ({b.durationHours}h)
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>
                    From {b.currency} {b.farePerSeat} / seat
                  </div>
                  <button
                    type="button"
                    className="v2-btn v2-btn-primary v2-btn-sm"
                    onClick={() => {
                      setSelectedBus(b);
                      setSelectedSeats([]);
                      setBoardingPoint(b.boardingPoints?.[0]?.name || "");
                      setDroppingPoint(b.droppingPoints?.[0]?.name || "");
                    }}
                  >
                    Select Seats
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODULE 20: CAR RENTAL & LOCAL TRANSPORT */}
        {tab === "cars" && (
          <div>
            <div className="v2-card" style={{ marginBottom: "18px" }}>
              <div className="v2-grid-3">
                <div className="v2-field">
                  <label>City</label>
                  <input
                    className="v2-input"
                    placeholder="Siliguri, Goa, Kolkata, Jaipur, Guwahati..."
                    value={carQuery.city}
                    onChange={(e) => setCarQuery({ ...carQuery, city: e.target.value })}
                  />
                </div>
                <div className="v2-field">
                  <label>Service Type</label>
                  <select
                    className="v2-select"
                    value={carQuery.serviceType}
                    onChange={(e) => setCarQuery({ ...carQuery, serviceType: e.target.value })}
                  >
                    <option value="All">All Modes</option>
                    <option value="self-drive">Self-Drive Rental</option>
                    <option value="chauffeur-driven">Chauffeur-Driven</option>
                    <option value="airport-transfer">Airport Transfer</option>
                    <option value="local-cab">Local Cab</option>
                  </select>
                </div>
                <div className="v2-field">
                  <label>Vehicle Category</label>
                  <select
                    className="v2-select"
                    value={carQuery.vehicleCategory}
                    onChange={(e) => setCarQuery({ ...carQuery, vehicleCategory: e.target.value })}
                  >
                    <option value="All">All Categories</option>
                    <option value="Hatchback">Hatchback</option>
                    <option value="Sedan">Sedan</option>
                    <option value="SUV">SUV</option>
                    <option value="Tempo Traveller">Tempo Traveller</option>
                  </select>
                </div>
              </div>
            </div>

            {selectedCar && (
              <form
                onSubmit={handleBookCar}
                className="v2-card"
                style={{ marginBottom: "18px", borderColor: "#2563eb" }}
              >
                <div className="v2-card-title">
                  <span>Reserve {selectedCar.modelName} ({selectedCar.serviceType})</span>
                  <button
                    type="button"
                    className="v2-btn v2-btn-secondary v2-btn-sm"
                    onClick={() => setSelectedCar(null)}
                  >
                    Close
                  </button>
                </div>
                <div className="v2-grid-3">
                  <div className="v2-field">
                    <label>Pickup Date</label>
                    <input
                      type="date"
                      required
                      className="v2-input"
                      value={carBooking.travelDate}
                      onChange={(e) =>
                        setCarBooking({ ...carBooking, travelDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="v2-field">
                    <label>Pickup Location</label>
                    <input
                      required
                      className="v2-input"
                      placeholder="Airport Terminal / Hotel Address"
                      value={carBooking.pickupLocation}
                      onChange={(e) =>
                        setCarBooking({ ...carBooking, pickupLocation: e.target.value })
                      }
                    />
                  </div>
                  <div className="v2-field">
                    <label>Drop-off Location</label>
                    <input
                      className="v2-input"
                      placeholder="Destination hotel or station"
                      value={carBooking.dropoffLocation}
                      onChange={(e) =>
                        setCarBooking({ ...carBooking, dropoffLocation: e.target.value })
                      }
                    />
                  </div>
                  {(selectedCar.serviceType === "self-drive" ||
                    selectedCar.serviceType === "chauffeur-driven") && (
                    <div className="v2-field">
                      <label>Rental Duration (Days)</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        className="v2-input"
                        value={carBooking.rentalDays}
                        onChange={(e) =>
                          setCarBooking({ ...carBooking, rentalDays: Number(e.target.value) })
                        }
                      />
                    </div>
                  )}
                </div>
                <button type="submit" className="v2-btn v2-btn-accent">
                  Confirm Vehicle Reservation
                </button>
              </form>
            )}

            <div className="v2-grid-3">
              {cars.map((c) => (
                <div key={c._id} className="v2-rec-card">
                  <img src={c.image} alt={c.modelName} loading="lazy" />
                  <div className="v2-rec-card-body">
                    <div className="v2-chip-row">
                      <span className="v2-chip">{c.serviceType}</span>
                      <span className="v2-chip v2-chip-unknown">{c.vehicleCategory}</span>
                    </div>
                    <h3 style={{ fontSize: "16px", marginTop: "4px" }}>{c.modelName}</h3>
                    <div style={{ fontSize: "13px", color: "#475569" }}>
                      {c.city} · {c.seats} seats · {c.providerName}
                    </div>
                    {c.driverProfile?.name && (
                      <div style={{ fontSize: "12.5px", color: "#15803d" }}>
                        Driver: {c.driverProfile.name} ({c.driverProfile.experienceYears} yrs exp)
                      </div>
                    )}
                    <div style={{ fontWeight: 700, fontSize: "15px" }}>
                      {c.serviceType === "airport-transfer" || c.serviceType === "local-cab"
                        ? `${c.currency} ${c.pricePerTransfer} / transfer`
                        : `${c.currency} ${c.pricePerDay} / day`}
                    </div>
                    <button
                      type="button"
                      className="v2-btn v2-btn-primary v2-btn-sm"
                      onClick={() => setSelectedCar(c)}
                    >
                      Book Vehicle
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODULE 21: UNIFIED TRANSPORT TIMELINE */}
        {tab === "timeline" && (
          <div className="v2-card">
            <div className="v2-card-title">Unified Transport Timeline</div>
            {!user ? (
              <p>
                Please <Link to="/login">sign in</Link> to see your unified transport timeline.
              </p>
            ) : timeline.length === 0 ? (
              <p style={{ color: "#64748b" }}>
                No transport legs yet. Book a bus/cab or save a flight/train PNR to populate your
                timeline.
              </p>
            ) : (
              <table className="v2-table">
                <thead>
                  <tr>
                    <th>Date &amp; Mode</th>
                    <th>Route &amp; Provider</th>
                    <th>Reference</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((r) => (
                    <tr key={r._id}>
                      <td>
                        <strong>{r.travelDate}</strong>
                        <div>
                          <span className="v2-chip">{r.mode}</span>
                        </div>
                      </td>
                      <td>
                        <div>
                          {r.origin} → {r.destination}
                        </div>
                        <small style={{ color: "#64748b" }}>
                          {r.providerName}
                          {r.seatNumbers?.length ? ` · Seats: ${r.seatNumbers.join(", ")}` : ""}
                        </small>
                      </td>
                      <td>
                        <strong>{r.externalProviderReference || r.bookingReference}</strong>
                      </td>
                      <td>
                        {r.totalAmount > 0 ? `${r.currency} ${r.totalAmount}` : "External Ref"}
                      </td>
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
                        <div className="v2-chip-row">
                          {!r.isExternalReference &&
                            r.status === "CONFIRMED" &&
                            r.paymentStatus !== "PAID" && (
                              <button
                                type="button"
                                className="v2-btn v2-btn-primary v2-btn-sm"
                                onClick={() => handlePayTransport(r)}
                              >
                                Pay
                              </button>
                            )}
                          {r.status !== "CANCELLED" && (
                            <button
                              type="button"
                              className="v2-btn v2-btn-danger v2-btn-sm"
                              onClick={() => handleCancelTransport(r._id)}
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
