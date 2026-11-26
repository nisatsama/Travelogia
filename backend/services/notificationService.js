const env = require("../config/env");
const v2Store = require("./v2StoreService");
const cStore = require("./commerceStoreService");

let reminderSchedulerHandle = null;

const TYPE_TO_PREF_KEY = {
  "booking-confirmation": "bookingConfirmations",
  "payment-update": "paymentUpdates",
  "cancellation-update": "cancellationUpdates",
  "checkin-reminder": "checkInReminders",
  "transport-reminder": "transportReminders",
  "activity-reminder": "activityReminders",
  "price-alert": "priceAlerts",
};

async function notifyUser({ userId, type, title, message, relatedId = "" }) {
  if (!userId) return null;
  const prefs = await cStore.getNotificationPreferences(userId);
  const prefKey = TYPE_TO_PREF_KEY[type];
  if (prefKey && prefs[prefKey] === false) {
    return null;
  }
  return v2Store.createNotification({
    user: String(userId),
    type: String(type || "system"),
    title: String(title || "Travelogia Update").slice(0, 140),
    message: String(message || "").slice(0, 500),
    relatedId: String(relatedId || ""),
  });
}

function isWithinHours(dateStr, hoursAhead = 48) {
  if (!dateStr) return false;
  const target = new Date(`${dateStr}T09:00:00.000Z`).getTime();
  if (Number.isNaN(target)) return false;
  const diff = target - Date.now();
  return diff >= -6 * 3600 * 1000 && diff <= hoursAhead * 3600 * 1000;
}

// Scheduled / on-demand reminder generator for upcoming check-ins, departures, and activities
async function runUpcomingTravelReminders() {
  const created = [];

  const [stays, transports, activities] = await Promise.all([
    cStore.listAllActiveStayBookings(),
    cStore.listAllActiveTransportReservations(),
    cStore.listAllActiveActivityBookings(),
  ]);

  const checkExisting = async (userId, relatedId, type) => {
    const existing = await v2Store.listUserNotifications(userId);
    return existing.some((n) => n.relatedId === relatedId && n.type === type);
  };

  for (const s of stays) {
    if (isWithinHours(s.checkInDate, 48)) {
      const already = await checkExisting(s.user, s._id, "checkin-reminder");
      if (!already) {
        const n = await notifyUser({
          userId: s.user,
          type: "checkin-reminder",
          title: `Check-in Reminder: ${s.propertyName}`,
          message: `Your stay (${s.bookingReference}) checks in on ${s.checkInDate}. Keep your ID and confirmation ready in your Digital Travel Wallet.`,
          relatedId: s._id,
        });
        if (n) created.push(n);
      }
    }
  }

  for (const t of transports) {
    if (isWithinHours(t.travelDate, 48)) {
      const already = await checkExisting(t.user, t._id, "transport-reminder");
      if (!already) {
        const n = await notifyUser({
          userId: t.user,
          type: "transport-reminder",
          title: `Transport Departure Reminder: ${t.origin} → ${t.destination}`,
          message: `Upcoming ${t.mode} reservation (${t.bookingReference}) on ${t.travelDate}${t.departureTime ? ` at ${t.departureTime}` : ""}.`,
          relatedId: t._id,
        });
        if (n) created.push(n);
      }
    }
  }

  for (const a of activities) {
    if (isWithinHours(a.date, 48)) {
      const already = await checkExisting(a.user, a._id, "activity-reminder");
      if (!already) {
        const n = await notifyUser({
          userId: a.user,
          type: "activity-reminder",
          title: `Activity Reminder: ${a.activityTitle}`,
          message: `Scheduled for ${a.date} at ${a.timeSlot} for ${a.participants} participant(s) (${a.bookingReference}).`,
          relatedId: a._id,
        });
        if (n) created.push(n);
      }
    }
  }

  return {
    remindersCreated: created.length,
    checkedAt: new Date().toISOString(),
  };
}

function startReminderScheduler() {
  if (env.isTest || reminderSchedulerHandle) return;
  reminderSchedulerHandle = setInterval(() => {
    runUpcomingTravelReminders().catch((err) => {
      console.warn("[Travelogia Reminders] Background reminder check failed:", err.message);
    });
  }, 30 * 60 * 1000);
  if (typeof reminderSchedulerHandle.unref === "function") {
    reminderSchedulerHandle.unref();
  }
}

module.exports = {
  notifyUser,
  runUpcomingTravelReminders,
  startReminderScheduler,
};
