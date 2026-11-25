import "./Home.css";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import RecommendationSection from "../components/RecommendationSection";

function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const query = search.trim();
    if (!query) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const res = await api.get("/travels", {
          params: { search: query, limit: 8 },
        });
        if (!cancelled) {
          setResults(res.data?.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          setSearchError(getErrorMessage(err, "Unable to search destinations right now."));
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const query = search.trim();
    if (query) {
      navigate(`/travels?search=${encodeURIComponent(query)}`);
    } else {
      navigate("/travels");
    }
  };

  return (
    <div>
      {/* NAVBAR */}

      <nav>
        <div className="logo">
          Travel<span>ogia</span>
        </div>
        <form className="search-destination" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="🌍 Search destinations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search destinations"
          />

          <button type="submit">🔍 Search</button>
        </form>

        <ul>
          <li>
            <Link to="/travels">Destinations</Link>
          </li>

          <li>
            <Link to="/packages">Packages</Link>
          </li>

          <li>
            <Link to="/gallery">Gallery</Link>
          </li>

          <li>
            <Link to="/contact">Contact</Link>
          </li>
          {user?.role === "admin" && (
            <li>
              <Link to="/admin-profile">Admin</Link>
            </li>
          )}
          <li>
            {user ? (
              <Link to="/profile">Profile</Link>
            ) : (
              <Link to="/login">Login</Link>
            )}
          </li>
        </ul>
      </nav>

      {/* HERO */}

      <section className="hero">
        <div className="hero-content">
          <h1>Explore The World Beyond Imagination</h1>

          <p>
            Discover breathtaking beaches, magical mountains, luxury escapes and
            unforgettable adventures curated for dream travelers.
          </p>

          <Link to={user ? "/travels" : "/login"} className="hero-btn">
            {user ? "Explore Destinations" : "Start Your Journey"}
          </Link>
        </div>
      </section>

      {/* TRAVELOGIA 2.0 SMART PLANNING SUITE RIBBON */}
      <div className="v2-home-ribbon" aria-label="Travelogia 2.0 Smart Tools">
        <span className="v2-home-ribbon-label">Travelogia 2.0:</span>
        <Link to="/trip-builder">✨ AI Trip Builder</Link>
        <Link to="/budget-optimizer">💰 Budget Optimizer</Link>
        <Link to="/collaborate">🤝 Collaborative Trips</Link>
        <Link to="/route-planner">🗺️ Route Optimizer</Link>
        <Link to="/hidden-gems">🌿 Hidden Gems</Link>
        <Link to="/compare">⚖️ Compare</Link>
        <Link to="/journal">📔 Travel Journal</Link>
        <Link to="/packing">🎒 Smart Packing</Link>
        <Link to="/price-watcher">📉 Price Watch</Link>
      </div>

      {search.trim() && (
        <section className="search-results">
          <h2>Search Results for &ldquo;{search.trim()}&rdquo;</h2>

          {searching && (
            <div className="state-loading-inline" role="status">
              <span className="state-spinner" />
              <span>Searching curated destinations...</span>
            </div>
          )}

          {searchError && (
            <div className="state-error-banner">
              <p>{searchError}</p>
            </div>
          )}

          {!searching && !searchError && (
            <div className="destination-grid">
              {results.length > 0 ? (
                results.map((destination) => (
                  <div className="destination-card" key={destination._id}>
                    <img
                      src={destination.image?.url}
                      alt={destination.title}
                      loading="lazy"
                    />

                    <div className="destination-content">
                      <h3>{destination.title}</h3>

                      <p>
                        {destination.city}, {destination.country}
                      </p>

                      <p>Est. ${destination.pricePerNight} / night</p>

                      <Link to={`/travels/${destination._id}`}>View Details</Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="state-empty-box">
                  <h3>No destinations matched &ldquo;{search.trim()}&rdquo;</h3>
                  <p>Try searching by city, country, state, or category like Beach or Mountains.</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* PERSONALIZED RECOMMENDATIONS (Feature 8) */}
      <RecommendationSection />

      {/* TRAVEL MOMENTS */}

      <section className="collage-section">
        <div className="section-title">
          <h2>Travel Moments</h2>

          <p>
            Beautiful destinations captured from real adventures around the
            world.
          </p>
        </div>

        <div className="collage-grid">
          {/* BIG */}

          <div
            className="collage-item big"
            onClick={() => navigate("/travels?search=Swiss")}
          >
            <img
              src="https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1974&auto=format&fit=crop"
              alt="Swiss Alps"
            />

            <div className="overlay">
              <h3>Swiss Alps</h3>
              <p>Snowy mountains and dreamy landscapes</p>
            </div>
          </div>

          {/* NORMAL */}

          <div
            className="collage-item"
            onClick={() => navigate("/travels?search=Bali")}
          >
            <img
              src="https://images.unsplash.com/photo-1493558103817-58b2924bce98?q=80&w=1974&auto=format&fit=crop"
              alt="Bali"
            />

            <div className="overlay">
              <h3>Bali</h3>
            </div>
          </div>

          <div
            className="collage-item"
            onClick={() => navigate("/travels?search=Maldives")}
          >
            <img
              src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1974&auto=format&fit=crop"
              alt="Maldives"
            />

            <div className="overlay">
              <h3>Maldives</h3>
            </div>
          </div>

          {/* WIDE */}

          <div
            className="collage-item wide"
            onClick={() => navigate("/travels?search=Paris")}
          >
            <img
              src="https://images.unsplash.com/photo-1527631746610-bca00a040d60?q=80&w=1974&auto=format&fit=crop"
              alt="Paris"
            />

            <div className="overlay">
              <h3>Paris Streets</h3>
            </div>
          </div>

          {/* EXTRA */}

          <div
            className="collage-item"
            onClick={() => navigate("/travels?search=Phuket")}
          >
            <img
              src="https://images.unsplash.com/photo-1468413253725-0d5181091126?q=80&w=1974&auto=format&fit=crop"
              alt="Thailand"
            />

            <div className="overlay">
              <h3>Thailand</h3>
            </div>
          </div>

          <div
            className="collage-item"
            onClick={() => navigate("/travels?search=Banff")}
          >
            <img
              src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1974&auto=format&fit=crop"
              alt="Canadian Lakes"
            />

            <div className="overlay">
              <h3>Canadian Lakes</h3>
            </div>
          </div>

          <div
            className="collage-item wide"
            onClick={() => navigate("/travels?search=Venice")}
          >
            <img
              src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=1970&auto=format&fit=crop"
              alt="Venice"
            />

            <div className="overlay">
              <h3>Venice</h3>
              <p>Romantic gondola rides</p>
            </div>
          </div>

          <div
            className="collage-item"
            onClick={() => navigate("/travels?search=Ladakh")}
          >
            <img
              src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=1974&auto=format&fit=crop"
              alt="Road Trips"
            />

            <div className="overlay">
              <h3>Road Trips</h3>
            </div>
          </div>

          <div
            className="collage-item"
            onClick={() => navigate("/travels?search=Tokyo")}
          >
            <img
              src="https://images.unsplash.com/photo-1483683804023-6ccdb62f86ef?q=80&w=1974&auto=format&fit=crop"
              alt="Tokyo"
            />

            <div className="overlay">
              <h3>Tokyo Nights</h3>
            </div>
          </div>

          {/* BIG */}

          <div
            className="collage-item big"
            onClick={() => navigate("/travels?search=Norway")}
          >
            <img
              src="https://images.unsplash.com/photo-1493246507139-91e8fad9978e?q=80&w=1974&auto=format&fit=crop"
              alt="Norway"
            />

            <div className="overlay">
              <h3>Norway Fjords</h3>
              <p>Epic nature beyond imagination</p>
            </div>
          </div>

          <div
            className="collage-item"
            onClick={() => navigate("/travels?category=Adventure")}
          >
            <img
              src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=1974&auto=format&fit=crop"
              alt="Flights"
            />

            <div className="overlay">
              <h3>Adventure Escapes</h3>
            </div>
          </div>

          <div
            className="collage-item"
            onClick={() => navigate("/travels?category=Beach")}
          >
            <img
              src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1974&auto=format&fit=crop"
              alt="Tropical Escape"
            />

            <div className="overlay">
              <h3>Tropical Escape</h3>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}

      <footer>
        <p>© 2026 Travelogia | Designed for dream travelers ✈️</p>
      </footer>
    </div>
  );
}

export default Home;
