const ApiError = require("./ApiError");

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 12;

function parsePagination(query = {}) {
  const rawPage = query.page !== undefined ? Number(query.page) : 1;
  const rawLimit = query.limit !== undefined ? Number(query.limit) : DEFAULT_LIMIT;

  if (!Number.isInteger(rawPage) || rawPage < 1) {
    throw new ApiError(400, "Query parameter 'page' must be a positive integer.");
  }

  if (!Number.isInteger(rawLimit) || rawLimit < 1) {
    throw new ApiError(400, "Query parameter 'limit' must be a positive integer.");
  }

  const limit = Math.min(rawLimit, MAX_LIMIT);
  const skip = (rawPage - 1) * limit;

  return { page: rawPage, limit, skip };
}

function buildPaginationMeta(page, limit, totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  return {
    currentPage: page,
    totalPages,
    totalItems,
    limit,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

module.exports = {
  MAX_LIMIT,
  DEFAULT_LIMIT,
  parsePagination,
  buildPaginationMeta,
};
