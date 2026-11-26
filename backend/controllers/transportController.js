const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sanitizeString } = require("../utils/sanitize");
const env = require("../config/env");
const { BOOKING_STATUS, PAYMENT_STATUS } = require("../constants/commerceStates");
const seed = require("../data/commerceSeedData");
const cStore = require("../services/commerceStoreService");
const { notifyUser } = require("../services/notificationService");

// ============================
// MODULE 17 — FLIGHT SEARCH (Honest Redirect / Provider-Check)
// ============================
const listAirports = asyncHandler(async (req, res) => {
  const q = sanitizeString(req.query.q || "", 60).toLowerCase();
  const data = seed.AIRPORTS_REFERENCE.filter(
    (a) =>
      !q ||
      a.code.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q),
  );
  res.status(200).json({ success: true, count: data.length, data });
});

const searchFlights = asyncHandler(async (req, res) => {
  const origin = sanitizeString(req.query.origin || "CCU", 10).toUpperCase();
  const destination = sanitizeString(req.query.destination || "IXB", 10).toUpperCase();
  const departureDate = sanitizeString(req.query.departureDate || "", 20);
  const returnDate = sanitizeString(req.query.returnDate || "", 20);
  const passengers = Math.max(1, Math.min(9, Number(req.query.passengers) || 1));
  const cabinClass = sanitizeString(req.query.cabinClass || "Economy", 30);
  const airlineFilter = sanitizeString(req.query.airline || "", 50);

  if (!origin || !destination || origin === destination) {
    throw new ApiError(400, "Distinct origin and destination airport codes are required.");
  }

  const originAirport = seed.AIRPORTS_REFERENCE.find((a) => a.code === origin) || {
    code: origin,
    city: origin,
    name: origin,
  };
  const destAirport = seed.AIRPORTS_REFERENCE.find((a) => a.code === destination) || {
    code: destination,
    city: destination,
    name: destination,
  };

  const providerConfigured = Boolean(process.env.FLIGHT_PROVIDER_API_KEY || env.FLIGHT_PROVIDER_API_KEY);
  const qDate = departureDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const googleQuery = encodeURIComponent(
    `Flights from ${origin} to ${destination} on ${qDate}${returnDate ? ` returning ${returnDate}` : ""} ${cabinClass}${airlineFilter ? ` ${airlineFilter}` : ""}`,
  );
  const skyscannerPath = `${origin.toLowerCase()}/${destination.toLowerCase()}/${qDate.replace(/-/g, "").slice(2)}`;

  const externalComparisonPortals = [
    {
      provider: "Google Flights",
      type: "Live Fare Comparison",
      url: `https://www.google.com/travel/flights?q=${googleQuery}`,
      note: "Compare live schedules and fares across airlines directly on Google Flights.",
    },
    {
      provider: "Skyscanner",
      type: "Live Fare Comparison",
      url: `https://www.skyscanner.co.in/transport/flights/${skyscannerPath}/?adults=${passengers}&cabinclass=${encodeURIComponent(cabinClass.toLowerCase())}`,
      note: "Check live carrier availability and flexible date calendars.",
    },
    {
      provider: "IndiGo Official",
      type: "Airline Direct",
      url: "https://www.goindigo.in/",
      note: "Book domestic & regional flights directly with IndiGo.",
    },
    {
      provider: "Air India Official",
      type: "Airline Direct",
      url: "https://www.airindia.com/",
      note: "Book domestic & international flights directly with Air India.",
    },
  ].filter((p) => !airlineFilter || p.type === "Live Fare Comparison" || p.provider.toLowerCase().includes(airlineFilter.toLowerCase()));

  res.status(200).json({
    success: true,
    providerConfigured,
    liveFaresAvailable: false,
    disclosure:
      "No live GDS/airline ticketing API key is configured on this server. Travelogia does not fabricate flight inventory, fares, or tickets. Use the official search & airline redirect links below to view live fares and save your confirmed PNR to your Travelogia trip timeline.",
    query: {
      origin: originAirport,
      destination: destAirport,
      departureDate: qDate,
      returnDate: returnDate || null,
      passengers,
      cabinClass,
      airlineFilter: airlineFilter || "All",
    },
    flights: [],
    externalComparisonPortals,
  });
});

// POST /api/transport/flights/save-reference — Save externally booked flight PNR into Unified Timeline + Wallet
const saveExternalFlightReference = asyncHandler(async (req, res) => {
  const pnr = sanitizeString(req.body?.pnr || req.body?.providerReference || "", 40).toUpperCase();
  const airline = sanitizeString(req.body?.airline || "", 80);
  const flightNumber = sanitizeString(req.body?.flightNumber || "", 20).toUpperCase();
  const origin = sanitizeString(req.body?.origin || "", 60).toUpperCase();
  const destination = sanitizeString(req.body?.destination || "", 60).toUpperCase();
  const travelDate = sanitizeString(req.body?.travelDate || "", 20);
  const departureTime = sanitizeString(req.body?.departureTime || "", 20);
  const tripId = sanitizeString(req.body?.tripId || "", 80);

  if (!pnr || !origin || !destination || !travelDate) {
    throw new ApiError(400, "PNR/reference, origin, destination, and travelDate are required.");
  }

  const record = await cStore.createTransportReservation({
    user: req.user.id,
    tripId,
    mode: "FLIGHT_REF",
    providerName: `${airline || "Airline"} ${flightNumber}`.trim(),
    origin,
    destination,
    travelDate,
    departureTime,
    externalProviderReference: pnr,
    totalAmount: 0,
    currency: "INR",
    status: BOOKING_STATUS.CONFIRMED,
    paymentStatus: PAYMENT_STATUS.PAID,
    isExternalReference: true,
  });

  await cStore.createWalletDocument({
    user: req.user.id,
    tripId,
    category: "FLIGHT_REF",
    title: `Flight ${flightNumber || ""} ${origin} → ${destination}`.trim(),
    referenceCode: pnr,
    referenceOrigin: "provider-issued",
    providerName: airline || "External Airline",
    eventDate: travelDate,
    notes: "User-saved external airline booking reference. Use your airline's official boarding pass at airport security.",
  });

  res.status(201).json({
    success: true,
    message: "External flight reference linked to your Unified Transport Timeline and Travel Wallet.",
    data: record,
  });
});

// ============================
// MODULE 18 — TRAIN JOURNEY PLANNER (Reference schedules + Official IRCTC Links)
// ============================
const listRailStations = asyncHandler(async (req, res) => {
  const q = sanitizeString(req.query.q || "", 60).toLowerCase();
  const data = seed.RAIL_STATIONS_REFERENCE.filter(
    (s) =>
      !q ||
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q),
  );
  res.status(200).json({ success: true, count: data.length, data });
});

const searchTrains = asyncHandler(async (req, res) => {
  const from = sanitizeString(req.query.from || "", 20).toUpperCase();
  const to = sanitizeString(req.query.to || "", 20).toUpperCase();
  const journeyDate = sanitizeString(req.query.journeyDate || "", 20);
  const q = sanitizeString(req.query.q || "", 60).toLowerCase();

  const matches = seed.TRAINS_REFERENCE.filter((t) => {
    if (from && t.fromCode !== from) {
      const st = seed.RAIL_STATIONS_REFERENCE.find((s) => s.code === t.fromCode);
      if (!st || !st.city.toLowerCase().includes(from.toLowerCase())) return false;
    }
    if (to && t.toCode !== to) {
      const st = seed.RAIL_STATIONS_REFERENCE.find((s) => s.code === t.toCode);
      if (!st || !st.city.toLowerCase().includes(to.toLowerCase())) return false;
    }
    if (q) {
      const hay = `${t.trainNumber} ${t.trainName} ${t.fromCode} ${t.toCode}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  res.status(200).json({
    success: true,
    liveSeatAvailability: false,
    disclosure:
      "Schedules shown are public reference timetables only. Travelogia does not fabricate live IRCTC seat availability or issue railway tickets. Check live seats and book exclusively on official IRCTC / NTES portals.",
    journeyDate: journeyDate || null,
    officialPortals: {
      irctcBooking: "https://www.irctc.co.in/nget/train-search",
      ntesLiveRunning: "https://enquiry.indianrail.gov.in/mntes/",
      pnrEnquiry: "https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html",
    },
    count: matches.length,
    data: matches,
  });
});

// POST /api/transport/trains/save-reference
const saveExternalTrainReference = asyncHandler(async (req, res) => {
  const pnr = sanitizeString(req.body?.pnr || "", 20);
  const trainNumber = sanitizeString(req.body?.trainNumber || "", 15);
  const trainName = sanitizeString(req.body?.trainName || "", 100);
  const origin = sanitizeString(req.body?.origin || "", 60);
  const destination = sanitizeString(req.body?.destination || "", 60);
  const travelDate = sanitizeString(req.body?.travelDate || "", 20);
  const departureTime = sanitizeString(req.body?.departureTime || "", 20);
  const travelClass = sanitizeString(req.body?.travelClass || "3A", 10);
  const tripId = sanitizeString(req.body?.tripId || "", 80);

  if (!pnr || !origin || !destination || !travelDate) {
    throw new ApiError(400, "IRCTC PNR, origin, destination, and travelDate are required.");
  }

  const record = await cStore.createTransportReservation({
    user: req.user.id,
    tripId,
    mode: "TRAIN_REF",
    providerName: `${trainNumber} ${trainName} (${travelClass})`.trim(),
    origin,
    destination,
    travelDate,
    departureTime,
    externalProviderReference: pnr,
    totalAmount: 0,
    currency: "INR",
    status: BOOKING_STATUS.CONFIRMED,
    paymentStatus: PAYMENT_STATUS.PAID,
    isExternalReference: true,
  });

  await cStore.createWalletDocument({
    user: req.user.id,
    tripId,
    category: "TRAIN_REF",
    title: `Train ${trainNumber || ""} ${origin} → ${destination}`.trim(),
    referenceCode: pnr,
    referenceOrigin: "provider-issued",
    providerName: "Indian Railways / IRCTC",
    eventDate: travelDate,
    notes: `Class ${travelClass}. Carry official IRCTC e-ticket SMS/PDF and government ID during travel.`,
  });

  res.status(201).json({
    success: true,
    message: "External IRCTC train reference saved to your Unified Transport Timeline and Wallet.",
    data: record,
  });
});

// ============================
// MODULE 19 — BUS BOOKING SYSTEM (Demo Inventory + Seat Double-Booking Guard)
// ============================
const searchBuses = asyncHandler(async (req, res) => {
  const origin = sanitizeString(req.query.origin || "", 60).toLowerCase();
  const destination = sanitizeString(req.query.destination || "", 60).toLowerCase();
  const travelDate =
    sanitizeString(req.query.travelDate || "", 20) ||
    new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

  const routes = await cStore.listBusRoutes();
  const filtered = routes.filter((r) => {
    if (origin && !r.originCity.toLowerCase().includes(origin)) return false;
    if (destination && !r.destinationCity.toLowerCase().includes(destination)) return false;
    return true;
  });

  const enriched = [];
  for (const r of filtered) {
    const bookedSeats = await cStore.getBookedBusSeats(r._id, travelDate);
    enriched.push({
      ...r,
      travelDate,
      bookedSeats,
      availableSeatCount: Math.max(0, (r.seatLayout?.seats?.length || 0) - bookedSeats.length),
    });
  }

  res.status(200).json({
    success: true,
    isDemoInventory: true,
    disclosure:
      "Bus routes shown belong to Travelogia's clearly labelled demo operators with real seat-lock double-booking prevention.",
    count: enriched.length,
    data: enriched,
  });
});

const bookBusSeats = asyncHandler(async (req, res) => {
  const routeId = sanitizeString(req.body?.routeId || "", 80);
  const travelDate = sanitizeString(req.body?.travelDate || "", 20);
  const boardingPoint = sanitizeString(req.body?.boardingPoint || "", 120);
  const droppingPoint = sanitizeString(req.body?.droppingPoint || "", 120);
  const tripId = sanitizeString(req.body?.tripId || "", 80);
  const rawSeats = Array.isArray(req.body?.seatNumbers) ? req.body.seatNumbers : [];
  const seatNumbers = [...new Set(rawSeats.map((s) => sanitizeString(s, 10).toUpperCase()).filter(Boolean))];

  if (!routeId || !travelDate || seatNumbers.length === 0) {
    throw new ApiError(400, "routeId, travelDate, and at least one seatNumber are required.");
  }
  if (seatNumbers.length > 6) {
    throw new ApiError(400, "You can book up to 6 seats per reservation.");
  }

  const route = await cStore.findBusRouteById(routeId);
  if (!route) throw new ApiError(404, "Bus route not found.");

  const layoutSeats = route.seatLayout?.seats || [];
  const seatMap = new Map(layoutSeats.map((s) => [s.seatNumber.toUpperCase(), s]));
  for (const s of seatNumbers) {
    if (!seatMap.has(s)) {
      throw new ApiError(400, `Seat ${s} does not exist on this coach layout.`);
    }
  }

  // Prevent double-booking of seats
  const alreadyBooked = new Set(
    (await cStore.getBookedBusSeats(route._id, travelDate)).map((s) => s.toUpperCase()),
  );
  const conflicts = seatNumbers.filter((s) => alreadyBooked.has(s));
  if (conflicts.length > 0) {
    throw new ApiError(
      409,
      `Seat(s) ${conflicts.join(", ")} are already booked for ${travelDate}. Please select available seats.`,
    );
  }

  // Server-calculated fare (base fare + per-seat sleeper modifier)
  const totalAmount = seatNumbers.reduce((sum, s) => {
    const spec = seatMap.get(s);
    return sum + Number(route.farePerSeat) + Number(spec?.priceModifier || 0);
  }, 0);

  const reservation = await cStore.createTransportReservation({
    user: req.user.id,
    tripId,
    mode: "BUS",
    providerName: route.operatorName,
    routeOrVehicleId: route._id,
    origin: route.originCity,
    destination: route.destinationCity,
    travelDate,
    departureTime: route.departureTime,
    boardingPoint: boardingPoint || route.boardingPoints?.[0]?.name || "",
    droppingPoint: droppingPoint || route.droppingPoints?.[0]?.name || "",
    seatNumbers,
    totalAmount,
    currency: route.currency || "INR",
    status: BOOKING_STATUS.CONFIRMED,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    isExternalReference: false,
  });

  await cStore.createWalletDocument({
    user: req.user.id,
    tripId,
    category: "BUS_TICKET",
    title: `${route.originCity} → ${route.destinationCity} (${route.operatorName})`,
    referenceCode: reservation.bookingReference,
    referenceOrigin: "internal-booking",
    providerName: route.operatorName,
    eventDate: travelDate,
    notes: `Seats: ${seatNumbers.join(", ")} · Boarding: ${reservation.boardingPoint} at ${route.departureTime} (Demo Operator Ticket)`,
  });

  await notifyUser({
    userId: req.user.id,
    type: "booking-confirmation",
    title: `Bus Seats Confirmed: ${route.originCity} → ${route.destinationCity}`,
    message: `Seats ${seatNumbers.join(", ")} booked (${reservation.bookingReference}) for ${travelDate}. Total: INR ${totalAmount}.`,
    relatedId: reservation._id,
  });

  res.status(201).json({
    success: true,
    message: "Bus seat reservation confirmed.",
    data: reservation,
  });
});

// ============================
// MODULE 20 — CAR RENTAL & LOCAL TRANSPORT
// ============================
const searchCars = asyncHandler(async (req, res) => {
  const city = sanitizeString(req.query.city || "", 60).toLowerCase();
  const serviceType = sanitizeString(req.query.serviceType || "", 40);
  const vehicleCategory = sanitizeString(req.query.vehicleCategory || "", 40);

  const vehicles = await cStore.listCarVehicles();
  const data = vehicles.filter((v) => {
    if (city && !v.city.toLowerCase().includes(city)) return false;
    if (serviceType && serviceType !== "All" && v.serviceType !== serviceType) return false;
    if (vehicleCategory && vehicleCategory !== "All" && v.vehicleCategory !== vehicleCategory) return false;
    return true;
  });

  res.status(200).json({
    success: true,
    isDemoInventory: true,
    count: data.length,
    data,
  });
});

const bookCarTransport = asyncHandler(async (req, res) => {
  const vehicleId = sanitizeString(req.body?.vehicleId || "", 80);
  const travelDate = sanitizeString(req.body?.travelDate || "", 20);
  const pickupLocation = sanitizeString(req.body?.pickupLocation || "", 150);
  const dropoffLocation = sanitizeString(req.body?.dropoffLocation || "", 150);
  const departureTime = sanitizeString(req.body?.departureTime || "09:00", 20);
  const rentalDays = Math.max(1, Math.min(30, Number(req.body?.rentalDays) || 1));
  const tripId = sanitizeString(req.body?.tripId || "", 80);

  if (!vehicleId || !travelDate || !pickupLocation) {
    throw new ApiError(400, "vehicleId, travelDate, and pickupLocation are required.");
  }

  const vehicle = await cStore.findCarVehicleById(vehicleId);
  if (!vehicle) throw new ApiError(404, "Vehicle not found.");

  // Server-calculated pricing (transfer vs multi-day rental)
  const isTransfer =
    vehicle.serviceType === "airport-transfer" || vehicle.serviceType === "local-cab";
  const totalAmount = isTransfer
    ? Number(vehicle.pricePerTransfer)
    : Number(vehicle.pricePerDay) * rentalDays;

  const reservation = await cStore.createTransportReservation({
    user: req.user.id,
    tripId,
    mode: "CAR_RENTAL",
    providerName: `${vehicle.providerName} — ${vehicle.modelName}`,
    routeOrVehicleId: vehicle._id,
    origin: vehicle.city,
    destination: dropoffLocation || vehicle.city,
    travelDate,
    departureTime,
    pickupLocation,
    dropoffLocation: dropoffLocation || pickupLocation,
    rentalDays: isTransfer ? 1 : rentalDays,
    driverAssigned:
      vehicle.serviceType === "self-drive"
        ? "Self-Drive (No Driver)"
        : `${vehicle.driverProfile?.name || "Verified Chauffeur"} (${vehicle.driverProfile?.experienceYears || 5} yrs exp)`,
    totalAmount,
    currency: vehicle.currency || "INR",
    status: BOOKING_STATUS.CONFIRMED,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    isExternalReference: false,
  });

  await notifyUser({
    userId: req.user.id,
    type: "booking-confirmation",
    title: `Transport Booked: ${vehicle.modelName}`,
    message: `${vehicle.serviceType} reservation ${reservation.bookingReference} on ${travelDate} (${vehicle.currency} ${totalAmount}).`,
    relatedId: reservation._id,
  });

  res.status(201).json({
    success: true,
    message: "Car rental / local transport reservation confirmed.",
    data: reservation,
  });
});

// ============================
// MODULE 21 — UNIFIED TRANSPORT TIMELINE
// ============================
const listMyTransportTimeline = asyncHandler(async (req, res) => {
  const tripId = sanitizeString(req.query.tripId || "", 80);
  const all = await cStore.listUserTransportReservations(req.user.id);
  const data = tripId ? all.filter((r) => String(r.tripId) === tripId) : all;
  res.status(200).json({ success: true, count: data.length, data });
});

const cancelTransportReservation = asyncHandler(async (req, res) => {
  const record = await cStore.findTransportReservationById(req.params.id);
  if (!record) throw new ApiError(404, "Transport reservation not found.");
  if (req.user.role !== "admin" && String(record.user) !== String(req.user.id)) {
    throw new ApiError(403, "You can only cancel your own transport reservations.");
  }
  if (record.status === BOOKING_STATUS.CANCELLED) {
    throw new ApiError(409, "Reservation is already cancelled.");
  }

  const updated = await cStore.updateTransportReservation(record._id, {
    status: BOOKING_STATUS.CANCELLED,
    cancelledAt: new Date().toISOString(),
  });

  await notifyUser({
    userId: record.user,
    type: "cancellation-update",
    title: `Transport Cancelled: ${record.bookingReference}`,
    message: `${record.mode} reservation (${record.origin} → ${record.destination}) was cancelled.`,
    relatedId: record._id,
  });

  res.status(200).json({
    success: true,
    message: "Transport reservation cancelled.",
    data: updated,
  });
});

module.exports = {
  listAirports,
  searchFlights,
  saveExternalFlightReference,
  listRailStations,
  searchTrains,
  saveExternalTrainReference,
  searchBuses,
  bookBusSeats,
  searchCars,
  bookCarTransport,
  listMyTransportTimeline,
  cancelTransportReservation,
};
