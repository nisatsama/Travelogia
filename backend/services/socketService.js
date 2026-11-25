const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const store = require("./storeService");
const v2Store = require("./v2StoreService");

let ioInstance = null;
// Map<tripId, Map<socketId, { userId, username }>>
const roomPresence = new Map();

function parseCookieHeader(cookieHeader = "") {
  const out = {};
  cookieHeader.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = decodeURIComponent(part.slice(idx + 1).trim());
      out[key] = val;
    }
  });
  return out;
}

function getPresenceList(tripId) {
  const membersMap = roomPresence.get(tripId);
  if (!membersMap) return [];
  const deduped = new Map();
  membersMap.forEach((info) => {
    deduped.set(info.userId, info);
  });
  return Array.from(deduped.values());
}

function initSocketServer(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: "/socket.io",
  });

  // Authenticate every socket connection using JWT (Bearer auth handshake or HttpOnly cookie)
  ioInstance.use(async (socket, next) => {
    try {
      let token = socket.handshake?.auth?.token || null;
      if (!token && socket.handshake?.headers?.cookie) {
        const cookies = parseCookieHeader(socket.handshake.headers.cookie);
        token = cookies[env.COOKIE_NAME] || null;
      }
      if (!token) {
        return next(new Error("Authentication required for collaborative workspace."));
      }

      const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
      if (!decoded?.id) {
        return next(new Error("Invalid authentication token."));
      }

      const user = await store.findUserById(decoded.id);
      if (!user) {
        return next(new Error("User account not found."));
      }

      socket.user = {
        id: String(user._id),
        username: user.username,
        email: user.email,
      };
      return next();
    } catch {
      return next(new Error("Socket authentication failed."));
    }
  });

  ioInstance.on("connection", (socket) => {
    socket.joinedTrips = new Set();

    socket.on("trip:join", async (tripId, ack) => {
      try {
        if (!tripId || typeof tripId !== "string") {
          if (typeof ack === "function") ack({ ok: false, message: "Invalid trip ID." });
          return;
        }
        const trip = await v2Store.findCollabTripById(tripId);
        if (!trip) {
          if (typeof ack === "function") ack({ ok: false, message: "Trip not found." });
          return;
        }
        const isMember = (trip.members || []).some(
          (m) => String(m.user) === String(socket.user.id),
        );
        if (!isMember) {
          if (typeof ack === "function") {
            ack({ ok: false, message: "You do not have access to this private trip room." });
          }
          return;
        }

        const roomName = `trip:${tripId}`;
        socket.join(roomName);
        socket.joinedTrips.add(tripId);

        if (!roomPresence.has(tripId)) {
          roomPresence.set(tripId, new Map());
        }
        roomPresence.get(tripId).set(socket.id, {
          userId: socket.user.id,
          username: socket.user.username,
        });

        const presence = getPresenceList(tripId);
        ioInstance.to(roomName).emit("trip:presence", { tripId, onlineMembers: presence });
        if (typeof ack === "function") ack({ ok: true, onlineMembers: presence });
      } catch {
        if (typeof ack === "function") ack({ ok: false, message: "Could not join trip room." });
      }
    });

    socket.on("trip:leave", (tripId) => {
      if (!tripId) return;
      socket.leave(`trip:${tripId}`);
      socket.joinedTrips.delete(tripId);
      const map = roomPresence.get(tripId);
      if (map) {
        map.delete(socket.id);
        ioInstance.to(`trip:${tripId}`).emit("trip:presence", {
          tripId,
          onlineMembers: getPresenceList(tripId),
        });
      }
    });

    socket.on("disconnect", () => {
      socket.joinedTrips.forEach((tripId) => {
        const map = roomPresence.get(tripId);
        if (map) {
          map.delete(socket.id);
          ioInstance.to(`trip:${tripId}`).emit("trip:presence", {
            tripId,
            onlineMembers: getPresenceList(tripId),
          });
        }
      });
      socket.joinedTrips.clear();
    });
  });

  return ioInstance;
}

function emitTripUpdate(tripId, eventName, payload) {
  if (!ioInstance || !tripId) return;
  ioInstance.to(`trip:${tripId}`).emit(eventName, payload);
}

module.exports = {
  initSocketServer,
  emitTripUpdate,
};
