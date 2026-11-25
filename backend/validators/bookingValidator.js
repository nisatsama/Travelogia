const ApiError = require("../utils/ApiError");
const { sanitizeString } = require("../utils/sanitize");

function validateBookingCreate(req) {
  const body = req.body || {};
  const travelId = sanitizeString(body.travelId || body.travel, 120);
  const rawTravelers = body.travelers ?? body.travellers;
  const rawDuration = body.duration;
  const rawDate = body.startDate || body.date || body.travelDate;
  const idempotencyKey = sanitizeString(
    req.header("X-Idempotency-Key") || body.idempotencyKey || "",
    120,
  );

  if (!travelId) {
    throw new ApiError(400, "A destination ID is required to create a booking.");
  }

  const travelers = Number(rawTravelers);
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 20) {
    throw new ApiError(400, "Number of travellers must be an integer between 1 and 20.");
  }

  const duration = Number(rawDuration);
  if (!Number.isInteger(duration) || duration < 1 || duration > 60) {
    throw new ApiError(400, "Duration must be an integer between 1 and 60 days.");
  }

  if (!rawDate) {
    throw new ApiError(400, "Travel start date is required.");
  }

  const parsedDate = new Date(rawDate);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(400, "Invalid travel start date.");
  }

  // Note: Client-supplied totalCost is intentionally ignored; calculated server-side only.
  return {
    travelId,
    travelers,
    duration,
    startDate: parsedDate.toISOString(),
    idempotencyKey: idempotencyKey || null,
  };
}

module.exports = {
  validateBookingCreate,
};
