const mongoose = require("mongoose");
const env = require("./env");

mongoose.set("bufferCommands", false);
mongoose.set("strictQuery", true);

let connectionAttempted = false;

const isDbConnected = () => mongoose.connection.readyState === 1;

async function connectDatabase() {
  if (connectionAttempted || isDbConnected()) {
    return isDbConnected();
  }
  connectionAttempted = true;

  if (!env.MONGODB_URI) {
    if (!env.isTest) {
      console.warn(
        "[Travelogia] MONGODB_URI not configured — using seeded in-memory store.",
      );
    }
    return false;
  }

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 4000,
      socketTimeoutMS: 20000,
    });
    if (!env.isTest) {
      console.log("[Travelogia] Connected to MongoDB.");
    }
    return true;
  } catch (err) {
    console.warn(
      "[Travelogia] MongoDB unavailable — falling back to seeded in-memory store:",
      err.message,
    );
    return false;
  }
}

module.exports = {
  connectDatabase,
  isDbConnected,
};
