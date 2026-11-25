const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const store = require("../services/storeService");

const getPackages = asyncHandler(async (req, res) => {
  const packages = await store.listPackages();
  res.status(200).json({
    success: true,
    data: packages,
  });
});

const getPackagesByCategory = asyncHandler(async (req, res) => {
  const packages = await store.listPackages(req.params.category);
  res.status(200).json({
    success: true,
    data: packages,
  });
});

const getPackageById = asyncHandler(async (req, res) => {
  const pkg = await store.findPackageById(req.params.id);
  if (!pkg) {
    throw new ApiError(404, "Package not found.");
  }
  res.status(200).json({
    success: true,
    data: pkg,
  });
});

module.exports = {
  getPackages,
  getPackagesByCategory,
  getPackageById,
};
