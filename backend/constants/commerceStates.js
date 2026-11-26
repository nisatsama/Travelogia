const BOOKING_STATUS = Object.freeze({
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

const PAYMENT_STATUS = Object.freeze({
  UNPAID: "UNPAID",
  ORDER_CREATED: "ORDER_CREATED",
  PAID: "PAID",
  FAILED: "FAILED",
  REFUND_PENDING: "REFUND_PENDING",
  REFUNDED: "REFUNDED",
});

const USER_ROLES = Object.freeze({
  CUSTOMER: "user",
  ADMIN: "admin",
  PROPERTY_OWNER: "property_owner",
  TRANSPORT_PROVIDER: "transport_provider",
  ACTIVITY_PROVIDER: "activity_provider",
  TOUR_GUIDE: "tour_guide",
});

module.exports = {
  BOOKING_STATUS,
  PAYMENT_STATUS,
  USER_ROLES,
};
