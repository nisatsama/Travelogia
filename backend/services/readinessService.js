const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const store = require("./storeService");

const WMO_WEATHER_LABELS = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  80: "Rain showers",
  81: "Moderate rain showers",
  82: "Heavy rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm with hail",
};

async function fetchOpenMeteoWeather(latitude, longitude) {
  // Never make outbound live HTTP calls during unit tests unless explicitly mocked
  if (env.isTest && !globalThis.__TRAVELOGIA_ALLOW_LIVE_WEATHER_IN_TEST__) {
    return {
      available: false,
      source: "Open-Meteo (skipped in test mode)",
      verificationLevel: "fallback",
      fetchedAt: new Date().toISOString(),
      note: "Live weather fetch is disabled in test mode; check local meteorological advisories before travel.",
    };
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP ${response.status}`);
    }
    const data = await response.json();
    const cw = data.current_weather;
    if (!cw) {
      throw new Error("Missing current_weather payload");
    }

    const precipMax = Array.isArray(data?.daily?.precipitation_probability_max)
      ? data.daily.precipitation_probability_max[0]
      : null;

    return {
      available: true,
      source: "Open-Meteo Live Forecast API",
      verificationLevel: "live-external",
      fetchedAt: new Date().toISOString(),
      temperatureC: cw.temperature,
      windspeedKmh: cw.windspeed,
      weatherCode: cw.weathercode,
      condition: WMO_WEATHER_LABELS[cw.weathercode] || "Variable conditions",
      precipProbabilityPct: typeof precipMax === "number" ? precipMax : null,
      dailyForecast: (data?.daily?.time || []).slice(0, 3).map((date, idx) => ({
        date,
        maxTempC: data.daily.temperature_2m_max?.[idx] ?? null,
        minTempC: data.daily.temperature_2m_min?.[idx] ?? null,
        precipProbabilityPct: data.daily.precipitation_probability_max?.[idx] ?? null,
      })),
    };
  } catch {
    return {
      available: false,
      source: "Open-Meteo (temporarily unavailable)",
      verificationLevel: "fallback",
      fetchedAt: new Date().toISOString(),
      note: "Live weather could not be retrieved right now. Verify current weather advisories before departure.",
    };
  }
}

async function getTravelReadinessReport(travelId) {
  const travel = await store.findTravelById(travelId);
  if (!travel) {
    throw new ApiError(404, "Destination not found.");
  }

  const coords = travel.coordinates || {};
  const weather =
    Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)
      ? await fetchOpenMeteoWeather(coords.latitude, coords.longitude)
      : {
          available: false,
          source: "Coordinates unavailable",
          verificationLevel: "fallback",
          fetchedAt: new Date().toISOString(),
          note: "Map coordinates are not recorded for this destination.",
        };

  const info = travel.readinessInfo || {};
  const accessibility = travel.accessibility || {};

  // Transparent, rule-based Travel Readiness Score (0–100)
  const factors = [];
  let score = 78; // Neutral baseline

  if (weather.available) {
    const severeCodes = new Set([65, 75, 82, 95, 96, 99]);
    if (severeCodes.has(weather.weatherCode) || (weather.precipProbabilityPct ?? 0) >= 75) {
      score -= 18;
      factors.push({
        label: "Live Weather Conditions",
        impact: -18,
        status: "caution",
        detail: `${weather.condition} (${weather.temperatureC}°C) — check local weather alerts.`,
        verificationLevel: "live-external",
      });
    } else if (weather.windspeedKmh > 35 || (weather.precipProbabilityPct ?? 0) >= 45) {
      score -= 7;
      factors.push({
        label: "Live Weather Conditions",
        impact: -7,
        status: "moderate",
        detail: `${weather.condition}, ${weather.temperatureC}°C, wind ${weather.windspeedKmh} km/h.`,
        verificationLevel: "live-external",
      });
    } else {
      score += 10;
      factors.push({
        label: "Live Weather Conditions",
        impact: +10,
        status: "good",
        detail: `${weather.condition}, ${weather.temperatureC}°C — favorable current conditions.`,
        verificationLevel: "live-external",
      });
    }
  } else {
    factors.push({
      label: "Live Weather Conditions",
      impact: 0,
      status: "unknown",
      detail: "Live weather unavailable; neutral score applied. Verify locally before departure.",
      verificationLevel: "fallback",
    });
  }

  if (info.permitRequired) {
    score -= 8;
    factors.push({
      label: "Permits & Documentation",
      impact: -8,
      status: "action-required",
      detail: info.permitDetails || "Advance regional permit required before travel.",
      verificationLevel: "curated-estimate",
    });
  } else {
    score += 5;
    factors.push({
      label: "Permits & Documentation",
      impact: +5,
      status: "good",
      detail: info.permitDetails || "Standard national ID / passport requirements apply.",
      verificationLevel: "curated-estimate",
    });
  }

  const roadLower = String(info.roadAccessibility || "").toLowerCase();
  if (roadLower.includes("4x4") || roadLower.includes("trek") || roadLower.includes("steep") || roadLower.includes("ferry")) {
    score -= 9;
    factors.push({
      label: "Road & Transit Access",
      impact: -9,
      status: "caution",
      detail: info.roadAccessibility,
      verificationLevel: "curated-estimate",
    });
  } else {
    score += 5;
    factors.push({
      label: "Road & Transit Access",
      impact: +5,
      status: "good",
      detail: info.roadAccessibility || "Standard paved road / regional transit access.",
      verificationLevel: "curated-estimate",
    });
  }

  if (accessibility.walkingIntensity === "high") {
    score -= 4;
    factors.push({
      label: "Terrain & Physical Intensity",
      impact: -4,
      status: "moderate",
      detail: "High walking/terrain intensity — pack proper footwear and pace acclimatization.",
      verificationLevel: "curated-estimate",
    });
  } else {
    score += 2;
    factors.push({
      label: "Terrain & Physical Intensity",
      impact: +2,
      status: "good",
      detail: `Walking intensity: ${accessibility.walkingIntensity || "unknown"}.`,
      verificationLevel: "curated-estimate",
    });
  }

  score = Math.max(25, Math.min(98, Math.round(score)));
  const readinessBand =
    score >= 80 ? "High Readiness" : score >= 60 ? "Moderate — Plan Ahead" : "Elevated Preparation Needed";

  const checklist = Array.isArray(info.preparationChecklist) && info.preparationChecklist.length > 0
    ? info.preparationChecklist
    : [
        "Carry government-issued photo ID / passport and digital backups",
        "Verify weather and road advisories 24 hours before departure",
        "Save local emergency contact numbers offline",
      ];

  return {
    travelId: travel._id,
    destinationTitle: travel.title,
    city: travel.city,
    country: travel.country,
    readinessScore: score,
    readinessBand,
    scoreExplanation:
      "Transparent rule-based readiness index (0–100) combining live Open-Meteo weather (when available) with curated Travelogia permit, road-access, and terrain advisories.",
    factors,
    weather,
    advisories: {
      permitRequired: Boolean(info.permitRequired),
      permitDetails: info.permitDetails || "Standard entry rules apply; verify official government portal before travel.",
      roadAccessibility: info.roadAccessibility || "Standard regional road and public transit connectivity.",
      emergencyNumber: info.emergencyNumber || "Local emergency services (112 / 911)",
      seasonalAdvisory: info.seasonalAdvisory || `Best visiting window: ${travel.bestTimeToVisit || "Year-round"}.`,
      bestTimeToVisit: travel.bestTimeToVisit || "Year-round",
      preparationChecklist: checklist,
      source: "Travelogia Curated Readiness Baseline",
      verificationLevel: "curated-estimate",
      lastUpdated: info.lastUpdated || new Date().toISOString().slice(0, 10),
    },
    disclaimer:
      "Travelogia readiness guidance combines live Open-Meteo weather with curated estimates. Always verify official government permits, road closures, and emergency advisories prior to departure.",
  };
}

module.exports = {
  getTravelReadinessReport,
  fetchOpenMeteoWeather,
};
