const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const v2Store = require("../services/v2StoreService");
const { calculateAndOptimizeBudget } = require("../services/budgetService");

exports.calculateBudget = asyncHandler(async (req, res) => {
  const result = await calculateAndOptimizeBudget(req.body || {});
  res.status(200).json({ success: true, data: result });
});

exports.compareScenarios = asyncHandler(async (req, res) => {
  const scenarios = req.body?.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length < 2 || scenarios.length > 4) {
    throw new ApiError(400, "Provide between 2 and 4 budget scenarios to compare.");
  }
  const results = await Promise.all(
    scenarios.map(async (sc, idx) => {
      const calc = await calculateAndOptimizeBudget(sc);
      return {
        label: String(sc.label || `Plan ${idx + 1}`).trim().slice(0, 60),
        ...calc,
      };
    }),
  );
  res.status(200).json({ success: true, data: results });
});

exports.createBudgetPlan = asyncHandler(async (req, res) => {
  const { name = "My Trip Budget", useRevisedPlan = false, ...params } = req.body || {};
  const calc = await calculateAndOptimizeBudget(params);

  const chosenCategories =
    useRevisedPlan && calc.revisedPlan ? calc.revisedPlan.categories : calc.categories;
  const totalEstimated = chosenCategories.reduce((s, c) => s + Number(c.estimated || 0), 0);

  const saved = await v2Store.createBudgetPlan({
    user: req.user.id,
    name: String(name || "My Trip Budget").trim().slice(0, 120),
    currency: calc.currency,
    totalBudget: calc.totalBudget,
    travelers: calc.travelers,
    duration: calc.duration,
    destinationIds: Array.isArray(params.destinationIds) ? params.destinationIds : [],
    accommodationPreference: calc.accommodationPreference,
    transportPreference: calc.transportPreference,
    categories: chosenCategories,
    estimatedGroupTotal: totalEstimated,
    estimatedPerPerson: Math.round(totalEstimated / calc.travelers),
    actualGroupTotal: 0,
    overBudget: totalEstimated > calc.totalBudget,
    optimizationSuggestions: calc.optimizationSuggestions,
  });

  res.status(201).json({ success: true, data: saved, calculation: calc });
});

exports.listMyBudgets = asyncHandler(async (req, res) => {
  const items = await v2Store.listUserBudgets(req.user.id);
  res.status(200).json({ success: true, data: items });
});

exports.updateBudgetPlan = asyncHandler(async (req, res) => {
  const existing = await v2Store.findBudgetById(req.params.id);
  if (!existing) throw new ApiError(404, "Budget plan not found.");
  if (String(existing.user) !== String(req.user.id)) {
    throw new ApiError(403, "You do not have permission to update this budget plan.");
  }

  const updates = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) {
    updates.name = req.body.name.trim().slice(0, 120);
  }
  if (Number.isFinite(Number(req.body?.totalBudget)) && Number(req.body.totalBudget) > 0) {
    updates.totalBudget = Math.round(Number(req.body.totalBudget));
  }
  if (Array.isArray(req.body?.categories)) {
    const cleanCats = req.body.categories.map((c) => ({
      key: String(c.key || ""),
      label: String(c.label || ""),
      estimated: Math.max(0, Math.round(Number(c.estimated || 0))),
      actual: Math.max(0, Math.round(Number(c.actual || 0))),
      percentage: 0,
    }));
    const estTotal = cleanCats.reduce((s, c) => s + c.estimated, 0);
    const actTotal = cleanCats.reduce((s, c) => s + c.actual, 0);
    cleanCats.forEach((c) => {
      c.percentage = estTotal > 0 ? Math.round((c.estimated / estTotal) * 100) : 0;
    });
    const budgetCap = updates.totalBudget || existing.totalBudget;
    updates.categories = cleanCats;
    updates.estimatedGroupTotal = estTotal;
    updates.estimatedPerPerson = Math.round(estTotal / Math.max(1, existing.travelers));
    updates.actualGroupTotal = actTotal;
    updates.overBudget = estTotal > budgetCap;
  }

  const updated = await v2Store.updateBudgetPlan(existing._id, updates);
  res.status(200).json({ success: true, data: updated });
});

exports.deleteBudgetPlan = asyncHandler(async (req, res) => {
  const existing = await v2Store.findBudgetById(req.params.id);
  if (!existing) throw new ApiError(404, "Budget plan not found.");
  if (String(existing.user) !== String(req.user.id)) {
    throw new ApiError(403, "You do not have permission to delete this budget plan.");
  }
  await v2Store.deleteBudgetPlan(existing._id);
  res.status(200).json({ success: true, message: "Budget plan deleted." });
});
