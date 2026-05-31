import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  FaUserCircle,
  FaHeart,
  FaSuitcaseRolling,
  FaSignOutAlt,
  FaCalendarCheck,
  FaEdit,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import "./Profile.css";

const Profile = () => {
  const [user, setUser] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          navigate("/login");
          return;
        }

        const res = await axios.get(
          "https://travelogia-nfpk.onrender.com/profile",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        setUser(res.data.user);
        setFavorites(res.data.favorites || []);
        setBookings(res.data.bookings || []);
      } catch (err) {
        console.error("Profile Error:", err);
        console.error("Backend Response:", err.response?.data);

        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("role");
          navigate("/login");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  };

  if (loading) {
    return <div className="Profile-loading">Loading Profile...</div>;
  }

  if (!user) {
    return <div className="Profile-loading">Unable to load profile.</div>;
  }

  return (
    <div className="profile-Profile">
      {/* PROFILE HEADER */}
      <div className="profile-card">
        <div className="profile-avatar">
          <FaUserCircle />
        </div>

        <div className="profile-info">
          <h1>{user.username}</h1>
          <p>{user.email}</p>
          <span className="badge">✨ Premium Traveler</span>
        </div>

        <div className="profile-actions">
          <button className="edit-btn">
            <FaEdit />
            Edit Profile
          </button>

          <button className="logout-btn" onClick={handleLogout}>
            <FaSignOutAlt />
            Logout
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="stats-grid">
        <div className="stat-card">
          <FaSuitcaseRolling />
          <h2>{bookings.length}</h2>
          <p>Total Bookings</p>
        </div>

        <div className="stat-card">
          <FaHeart />
          <h2>{favorites.length}</h2>
          <p>Favorites</p>
        </div>

        <div className="stat-card">
          <FaCalendarCheck />
          <h2>
            {
              bookings.filter(
                (booking) =>
                  booking.date && new Date(booking.date) > new Date(),
              ).length
            }
          </h2>
          <p>Upcoming Trips</p>
        </div>
      </div>

      {/* BOOKINGS */}
      <section className="Profile-section">
        <h2>✈ My Bookings</h2>

        {bookings.length === 0 ? (
          <p>No bookings yet.</p>
        ) : (
          <div className="booking-grid">
            {bookings.map((booking) => (
              <div className="booking-card" key={booking._id}>
                <img
                  src={
                    booking.travel?.image?.url ||
                    "https://via.placeholder.com/300x200"
                  }
                  alt={booking.travel?.title || "Travel"}
                />

                <h3>{booking.travel?.title}</h3>

                <p>📍 {booking.travel?.city}</p>

                <p>
                  📅{" "}
                  {booking.date
                    ? new Date(booking.date).toLocaleDateString()
                    : "N/A"}
                </p>

                <p>👥 Travelers: {booking.travelers}</p>

                <p>⏳ Duration: {booking.duration} days</p>

                <p>💰 Total Cost: ${booking.totalCost}</p>

                <span className="confirmed">Confirmed</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* FAVORITES */}
      <section className="Profile-section">
        <h2>❤️ Favorite Destinations</h2>

        {favorites.length === 0 ? (
          <p>No favorites yet.</p>
        ) : (
          <div className="favorites-grid">
            {favorites.map((favorite) => (
              <div className="favorite-card" key={favorite._id}>
                <img
                  src={
                    favorite.travel?.image?.url ||
                    "https://via.placeholder.com/300x200"
                  }
                  alt={favorite.travel?.title || "Destination"}
                />

                <h3>{favorite.travel?.title}</h3>

                <p>
                  📍 {favorite.travel?.city}, {favorite.travel?.country}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Profile;
