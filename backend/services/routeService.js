const ApiError = require("../utils/ApiError");
const store = require("./storeService");

// Common Indian & international starting hubs so users can type a city name cleanly
const STARTING_CITY_COORDS = {
  kolkata: { name: "Kolkata", latitude: 22.5726, longitude: 88.3639 },
  delhi: { name: "New Delhi", latitude: 28.6139, longitude: 77.209 },
  "new delhi": { name: "New Delhi", latitude: 28.6139, longitude: 77.209 },
  mumbai: { name: "Mumbai", latitude: 19.076, longitude: 72.8777 },
  bengaluru: { name: "Bengaluru", latitude: 12.9716, longitude: 77.5946 },
  bangalore: { name: "Bengaluru", latitude: 12.9716, longitude: 77.5946 },
  chennai: { name: "Chennai", latitude: 13.0827, longitude: 80.2707 },
  hyderabad: { name: "Hyderabad", latitude: 17.385, longitude: 78.4867 },
  guwahati: { name: "Guwahati", latitude: 26.1445, longitude: 91.7362 },
  siliguri: { name: "Siliguri / NJP", latitude: 26.7271, longitude: 88.3953 },
  pune: { name: "Pune", latitude: 18.5204, longitude: 73.8567 },
  jaipur: { name: "Jaipur", latitude: 26.9124, longitude: 75.7873 },
  london: { name: "London", latitude: 51.5072, longitude: -0.1276 },
  paris: { name: "Paris", latitude: 48.8566, longitude: 2.3522 },
  tokyo: { name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
  singapore: { name: "Singapore", latitude: 1.3521, longitude: 103.8198 },
  dubai: { name: "Dubai", latitude: 25.2048, longitude: 55.2708 },
  "new york": { name: "New York", latitude: 40.7128, longitude: -74.006 },
};

function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLon * sinDLon;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}

function resolveStartPoint(startCity, allTravels) {
  if (!startCity) return null;
  const key = String(startCity).trim().toLowerCase();
  if (STARTING_CITY_COORDS[key]) {
    return {
      id: `hub-${key}`,
      title: STARTING_CITY_COORDS[key].name,
      city: STARTING_CITY_COORDS[key].name,
      coordinates: {
        latitude: STARTING_CITY_COORDS[key].latitude,
        longitude: STARTING_CITY_COORDS[key].longitude,
      },
      isStartHub: true,
    };
  }
  const match = allTravels.find(
    (t) =>
      (t.city || "").toLowerCase() === key ||
      (t.title || "").toLowerCase().includes(key),
  );
  if (match && match.coordinates) {
    return {
      id: match._id,
      title: match.title,
      city: match.city,
      coordinates: match.coordinates,
      isStartHub: true,
    };
  }
  return null;
}

// Nearest-neighbour heuristic followed by 2-opt edge-swap refinement
function optimizeStopOrder(startNode, stops, returnToStart = false) {
  if (stops.length <= 1) return stops;

  const remaining = [...stops];
  const ordered = [];
  let current = startNode || remaining.shift();
  if (!startNode) ordered.push(current);

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const dist = haversineKm(current.coordinates, remaining[i].coordinates);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0];
    ordered.push(current);
  }

  // 2-opt refinement on the ordered stops
  const calcRouteDist = (seq) => {
    const chain = startNode ? [startNode, ...seq] : [...seq];
    if (returnToStart && startNode) chain.push(startNode);
    let total = 0;
    for (let i = 0; i < chain.length - 1; i += 1) {
      total += haversineKm(chain[i].coordinates, chain[i + 1].coordinates);
    }
    return total;
  };

  let improved = true;
  let best = [...ordered];
  let bestDistance = calcRouteDist(best);
  let passes = 0;

  while (improved && passes < 20) {
    improved = false;
    passes += 1;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let k = i + 1; k < best.length; k += 1) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const candidateDist = calcRouteDist(candidate);
        if (candidateDist + 0.1 < bestDistance) {
          best = candidate;
          bestDistance = candidateDist;
          improved = true;
        }
      }
    }
  }

  return best;
}

function buildRouteLegs(chain) {
  const legs = [];
  let totalStraightLineKm = 0;
  let totalEstimatedRoadKm = 0;
  let totalEstimatedHours = 0;

  for (let i = 0; i < chain.length - 1; i += 1) {
    const from = chain[i];
    const to = chain[i + 1];
    const straightLineKm = haversineKm(from.coordinates, to.coordinates);
    // Conservative road detour factor (1.28x for plains/highways, 1.45x for Himalayan terrain)
    const isMountainLeg =
      (from.category === "Mountain" || to.category === "Mountain" || straightLineKm < 120) &&
      (from.coordinates.latitude > 25 && from.coordinates.longitude > 86 && from.coordinates.longitude < 96);
    const roadFactor = straightLineKm > 1200 ? 1.0 : isMountainLeg ? 1.45 : 1.28;
    const estimatedRoadKm = Math.round(straightLineKm * roadFactor * 10) / 10;

    // Estimated transit mode & duration (explicitly approximate; never claims real schedules)
    const mode = straightLineKm > 900 ? "Flight recommended (approx.)" : isMountainLeg ? "Hill road transfer (approx.)" : "Road / rail (approx.)";
    const avgSpeedKmh = straightLineKm > 900 ? 700 : isMountainLeg ? 32 : 55;
    const estimatedHours = Math.round((estimatedRoadKm / avgSpeedKmh) * 10) / 10;

    totalStraightLineKm += straightLineKm;
    totalEstimatedRoadKm += estimatedRoadKm;
    totalEstimatedHours += estimatedHours;

    legs.push({
      fromTitle: from.title,
      fromCity: from.city,
      toTitle: to.title,
      toCity: to.city,
      straightLineKm,
      estimatedRoadKm,
      distanceNote:
        straightLineKm > 900
          ? "Great-circle air distance estimate"
          : "Approximate road estimate derived from straight-line distance",
      suggestedMode: mode,
      estimatedTravelHours: estimatedHours,
      osmDirectionsUrl: `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.coordinates.latitude},${from.coordinates.longitude};${to.coordinates.latitude},${to.coordinates.longitude}`,
      googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${from.coordinates.latitude},${from.coordinates.longitude}&destination=${to.coordinates.latitude},${to.coordinates.longitude}`,
    });
  }

  return {
    legs,
    totalStraightLineKm: Math.round(totalStraightLineKm * 10) / 10,
    totalEstimatedRoadKm: Math.round(totalEstimatedRoadKm * 10) / 10,
    totalEstimatedHours: Math.round(totalEstimatedHours * 10) / 10,
  };
}

async function planMultiDestinationRoute({
  startCity = "",
  destinationIds = [],
  returnToStart = true,
  optimize = true,
  travelers = 1,
}) {
  if (!Array.isArray(destinationIds) || destinationIds.length < 2) {
    throw new ApiError(400, "Select at least 2 destinations to build a multi-destination route.");
  }
  if (destinationIds.length > 12) {
    throw new ApiError(400, "You can optimize up to 12 stops in a single route.");
  }

  const allTravels = await store.listAllActiveTravels();
  const stops = destinationIds
    .map((id) => allTravels.find((t) => t._id === id))
    .filter((t) => t && t.coordinates && Number.isFinite(t.coordinates.latitude));

  if (stops.length < 2) {
    throw new ApiError(400, "At least 2 valid destinations with map coordinates are required.");
  }

  const startNode = resolveStartPoint(startCity, allTravels);
  const orderedStops = optimize
    ? optimizeStopOrder(startNode, stops, returnToStart)
    : stops;

  const fullChain = startNode
    ? returnToStart
      ? [startNode, ...orderedStops, { ...startNode, isReturnLeg: true }]
      : [startNode, ...orderedStops]
    : orderedStops;

  const originalChain = startNode
    ? returnToStart
      ? [startNode, ...stops, { ...startNode, isReturnLeg: true }]
      : [startNode, ...stops]
    : stops;

  const optimizedMetrics = buildRouteLegs(fullChain);
  const originalMetrics = buildRouteLegs(originalChain);

  const kmSaved = Math.max(
    0,
    Math.round((originalMetrics.totalStraightLineKm - optimizedMetrics.totalStraightLineKm) * 10) / 10,
  );

  // Approximate travel transfer cost estimate ($0.11/km road or air proxy)
  const approxTransportCostUSD = Math.round(
    optimizedMetrics.totalEstimatedRoadKm * 0.11 * Math.max(1, Number(travelers) || 1),
  );
  const approxLodgingPerStopUSD = orderedStops.reduce(
    (sum, s) => sum + Number(s.pricePerNight || 60) * 2,
    0,
  );

  return {
    algorithm: optimize ? "Nearest-Neighbour + 2-Opt TSP Heuristic" : "Custom User Order",
    startHub: startNode,
    returnToStart: Boolean(startNode && returnToStart),
    orderedStops: orderedStops.map((s, idx) => ({
      order: idx + 1,
      _id: s._id,
      title: s.title,
      city: s.city,
      state: s.state,
      country: s.country,
      category: s.category,
      pricePerNight: s.pricePerNight,
      coordinates: s.coordinates,
    })),
    polyline: fullChain.map((n) => [n.coordinates.latitude, n.coordinates.longitude]),
    legs: optimizedMetrics.legs,
    summary: {
      stopCount: orderedStops.length,
      totalStraightLineKm: optimizedMetrics.totalStraightLineKm,
      totalEstimatedRoadKm: optimizedMetrics.totalEstimatedRoadKm,
      totalEstimatedHours: optimizedMetrics.totalEstimatedHours,
      straightLineKmSavedVsInput: kmSaved,
      estimatedTransferCostUSD: approxTransportCostUSD,
      estimatedTwoNightStayPerStopUSD: approxLodgingPerStopUSD,
      disclaimer:
        "Straight-line distances use Haversine geometry. Road distances, travel durations, and costs are approximations — verify live routes and transport timetables via OpenStreetMap or Google Maps links.",
    },
  };
}

module.exports = {
  STARTING_CITY_COORDS,
  haversineKm,
  resolveStartPoint,
  optimizeStopOrder,
  planMultiDestinationRoute,
};
