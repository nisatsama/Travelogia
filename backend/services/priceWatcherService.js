const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const store = require("./storeService");
const v2Store = require("./v2StoreService");

let schedulerHandle = null;

async function getDestinationPriceHistory(travelId) {
  const travel = await store.findTravelById(travelId);
  if (!travel) {
    throw new ApiError(404, "Destination not found.");
  }

  const observations = await v2Store.listPriceObservations(travelId);
  const prices = observations.map((o) => Number(o.estimatedPricePerNight)).filter(Number.isFinite);

  const currentEstimatedPrice = prices.length ? prices[prices.length - 1] : Number(travel.pricePerNight);
  const minEstimatedPrice = prices.length ? Math.min(...prices) : currentEstimatedPrice;
  const maxEstimatedPrice = prices.length ? Math.max(...prices) : currentEstimatedPrice;
  const avgEstimatedPrice = prices.length
    ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
    : currentEstimatedPrice;

  return {
    travelId: travel._id,
    destinationTitle: travel.title,
    city: travel.city,
    country: travel.country,
    currency: travel.currency || "USD",
    isEstimate: true,
    stats: {
      currentEstimatedPrice,
      minEstimatedPrice,
      maxEstimatedPrice,
      avgEstimatedPrice,
      observationCount: observations.length,
    },
    observations,
    disclaimer:
      "Price history shows Travelogia catalogue baseline estimates and user-recorded price observations — not live airline or hotel market feeds.",
  };
}

async function evaluateAlertsForTravel(travelId, latestPrice) {
  const alerts = await v2Store.listAllActivePriceAlerts();
  const matching = alerts.filter((a) => a.travelId === travelId);
  const triggered = [];

  for (const alert of matching) {
    if (Number(latestPrice) <= Number(alert.targetPricePerNight)) {
      const recentlyTriggered =
        alert.lastTriggeredAt &&
        Date.now() - new Date(alert.lastTriggeredAt).getTime() < 5 * 60 * 1000;
      if (recentlyTriggered) continue;

      const notification = await v2Store.createNotification({
        user: String(alert.user),
        type: "price-alert",
        title: `Budget Target Matched: ${alert.destinationTitle}`,
        message: `Estimated nightly price for ${alert.destinationTitle} reached $${latestPrice}/night (your target: $${alert.targetPricePerNight}/night). Note: estimate based on recorded observations.`,
        relatedId: travelId,
      });

      await v2Store.updatePriceAlert(alert._id, {
        lastTriggeredAt: new Date().toISOString(),
      });
      triggered.push({ alertId: alert._id, notification });
    }
  }
  return triggered;
}

async function recordObservation({ travelId, estimatedPricePerNight, note = "", userId = "user" }) {
  const travel = await store.findTravelById(travelId);
  if (!travel) {
    throw new ApiError(404, "Destination not found.");
  }
  const price = Number(estimatedPricePerNight);
  if (!Number.isFinite(price) || price <= 0 || price > 50000) {
    throw new ApiError(400, "estimatedPricePerNight must be a valid positive number.");
  }

  const observation = await v2Store.addPriceObservation({
    travelId: travel._id,
    destinationTitle: travel.title,
    estimatedPricePerNight: Math.round(price),
    currency: travel.currency || "USD",
    source: "user-observation",
    note: String(note || "User-recorded estimated price observation").trim().slice(0, 200),
    recordedBy: String(userId),
    observedAt: new Date().toISOString(),
  });

  const triggeredAlerts = await evaluateAlertsForTravel(travel._id, observation.estimatedPricePerNight);
  return { observation, triggeredAlerts };
}

async function evaluateAllAlerts() {
  const alerts = await v2Store.listAllActivePriceAlerts();
  const results = [];

  for (const alert of alerts) {
    const observations = await v2Store.listPriceObservations(alert.travelId);
    if (observations.length === 0) continue;
    const latest = observations[observations.length - 1];
    if (Number(latest.estimatedPricePerNight) <= Number(alert.targetPricePerNight)) {
      const notification = await v2Store.createNotification({
        user: String(alert.user),
        type: "price-alert",
        title: `Target Budget Alert: ${alert.destinationTitle}`,
        message: `Latest recorded estimate for ${alert.destinationTitle} is $${latest.estimatedPricePerNight}/night, at or below your $${alert.targetPricePerNight}/night target.`,
        relatedId: alert.travelId,
      });
      await v2Store.updatePriceAlert(alert._id, {
        lastTriggeredAt: new Date().toISOString(),
      });
      results.push({ alertId: alert._id, notification });
    }
  }

  return {
    evaluatedCount: alerts.length,
    triggeredCount: results.length,
    triggered: results,
    checkedAt: new Date().toISOString(),
  };
}

function startPriceWatchScheduler() {
  if (env.isTest || schedulerHandle) return;
  schedulerHandle = setInterval(() => {
    evaluateAllAlerts().catch((err) => {
      console.warn("[Travelogia PriceWatcher] Scheduled evaluation failed:", err.message);
    });
  }, 15 * 60 * 1000);
  if (typeof schedulerHandle.unref === "function") {
    schedulerHandle.unref();
  }
}

module.exports = {
  getDestinationPriceHistory,
  recordObservation,
  evaluateAlertsForTravel,
  evaluateAllAlerts,
  startPriceWatchScheduler,
};
