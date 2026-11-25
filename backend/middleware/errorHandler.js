const env = require("../config/env");

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = err.statusCode || 500;
  let message = err.isOperational ? err.message : "An unexpected server error occurred.";

  // Handle Mongoose validation & cast errors safely without leaking internals
  if (err.name === "ValidationError") {
    statusCode = 400;
    const fields = Object.values(err.errors || {}).map((e) => e.message);
    message = fields.length ? fields.join("; ") : "Validation failed.";
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid identifier format.";
  } else if (err.code === 11000) {
    statusCode = 409;
    message = "A record with this unique value already exists.";
  } else if (err.name === "MulterError") {
    statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Uploaded image exceeds the 5 MB file size limit."
        : err.code === "LIMIT_FILE_COUNT"
          ? "You can upload up to 4 photos per journal entry."
          : "Invalid file upload request.";
  } else if (err.type === "entity.too.large") {
    statusCode = 413;
    message = "Request payload is too large.";
  } else if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    statusCode = 400;
    message = "Invalid JSON payload.";
  } else if (
    err.name === "MongooseError" ||
    err.name === "MongoNetworkError" ||
    (err.message && err.message.includes("buffering timed out"))
  ) {
    statusCode = 503;
    message = "Database temporarily unavailable. Please try again shortly.";
  }

  if (!env.isTest && statusCode >= 500) {
    console.error(`[Travelogia Error ${statusCode}]`, err.message);
  }

  const payload = {
    success: false,
    message,
  };
  if (err.details) {
    payload.details = err.details;
  }

  return res.status(statusCode).json(payload);
}

module.exports = errorHandler;
