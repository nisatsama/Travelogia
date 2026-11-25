const crypto = require("crypto");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const store = require("../services/storeService");
const v2Store = require("../services/v2StoreService");
const { emitTripUpdate } = require("../services/socketService");

function getMember(trip, userId) {
  return (trip.members || []).find((m) => String(m.user) === String(userId)) || null;
}

function requireMember(trip, userId, allowedRoles = ["owner", "editor", "viewer"]) {
  const member = getMember(trip, userId);
  if (!member) {
    throw new ApiError(403, "Access denied. You are not a member of this collaborative trip.");
  }
  if (!allowedRoles.includes(member.role)) {
    throw new ApiError(
      403,
      `Your role (${member.role}) does not have permission to modify this trip.`,
    );
  }
  return member;
}

function computeExpenseSplitSummary(trip) {
  const members = trip.members || [];
  const expenses = trip.expenses || [];
  const paidByMember = {};
  const owedByMember = {};

  members.forEach((m) => {
    paidByMember[m.user] = 0;
    owedByMember[m.user] = 0;
  });

  let totalSpent = 0;
  expenses.forEach((exp) => {
    const amt = Number(exp.amount || 0);
    totalSpent += amt;
    if (paidByMember[exp.paidBy] !== undefined) {
      paidByMember[exp.paidBy] += amt;
    } else {
      paidByMember[exp.paidBy] = amt;
    }
    const participants =
      Array.isArray(exp.splitAmong) && exp.splitAmong.length > 0
        ? exp.splitAmong
        : members.map((m) => m.user);
    const share = participants.length > 0 ? amt / participants.length : 0;
    participants.forEach((uid) => {
      owedByMember[uid] = (owedByMember[uid] || 0) + share;
    });
  });

  const balances = members.map((m) => {
    const paid = Math.round((paidByMember[m.user] || 0) * 100) / 100;
    const share = Math.round((owedByMember[m.user] || 0) * 100) / 100;
    return {
      user: m.user,
      username: m.username,
      paid,
      share,
      netBalance: Math.round((paid - share) * 100) / 100,
    };
  });

  return {
    totalSpent: Math.round(totalSpent * 100) / 100,
    perPersonEqualShare:
      members.length > 0 ? Math.round((totalSpent / members.length) * 100) / 100 : 0,
    balances,
  };
}

function enrichTrip(trip) {
  return {
    ...trip,
    expenseSummary: computeExpenseSplitSummary(trip),
  };
}

exports.listMyTrips = asyncHandler(async (req, res) => {
  const trips = await v2Store.listUserCollabTrips(req.user.id);
  res.status(200).json({ success: true, data: trips.map(enrichTrip) });
});

exports.createTrip = asyncHandler(async (req, res) => {
  const { title, description = "", startDate = "", endDate = "", currency = "USD" } = req.body || {};
  if (!title || typeof title !== "string" || title.trim().length < 2) {
    throw new ApiError(400, "Trip title must be at least 2 characters.");
  }

  const inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  const created = await v2Store.createCollabTrip({
    title: title.trim().slice(0, 120),
    description: String(description || "").trim().slice(0, 400),
    startDate: String(startDate || ""),
    endDate: String(endDate || ""),
    currency: currency === "INR" ? "INR" : "USD",
    inviteCode,
    owner: req.user.id,
    members: [
      {
        user: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: "owner",
        joinedAt: new Date().toISOString(),
      },
    ],
    destinations: [],
    activities: [],
    comments: [],
    expenses: [],
  });

  res.status(201).json({ success: true, data: enrichTrip(created) });
});

exports.joinTripByCode = asyncHandler(async (req, res) => {
  const code = String(req.body?.inviteCode || "").trim().toUpperCase();
  if (!code || code.length < 4) {
    throw new ApiError(400, "Please provide a valid trip invite code.");
  }

  const trip = await v2Store.findCollabTripByInviteCode(code);
  if (!trip) {
    throw new ApiError(404, "No collaborative trip matched that invite code.");
  }

  const existingMember = getMember(trip, req.user.id);
  if (existingMember) {
    return res.status(200).json({
      success: true,
      message: "You are already a member of this trip.",
      data: enrichTrip(trip),
    });
  }

  const nextMembers = [
    ...(trip.members || []),
    {
      user: req.user.id,
      username: req.user.username,
      email: req.user.email,
      role: "editor",
      joinedAt: new Date().toISOString(),
    },
  ];

  const updated = await v2Store.saveCollabTrip(trip._id, {
    ...trip,
    members: nextMembers,
  });
  const enriched = enrichTrip(updated);
  emitTripUpdate(trip._id, "trip:updated", enriched);

  return res.status(200).json({ success: true, data: enriched });
});

exports.getTrip = asyncHandler(async (req, res) => {
  const trip = await v2Store.findCollabTripById(req.params.id);
  if (!trip) throw new ApiError(404, "Collaborative trip not found.");
  requireMember(trip, req.user.id);
  res.status(200).json({ success: true, data: enrichTrip(trip) });
});

exports.updateMemberRole = asyncHandler(async (req, res) => {
  const trip = await v2Store.findCollabTripById(req.params.id);
  if (!trip) throw new ApiError(404, "Collaborative trip not found.");
  requireMember(trip, req.user.id, ["owner"]);

  const targetUserId = String(req.params.memberUserId);
  const nextRole = String(req.body?.role || "");
  if (!["editor", "viewer"].includes(nextRole)) {
    throw new ApiError(400, "Role must be 'editor' or 'viewer'.");
  }
  if (targetUserId === String(trip.owner)) {
    throw new ApiError(400, "Trip owner role cannot be downgraded.");
  }

  let found = false;
  const nextMembers = (trip.members || []).map((m) => {
    if (String(m.user) === targetUserId) {
      found = true;
      return { ...m, role: nextRole };
    }
    return m;
  });
  if (!found) throw new ApiError(404, "Member not found in this trip.");

  const updated = await v2Store.saveCollabTrip(trip._id, { ...trip, members: nextMembers });
  const enriched = enrichTrip(updated);
  emitTripUpdate(trip._id, "trip:updated", enriched);
  res.status(200).json({ success: true, data: enriched });
});

exports.addDestination = asyncHandler(async (req, res) => {
  const trip = await v2Store.findCollabTripById(req.params.id);
  if (!trip) throw new ApiError(404, "Collaborative trip not found.");
  requireMember(trip, req.user.id, ["owner", "editor"]);

  const travelId = String(req.body?.travelId || "").trim();
  const travel = await store.findTravelById(travelId);
  if (!travel) throw new ApiError(404, "Selected destination does not exist in catalogue.");

  const exists = (trip.destinations || []).some((d) => d.travelId === travel._id);
  if (exists) {
    throw new ApiError(409, "Destination is already in this collaborative trip.");
  }

  const nextDestinations = [
    ...(trip.destinations || []),
    {
      travelId: travel._id,
      title: travel.title,
      city: travel.city,
      country: travel.country,
      pricePerNight: travel.pricePerNight,
      coordinates: travel.coordinates,
      addedBy: req.user.username,
      votes: [req.user.id],
    },
  ];

  const updated = await v2Store.saveCollabTrip(trip._id, {
    ...trip,
    destinations: nextDestinations,
  });
  const enriched = enrichTrip(updated);
  emitTripUpdate(trip._id, "trip:updated", enriched);
  res.status(201).json({ success: true, data: enriched });
});

exports.removeDestination = asyncHandler(async (req, res) => {
  const trip = await v2Store.findCollabTripById(req.params.id);
  if (!trip) throw new ApiError(404, "Collaborative trip not found.");
  requireMember(trip, req.user.id, ["owner", "editor"]);

  const nextDestinations = (trip.destinations || []).filter(
    (d) => d.travelId !== req.params.travelId,
  );
  const updated = await v2Store.saveCollabTrip(trip._id, {
    ...trip,
    destinations: nextDestinations,
  });
  const enriched = enrichTrip(updated);
  emitTripUpdate(trip._id, "trip:updated", enriched);
  res.status(200).json({ success: true, data: enriched });
});

exports.voteDestination = asyncHandler(async (req, res) => {
  const trip = await v2Store.findCollabTripById(req.params.id);
  if (!trip) throw new ApiError(404, "Collaborative trip not found.");
  requireMember(trip, req.user.id, ["owner", "editor", "viewer"]);

  const nextDestinations = (trip.destinations || []).map((d) => {
    if (d.travelId !== req.params.travelId) return d;
    const set = new Set((d.votes || []).map(String));
    if (set.has(req.user.id)) set.delete(req.user.id);
    else set.add(req.user.id);
    return { ...d, votes: Array.from(set) };
  });

  const updated = await v2Store.saveCollabTrip(trip._id, {
    ...trip,
    destinations: nextDestinations,
  });
  const enriched = enrichTrip(updated);
  emitTripUpdate(trip._id, "trip:updated", enriched);
  res.status(200).json({ success: true, data: enriched });
});

exports.addActivity = asyncHandler(async (req, res) => {
  const trip = await v2Store.findCollabTripById(req.params.id);
  if (!trip) throw new ApiError(404, "Collaborative trip not found.");
  requireMember(trip, req.user.id, ["owner", "editor"]);

  const title = String(req.body?.title || "").trim();
  if (title.length < 2) throw new ApiError(400, "Activity title is required.");

  const activity = {
    id: v2Store.createId("act"),
    dayNumber: Math.max(1, Number(req.body?.dayNumber || 1)),
    title: title.slice(0, 140),
    assignedTo: String(req.body?.assignedTo || "").trim().slice(0, 80),
    status: "planned",
    votes: [req.user.id],
    createdBy: req.user.username,
  };

  const updated = await v2Store.saveCollabTrip(trip._id, {
    ...trip,
    activities: [...(trip.activities || []), activity],
  });
  const enriched = enrichTrip(updated);
  emitTripUpdate(trip._id, "trip:updated", enriched);
  res.status(201).json({ success: true, data: enriched });
});

exports.updateActivity = asyncHandler(async (req, res) => {
  const trip = await v2Store.findCollabTripById(req.params.id);
  if (!trip) throw new ApiError(404, "Collaborative trip not found.");
  requireMember(trip, req.user.id, ["owner", "editor"]);

  const nextActivities = (trip.activities || []).map((a) => {
    if (a.id !== req.params.activityId) return a;
    return {
      ...a,
      title: typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim().slice(0, 140) : a.title,
      assignedTo: typeof req.body?.assignedTo === "string" ? req.body.assignedTo.trim().slice(0, 80) : a.assignedTo,
      status: ["planned", "booked", "done"].includes(req.body?.status) ? req.body.status : a.status,
      dayNumber: Number.isInteger(Number(req.body?.dayNumber)) ? Number(req.body.dayNumber) : a.dayNumber,
    };
  });

  const updated = await v2Store.saveCollabTrip(trip._id, { ...trip, activities: nextActivities });
  const enriched = enrichTrip(updated);
  emitTripUpdate(trip._id, "trip:updated", enriched);
  res.status(200).json({ success: true, data: enriched });
});

exports.voteActivity = asyncHandler(async (req, res) => {
  const trip = await v2Store.findCollabTripById(req.params.id);
  if (!trip) throw new ApiError(404, "Collaborative trip not found.");
  requireMember(trip, req.user.id, ["owner", "editor", "viewer"]);

  const nextActivities = (trip.activities || []).map((a) => {
    if (a.id !== req.params.activityId) return a;
    const set = new Set((a.votes || []).map(String));
    if (set.has(req.user.id)) set.delete(req.user.id);
    else set.add(req.user.id);
    return { ...a, votes: Array.from(set) };
  });

  const updated = await v2Store.saveCollabTrip(trip._id, { ...trip, activities: nextActivities });
  const enriched = enrichTrip(updated);
  emitTripUpdate(trip._id, "trip:updated", enriched);
  res.status(200).json({ success: true, data: enriched });
});

exports.addComment = asyncHandler(async (req, res) => {
  const trip = await v2Store.findCollabTripById(req.params.id);
  if (!trip) throw new ApiError(404, "Collaborative trip not found.");
  requireMember(trip, req.user.id, ["owner", "editor", "viewer"]);

  const text = String(req.body?.text || "").trim();
  if (!text) throw new ApiError(400, "Comment text cannot be empty.");

  const comment = {
    id: v2Store.createId("cmt"),
    user: req.user.id,
    username: req.user.username,
    text: text.slice(0, 600),
    createdAt: new Date().toISOString(),
  };

  const updated = await v2Store.saveCollabTrip(trip._id, {
    ...trip,
    comments: [...(trip.comments || []), comment],
  });
  const enriched = enrichTrip(updated);
  emitTripUpdate(trip._id, "trip:updated", enriched);
  res.status(201).json({ success: true, data: enriched });
});

exports.addExpense = asyncHandler(async (req, res) => {
  const trip = await v2Store.findCollabTripById(req.params.id);
  if (!trip) throw new ApiError(404, "Collaborative trip not found.");
  requireMember(trip, req.user.id, ["owner", "editor"]);

  const title = String(req.body?.title || "").trim();
  const amount = Number(req.body?.amount);
  const category = String(req.body?.category || "General").trim().slice(0, 40);

  if (!title) throw new ApiError(400, "Expense description is required.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "Expense amount must be a positive number.");
  }

  const paidByMember =
    (trip.members || []).find((m) => String(m.user) === String(req.body?.paidBy)) ||
    getMember(trip, req.user.id);

  const memberIds = (trip.members || []).map((m) => String(m.user));
  const splitAmong =
    Array.isArray(req.body?.splitAmong) && req.body.splitAmong.length > 0
      ? req.body.splitAmong.filter((id) => memberIds.includes(String(id)))
      : memberIds;

  const expense = {
    id: v2Store.createId("exp"),
    title: title.slice(0, 120),
    amount: Math.round(amount * 100) / 100,
    category,
    paidBy: String(paidByMember.user),
    paidByName: paidByMember.username,
    splitAmong: splitAmong.length > 0 ? splitAmong : memberIds,
    createdAt: new Date().toISOString(),
  };

  const updated = await v2Store.saveCollabTrip(trip._id, {
    ...trip,
    expenses: [...(trip.expenses || []), expense],
  });
  const enriched = enrichTrip(updated);
  emitTripUpdate(trip._id, "trip:updated", enriched);
  res.status(201).json({ success: true, data: enriched });
});
