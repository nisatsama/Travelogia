const http = require("http");
const app = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");
const { initSocketServer } = require("./services/socketService");
const { startPriceWatchScheduler } = require("./services/priceWatcherService");
const { startReminderScheduler } = require("./services/notificationService");

async function startServer() {
  const server = http.createServer(app);
  initSocketServer(server);

  server.listen(env.PORT, "0.0.0.0", () => {
    console.log(`Travelogia 2.0 server listening on http://0.0.0.0:${env.PORT}`);
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  startPriceWatchScheduler();
  startReminderScheduler();

  // Connect to MongoDB in the background so port binding is never delayed
  connectDatabase().catch((err) => {
    console.warn("[Travelogia] Background DB init error:", err.message);
  });

  return server;
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  });
}

module.exports = { startServer };

