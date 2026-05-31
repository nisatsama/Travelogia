import { useNavigate, useParams } from "react-router-dom";

import { useEffect, useState } from "react";
import axios from "axios";
import "./Details.css";

const Details = () => {
  const { id } = useParams();
  const [travel, setTravel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    axios
      .get(`http://localhost:8080/travels/${id}`)
      .then((res) => {
        setTravel(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load travel details");
        setLoading(false);
      });
  }, [id]);

  if (loading)
    return (
      <div className="details-body">
        <div className="container">
          <p>Loading...</p>
        </div>
      </div>
    );
  if (error)
    return (
      <div className="details-body">
        <div className="container">
          <p>{error}</p>
        </div>
      </div>
    );
  if (!travel) return null;
  const handleFavorite = async () => {
    try {
      const token = localStorage.getItem("token");

      await axios.post(
        "http://localhost:8080/favorites",
        {
          travelId: travel._id,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      alert("❤️ Added to Favorites");
    } catch (err) {
      console.error(err);
      alert("Failed to add to favorites");
    }
  };
  return (
    <div className="details-body">
      <div className="container">
        {/* HERO SECTION */}

        <div className="hero">
          <img src={travel.image.url} alt={travel.title} />

          <div className="overlay"></div>

          <div className="hero-content">
            <h1 className="title">{travel.title}</h1>

            <p className="location">
              📍 {travel.city}, {travel.country}
            </p>
          </div>
        </div>

        {/* CONTENT */}

        <div className="content">
          <p className="description">{travel.description}</p>

          {/* INFO CARDS */}

          <div className="info-grid">
            <div className="card">
              <h3>💰 Price Per Night</h3>
              <p>$ {travel.pricePerNight}</p>
            </div>

            <div className="card">
              <h3>⭐ Guest Rating</h3>
              <p>{travel.rating} / 5</p>
            </div>

            <div className="card">
              <h3>🏝 Category</h3>
              <p>{travel.category}</p>
            </div>

            <div className="card">
              <h3>🌤 Best Time To Visit</h3>
              <p>{travel.bestTimeToVisit}</p>
            </div>
          </div>

          {/* USER BUTTONS */}

          <div className="action-buttons">
            <button
              className="action-btn book-btn"
              onClick={() =>
                navigate("/booking", {
                  state: {
                    travel,
                  },
                })
              }
            >
              ✈ Book Tour
            </button>

            <button className="action-btn fav-btn" onClick={handleFavorite}>
              ❤ Add To Favorites
            </button>
          </div>

          {/* ADMIN BUTTONS */}

          {/*
          <div className="admin-buttons">

            <button className="admin-btn edit-btn">
              ✏ Edit Destination
            </button>

            <button className="admin-btn delete-btn">
              🗑 Delete Destination
            </button>

          </div>
          */}

          {/* HIGHLIGHTS */}

          <div className="glass-section">
            <h2 className="section-title">✨ Highlights</h2>

            <div className="tag-container">
              {travel.highlights.map((highlight, index) => (
                <span className="tag" key={index}>
                  {highlight}
                </span>
              ))}
            </div>
          </div>

          {/* AMENITIES */}

          <div className="glass-section">
            <h2 className="section-title">🛎 Premium Amenities</h2>

            <div className="tag-container">
              {travel.amenities.map((amenity, index) => (
                <span className="tag amenity-tag" key={index}>
                  {amenity}
                </span>
              ))}
            </div>
          </div>

          {/* BACK BUTTON */}

          {/* <button className="back-btn">← Back to Destinations</button> */}
        </div>
      </div>
    </div>
  );
};

export default Details;
