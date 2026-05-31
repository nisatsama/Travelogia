import "./Home.css";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";

function Home() {
  const [search, setSearch] = useState("");
  const [destinations, setDestinations] = useState([]);
  const [filteredDestinations, setFilteredDestinations] = useState([]);
  useEffect(() => {
    if (!search.trim()) {
      setFilteredDestinations([]);
      return;
    }

    const filtered = destinations.filter(
      (item) =>
        item.country?.toLowerCase().includes(search.toLowerCase()) ||
        item.city?.toLowerCase().includes(search.toLowerCase()) ||
        item.location?.toLowerCase().includes(search.toLowerCase()) ||
        item.title?.toLowerCase().includes(search.toLowerCase()),
    );

    setFilteredDestinations(filtered);
  }, [search, destinations]);
  useEffect(() => {
    axios
      .get("http://localhost:8080/travels")
      .then((res) => {
        setDestinations(res.data);
      })
      .catch((err) => console.log(err));
  }, []);
  // const handleSearch = () => {
  //   const filtered = destinations.filter(
  //     (item) =>
  //       item.place?.toLowerCase().includes(search.toLowerCase()) ||
  //       item.country?.toLowerCase().includes(search.toLowerCase()),
  //   );

  //   setFilteredDestinations(filtered);
  // };
  return (
    <div>
      {/* NAVBAR */}

      <nav>
        <div className="logo">Home</div>
        <div className="search-destination">
          <input
            type="text"
            placeholder="🌍 Search destinations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button type="button">🔍 Search</button>
        </div>

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
          <li>
            <Link to="/profile">Profile</Link>
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

          <Link to="/login" className="hero-btn">
            Start Your Journey
          </Link>
        </div>
      </section>
      {search.trim() && (
        <section className="search-results">
          <h2>Destinations</h2>

          <div className="destination-grid">
            {filteredDestinations.length > 0 ? (
              filteredDestinations.map((destination) => (
                <div className="destination-card" key={destination._id}>
                  <img src={destination.image?.url} alt={destination.title} />

                  <div className="destination-content">
                    <h3>{destination.title}</h3>

                    <p>
                      {destination.city}, {destination.country}
                    </p>

                    <p>${destination.pricePerNight}</p>

                    <Link to={`/travels/${destination._id}`}>View Details</Link>
                  </div>
                </div>
              ))
            ) : (
              <p>No destination found.</p>
            )}
          </div>
        </section>
      )}
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

          <div className="collage-item big">
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

          <div className="collage-item">
            <img
              src="https://images.unsplash.com/photo-1493558103817-58b2924bce98?q=80&w=1974&auto=format&fit=crop"
              alt="Bali"
            />

            <div className="overlay">
              <h3>Bali</h3>
            </div>
          </div>

          <div className="collage-item">
            <img
              src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1974&auto=format&fit=crop"
              alt="Maldives"
            />

            <div className="overlay">
              <h3>Maldives</h3>
            </div>
          </div>

          {/* WIDE */}

          <div className="collage-item wide">
            <img
              src="https://images.unsplash.com/photo-1527631746610-bca00a040d60?q=80&w=1974&auto=format&fit=crop"
              alt="Paris"
            />

            <div className="overlay">
              <h3>Paris Streets</h3>
            </div>
          </div>

          {/* EXTRA */}

          <div className="collage-item">
            <img
              src="https://images.unsplash.com/photo-1468413253725-0d5181091126?q=80&w=1974&auto=format&fit=crop"
              alt="Thailand"
            />

            <div className="overlay">
              <h3>Thailand</h3>
            </div>
          </div>

          <div className="collage-item">
            <img
              src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1974&auto=format&fit=crop"
              alt="Canadian Lakes"
            />

            <div className="overlay">
              <h3>Canadian Lakes</h3>
            </div>
          </div>

          <div className="collage-item wide">
            <img
              src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=1970&auto=format&fit=crop"
              alt="Venice"
            />

            <div className="overlay">
              <h3>Venice</h3>
              <p>Romantic gondola rides</p>
            </div>
          </div>

          <div className="collage-item">
            <img
              src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=1974&auto=format&fit=crop"
              alt="Road Trips"
            />

            <div className="overlay">
              <h3>Road Trips</h3>
            </div>
          </div>

          <div className="collage-item">
            <img
              src="https://images.unsplash.com/photo-1483683804023-6ccdb62f86ef?q=80&w=1974&auto=format&fit=crop"
              alt="Tokyo"
            />

            <div className="overlay">
              <h3>Tokyo Nights</h3>
            </div>
          </div>

          {/* BIG */}

          <div className="collage-item big">
            <img
              src="https://images.unsplash.com/photo-1493246507139-91e8fad9978e?q=80&w=1974&auto=format&fit=crop"
              alt="Norway"
            />

            <div className="overlay">
              <h3>Norway Fjords</h3>
              <p>Epic nature beyond imagination</p>
            </div>
          </div>

          <div className="collage-item">
            <img
              src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=1974&auto=format&fit=crop"
              alt="Flights"
            />

            <div className="overlay">
              <h3>Adventure Flights</h3>
            </div>
          </div>

          <div className="collage-item">
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
        <p>© 2026 Home | Designed for dream travelers ✈️</p>
      </footer>
    </div>
  );
}

export default Home;
