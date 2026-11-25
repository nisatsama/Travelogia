const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const store = require("../services/storeService");
const v2Store = require("../services/v2StoreService");
const priceWatcherService = require("../services/priceWatcherService");

exports.getPriceHistory = asyncHandler(async (req, res) => {
  const history = await priceWatcherService.getDestinationPriceHistory(req.params.travelId);
  res.status(200).json({ success: true, data: history });
});

exports.addPriceObservation = asyncHandler(async (req, res) => {
  const { travelId, estimatedPricePerNight, note } = req.body || {};
  const result = await priceWatcherService.recordObservation({
    travelId: String(travelId || "").trim(),
    estimatedPricePerNight,
    note,
    userId: req.user.id,
  });
  res.status(201).json({ success: true, data: result });
});

exports.listMyAlerts = asyncHandler(async (req, res) => {
  const alerts = await v2Store.listUserPriceAlerts(req.user.id);
  res.status(200).json({ success: true, data: alerts });
});

exports.createAlert = asyncHandler(async (req, res) => {
  const { travelId, targetPricePerNight } = req.body || {};
  const travel = await store.findTravelById(String(travelId || "").trim());
  if (!travel) throw new ApiError(404, "Destination not found.");

  const target = Number(targetPricePerNight);
  if (!Number.isFinite(target) || target <= 0 || target > 50000) {
    throw new ApiError(400, "targetPricePerNight must be a positive number.");
  }

  const alert = await v2Store.createPriceAlert({
    user: req.user.id,
    travelId: travel._id,
    destinationTitle: travel.title,
    targetPricePerNight: Math.round(target),
    currency: travel.currency || "USD",
    active: true,
  });

  // Immediately evaluate against latest recorded estimate
  const history = await priceWatcherService.getDestinationPriceHistory(travel._id);
  const triggered = await priceWatcherService.evaluateAlertsForTravel(
    travel._id,
    history.stats.currentEstimatedPrice,
  );

  res.status(201).json({
    success: true,
    data: alert,
    triggeredImmediately: triggered.length > 0,
    triggered,
  });
});

exports.deleteAlert = asyncHandler(async (req, res) => {
  const deleted = await v2Store.deletePriceAlert(req.params.id, req.user.id);
  if (!deleted) throw new ApiError(404, "Price alert not found.");
  res.status(200).json({ success: true, message: "Price alert removed." });
});

exports.evaluateAlerts = asyncHandler(async (req, res) => {
  const result = await priceWatcherService.evaluateAllAlerts();
  res.status(200).json({ success: true, data: result });
});

exports.listMyNotifications = asyncHandler(async (req, res) => {
  const items = await v2Store.listUserNotifications(req.user.id);
  const unreadCount = items.filter((n) => !n.read).length;
  res.status(200).json({ success: true, data: items, unreadCount });
});

exports.markNotificationRead = asyncHandler(async (req, res) => {
  const updated = await v2Store.markNotificationRead(req.params.id, req.user.id);
  if (!updated) throw new ApiError(404, "Notification not found.");
  res.status(200).json({ success: true, data: updated });
});
