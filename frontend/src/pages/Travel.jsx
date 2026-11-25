import React, { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import DestinationMap from "../components/DestinationMap";
import AccessibilityFilter from "../components/AccessibilityFilter";
import "./Travel.css";

const PAGE_LIMIT = 12;

const Travel = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { favoriteIds, toggleFavorite } = useAuth();

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";
  const country = searchParams.get("country") || "";
  const minPrice = searchParams.get("minPrice") || "";
  const maxPrice = searchParams.get("maxPrice") || "";
  const minRating = searchParams.get("minRating") || "";
  const sortBy = searchParams.get("sortBy") || "featured";
  const sortOrder = searchParams.get("sortOrder") || "desc";
  const wheelchairAccessible = searchParams.get("wheelchairAccessible") || "";
  const accessibleAccommodation = searchParams.get("accessibleAccommodation") || "";
  const publicTransport = searchParams.get("publicTransport") || "";
  const familyFriendly = searchParams.get("familyFriendly") || "";
  const walkingIntensity = searchParams.get("walkingIntensity") || "";

  const [searchInput, setSearchInput] = useState(search);
  const [travels, setTravels] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    limit: PAGE_LIMIT,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [facets, setFacets] = useState({ categories: [], countries: [] });
  const [viewMode, setViewMode] = useState("grid");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [toast, setToast] = useState("");
  const [favBusyId, setFavBusyId] = useState(null);
  const [compareIds, setCompareIds] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get("/travels/facets");
        if (active && res.data?.data) {
          setFacets(res.data.data);
        }
      } catch {
        // fallback cleanly to empty dropdown facets
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const current = searchParams.get("search") || "";
      if (searchInput.trim() !== current) {
        const next = new URLSearchParams(searchParams);
        if (searchInput.trim()) {
          next.set("search", searchInput.trim());
        } else {
          next.delete("search");
        }
        next.set("page", "1");
        setSearchParams(next, { replace: true });
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [searchInput, searchParams, setSearchParams]);

  const queryParams = useMemo(() => {
    const params = {
      page,
      limit: PAGE_LIMIT,
      sortBy,
      sortOrder,
    };
    if (search) params.search = search;
    if (category) params.category = category;
    if (country) params.country = country;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    if (minRating) params.minRating = minRating;
    if (wheelchairAccessible) params.wheelchairAccessible = wheelchairAccessible;
    if (accessibleAccommodation) params.accessibleAccommodation = accessibleAccommodation;
    if (publicTransport) params.publicTransport = publicTransport;
    if (familyFriendly) params.familyFriendly = familyFriendly;
    if (walkingIntensity) params.walkingIntensity = walkingIntensity;
    return params;
  }, [
    page,
    search,
    category,
    country,
    minPrice,
    maxPrice,
    minRating,
    sortBy,
    sortOrder,
    wheelchairAccessible,
    accessibleAccommodation,
    publicTransport,
    familyFriendly,
    walkingIntensity,
  ]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await api.get("/travels", {
          params: queryParams,
          signal: controller.signal,
        });
        if (!active) return;
        setTravels(res.data?.data || []);
        if (res.data?.pagination) {
          setPagination(res.data.pagination);
        }
        setError("");
      } catch (err) {
        if (!active || err.name === "CanceledError") return;
        setError(getErrorMessage(err, "Unable to load destinations right now."));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [queryParams, reloadNonce]);

  const updateFilter = (key, value) => {
    setLoading(true);
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== "page") {
      next.set("page", "1");
    }
    setSearchParams(next);
  };

  const handleSortChange = (combined) => {
    setLoading(true);
    const [nextSortBy, nextSortOrder] = combined.split(":");
    const next = new URLSearchParams(searchParams);
    next.set("sortBy", nextSortBy);
    next.set("sortOrder", nextSortOrder);
    next.set("page", "1");
    setSearchParams(next);
  };

  const handleResetFilters = () => {
    setLoading(true);
    setSearchInput("");
    setSearchParams({});
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  };

  const handleToggleFavorite = async (e, travelId) => {
    e.preventDefault();
    e.stopPropagation();
    setFavBusyId(travelId);
    try {
      const result = await toggleFavorite(travelId);
      if (result?.requiresAuth) {
        navigate("/login", {
          state: {
            from: "/travels",
            message: "Sign in to save destinations to your wishlist.",
          },
        });
        return;
      }
      showToast(
        result.isFavorite ? "Saved to your Favorites" : "Removed from Favorites",
      );
    } catch (err) {
      showToast(getErrorMessage(err, "Could not update favorites."));
    } finally {
      setFavBusyId(null);
    }
  };

  const hasActiveFilters = Boolean(
    search ||
      category ||
      country ||
      minPrice ||
      maxPrice ||
      minRating ||
      wheelchairAccessible ||
      accessibleAccommodation ||
      publicTransport ||
      familyFriendly ||
      walkingIntensity,
  );

  const toggleCompare = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        showToast("You can compare up to 3 destinations side-by-side.");
        return prev;
      }
      return [...prev, id];
    });
  };

  const pageNumbers = useMemo(() => {
    const total = pagination.totalPages || 1;
    const current = pagination.currentPage || 1;
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    const pages = [];
    for (let p = Math.max(1, end - 4); p <= end; p += 1) {
      pages.push(p);
    }
    return pages;
  }, [pagination.currentPage, pagination.totalPages]);

  return (
    <div className="travel-body">
      <div className="travels-topbar">
        <Link to="/" className="travels-home-link">
          ← Home
        </Link>
        <div className="travels-nav-links">
          <Link to="/hidden-gems">Hidden Gems</Link>
          <Link to="/trip-builder">Trip Builder</Link>
          <Link to="/compare">Compare</Link>
          <Link to="/packages">Packages</Link>
          <Link to="/profile">Profile</Link>
        </div>
      </div>

      <h1 className="travel-heading">🌍 Dream Destinations</h1>

      <section className="travels-toolbar" aria-label="Destination filters">
        <div className="travels-filter-row">
          <input
            type="search"
            className="travels-filter-input search"
            placeholder="Search by city, state, country, or keyword..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search destinations"
          />

          <select
            className="travels-filter-select"
            value={category}
            onChange={(e) => updateFilter("category", e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {facets.categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            className="travels-filter-select"
            value={country}
            onChange={(e) => updateFilter("country", e.target.value)}
            aria-label="Filter by country"
          >
            <option value="">All Countries</option>
            {facets.countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="travels-filter-select"
            value={minRating}
            onChange={(e) => updateFilter("minRating", e.target.value)}
            aria-label="Minimum rating"
          >
            <option value="">Any Rating</option>
            <option value="4.5">4.5+ Stars</option>
            <option value="4.7">4.7+ Stars</option>
            <option value="4.8">4.8+ Stars</option>
          </select>

          <input
            type="number"
            min="0"
            className="travels-filter-input price"
            placeholder="Min $"
            value={minPrice}
            onChange={(e) => updateFilter("minPrice", e.target.value)}
            aria-label="Minimum estimated price"
          />
          <input
            type="number"
            min="0"
            className="travels-filter-input price"
            placeholder="Max $"
            value={maxPrice}
            onChange={(e) => updateFilter("maxPrice", e.target.value)}
            aria-label="Maximum estimated price"
          />

          <select
            className="travels-filter-select"
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => handleSortChange(e.target.value)}
            aria-label="Sort destinations"
          >
            <option value="featured:desc">Featured First</option>
            <option value="rating:desc">Highest Rated</option>
            <option value="pricePerNight:asc">Price: Low to High</option>
            <option value="pricePerNight:desc">Price: High to Low</option>
            <option value="title:asc">Name: A to Z</option>
          </select>
        </div>

        <div className="travels-meta-row">
          <p className="travels-result-count">
            {loading
              ? "Loading destinations..."
              : `Showing ${travels.length} of ${pagination.totalItems} curated destinations (Page ${pagination.currentPage} of ${pagination.totalPages})`}
          </p>

          <div className="travels-meta-actions">
            {hasActiveFilters && (
              <button
                type="button"
                className="travels-reset-btn"
                onClick={handleResetFilters}
              >
                Reset Filters
              </button>
            )}
            <div className="travels-view-toggle" role="group" aria-label="View mode">
              <button
                type="button"
                className={viewMode === "grid" ? "active" : ""}
                onClick={() => setViewMode("grid")}
              >
                Grid View
              </button>
              <button
                type="button"
                className={viewMode === "map" ? "active" : ""}
                onClick={() => setViewMode("map")}
              >
                Map View
              </button>
            </div>
          </div>
        </div>

        <AccessibilityFilter
          values={{
            wheelchairAccessible,
            accessibleAccommodation,
            publicTransport,
            familyFriendly,
            walkingIntensity,
          }}
          onChange={updateFilter}
        />
      </section>

      {error && (
        <div className="state-error-banner">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError("");
              setReloadNonce((n) => n + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}

      {loading && (
        <div className="travel-container" aria-busy="true">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div className="travel-card skeleton-card" key={idx}>
              <div className="skeleton-block skeleton-img" />
              <div className="card-content">
                <div className="skeleton-block skeleton-title" />
                <div className="skeleton-block skeleton-line" />
                <div className="skeleton-block skeleton-line short" />
                <div className="skeleton-block skeleton-btn" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && travels.length === 0 && (
        <div className="state-empty-box">
          <h3>No destinations match your current filters</h3>
          <p>
            Try adjusting your search query, price range, or category to explore
            more of Travelogia&apos;s curated locations.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              className="details-btn"
              onClick={handleResetFilters}
            >
              Clear All Filters
            </button>
          )}
        </div>
      )}

      {!loading && !error && travels.length > 0 && viewMode === "map" && (
        <div className="travels-map-section">
          <DestinationMap destinations={travels} height="540px" theme="light" />
        </div>
      )}

      {!loading && !error && travels.length > 0 && viewMode === "grid" && (
        <div className="travel-container">
          {travels.map((travel) => {
            const isFav = favoriteIds.has(travel._id);
            return (
              <Link
                to={`/travels/${travel._id}`}
                className="card-link"
                key={travel._id}
              >
                <div className="travel-card">
                  <div className="image-wrapper">
                    <img
                      src={travel.image?.url}
                      alt={travel.title}
                      className="travel-image"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      className={`favorite-btn ${isFav ? "active" : ""}`}
                      onClick={(e) => handleToggleFavorite(e, travel._id)}
                      disabled={favBusyId === travel._id}
                      aria-label={
                        isFav
                          ? `Remove ${travel.title} from favorites`
                          : `Add ${travel.title} to favorites`
                      }
                      title={isFav ? "Saved in Favorites" : "Save to Favorites"}
                    >
                      {isFav ? "♥" : "♡"}
                    </button>
                  </div>

                  <div className="card-content">
                    <h2 className="travel-title">{travel.title}</h2>

                    <p className="travel-location">
                      📍 {[travel.city, travel.state, travel.country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>

                    <p className="travel-description">{travel.description}</p>

                    <p className="travel-info">⭐ Rating: {travel.rating}/5</p>

                    <p className="travel-info">
                      🗓 Best Time: {travel.bestTimeToVisit}
                    </p>

                    <span className="travel-badge">{travel.category}</span>

                    <p className="travel-price">
                      Est. ${travel.pricePerNight} / night
                    </p>

                    <div className="travel-highlights">
                      {(travel.highlights || []).slice(0, 4).map((highlight, index) => (
                        <span key={index} className="highlight-item">
                          {highlight}
                        </span>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
                      <span className="details-btn" style={{ flex: 1 }}>
                        View Details
                      </span>
                      <button
                        type="button"
                        className="v2-btn v2-btn-secondary v2-btn-sm"
                        onClick={(e) => toggleCompare(e, travel._id)}
                        title="Select for side-by-side comparison"
                      >
                        {compareIds.includes(travel._id) ? "✓ Compare" : "+ Compare"}
                      </button>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!loading && !error && pagination.totalPages > 1 && (
        <nav className="travels-pagination" aria-label="Destination pages">
          <button
            type="button"
            disabled={!pagination.hasPreviousPage}
            onClick={() => {
              updateFilter("page", String(pagination.currentPage - 1));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            ← Previous
          </button>

          {pageNumbers.map((num) => (
            <button
              type="button"
              key={num}
              className={num === pagination.currentPage ? "active" : ""}
              onClick={() => {
                updateFilter("page", String(num));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            disabled={!pagination.hasNextPage}
            onClick={() => {
              updateFilter("page", String(pagination.currentPage + 1));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            Next →
          </button>
        </nav>
      )}

      {compareIds.length > 0 && (
        <div className="v2-compare-tray" role="region" aria-label="Destination comparison selection">
          <span>
            ⚖️ <strong>{compareIds.length}/3</strong> selected for comparison
          </span>
          <button
            type="button"
            className="v2-btn v2-btn-accent v2-btn-sm"
            disabled={compareIds.length < 2}
            onClick={() => navigate(`/compare?ids=${compareIds.join(",")}`)}
          >
            Compare Now →
          </button>
          <button
            type="button"
            className="v2-btn v2-btn-secondary v2-btn-sm"
            onClick={() => setCompareIds([])}
          >
            Clear
          </button>
        </div>
      )}

      {toast && (
        <div className="state-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
};

export default Travel;
