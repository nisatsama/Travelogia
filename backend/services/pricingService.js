const crypto = require("crypto");
const ApiError = require("../utils/ApiError");

function calculateBookingPricing({ travel, travelers, duration, startDate }) {
  if (!travel || typeof travel.pricePerNight !== "number" || travel.pricePerNight <= 0) {
    throw new ApiError(400, "Destination does not have valid pricing configured.");
  }

  const safeTravelers = Number(travelers);
  const safeDuration = Number(duration);

  if (!Number.isInteger(safeTravelers) || safeTravelers < 1 || safeTravelers > 20) {
    throw new ApiError(400, "Travellers must be an integer between 1 and 20.");
  }

  if (!Number.isInteger(safeDuration) || safeDuration < 1 || safeDuration > 60) {
    throw new ApiError(400, "Duration must be an integer between 1 and 60 days.");
  }

  const parsedStart = new Date(startDate);
  if (Number.isNaN(parsedStart.getTime())) {
    throw new ApiError(400, "A valid travel start date is required.");
  }

  const endDate = new Date(parsedStart.getTime() + safeDuration * 24 * 60 * 60 * 1000);
  const pricePerNight = Number(travel.pricePerNight);
  const totalCost = Math.round(pricePerNight * safeTravelers * safeDuration * 100) / 100;

  return {
    pricePerNight,
    travelers: safeTravelers,
    duration: safeDuration,
    totalCost,
    currency: travel.currency || "USD",
    startDate: parsedStart,
    endDate,
  };
}

function generateBookingReference() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `TRV-${datePart}-${randPart}`;
}

module.exports = {
  calculateBookingPricing,
  generateBookingReference,
};
