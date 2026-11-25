import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import "./Package.css";

function PackageCategory() {
  const { category } = useParams();

  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get(
          `/packages/category/${encodeURIComponent(category)}`,
        );
        if (active) {
          setPackages(res.data?.data || []);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(
            getErrorMessage(err, "Unable to load packages for this category."),
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [category, reloadNonce]);

  const handleRetry = () => {
    setLoading(true);
    setError("");
    setReloadNonce((n) => n + 1);
  };

  return (
    <div className="packages-page">
      <div style={{ position: "relative", zIndex: 2, marginBottom: "24px" }}>
        <Link
          to="/packages"
          style={{
            color: "#60a5fa",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          ← Back to All Packages
        </Link>
      </div>

      <h1>{category} Packages</h1>
      <p>
        Curated {category.toLowerCase()} itineraries with estimated pricing to help
        you plan your next unforgettable getaway.
      </p>

      {loading && (
        <div className="state-loading-inline dark" role="status">
          <span className="state-spinner" />
          <span>Loading {category} packages...</span>
        </div>
      )}

      {error && (
        <div className="state-error-banner dark">
          <p>{error}</p>
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && packages.length === 0 && (
        <div className="state-empty-box dark">
          <h3>No packages found in {category}</h3>
          <p>
            Explore our full destination catalogue or check another package category.
          </p>
          <Link to="/travels" className="package-btn">
            Explore Destinations
          </Link>
        </div>
      )}

      {!loading && !error && packages.length > 0 && (
        <div className="package-grid">
          {packages.map((item) => (
            <div className="package-card" key={item._id}>
              {item.image?.url && (
                <img
                  src={item.image.url}
                  alt={item.title}
                  style={{
                    width: "100%",
                    height: "210px",
                    objectFit: "cover",
                    borderRadius: "18px",
                    marginBottom: "20px",
                  }}
                />
              )}

              <h3>{item.title}</h3>
              <span>{item.description}</span>

              <div
                style={{
                  marginTop: "18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  color: "#60a5fa",
                  fontWeight: 700,
                  fontSize: "1.15rem",
                }}
              >
                <span>Est. ${item.price}</span>
                {item.duration && (
                  <span style={{ fontSize: "0.9rem", color: "#cbd5e1" }}>
                    {item.duration}
                  </span>
                )}
              </div>

              <Link
                to={`/travels?search=${encodeURIComponent(item.location || "")}`}
                className="package-btn"
                style={{ textDecoration: "none" }}
              >
                Explore Related Stays
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PackageCategory;
