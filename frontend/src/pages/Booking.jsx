import { useLocation } from "react-router-dom";
import { useState } from "react";
import "./Booking.css";
import axios from "axios";
axios.get("/bookings");
function Booking() {
  const location = useLocation();
  const travel = location.state?.travel;

  const [travellers, setTravellers] = useState(1);
  const [duration, setDuration] = useState(1);
  const [date, setDate] = useState("");

  if (!travel) {
    return (
      <div className="booking-page">
        <h2>No Destination Selected</h2>
      </div>
    );
  }

  const totalCost = travellers * duration * travel.pricePerNight;

  const handleBooking = async () => {
    try {
      const token = localStorage.getItem("token");

      const bookingData = {
        travel: travel._id,
        destination: travel.title,
        travellers,
        duration,
        travelDate: date,
        totalCost,
      };

      const res = await axios.post(
        "http://localhost:8080/bookings",
        bookingData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (res.data.success) {
        alert("🎉 Booking Confirmed Successfully!");

        setTravellers(1);
        setDuration(1);
        setDate("");
      }
    } catch (err) {
      console.error(err);

      alert(err.response?.data?.message || "Failed to create booking");
    }
  };

  return (
    <div className="booking-page">
      <div className="booking-card">
        <h1>✈ Complete Your Booking</h1>

        <img
          src={travel.image.url}
          alt={travel.title}
          className="booking-image"
        />

        <h2>{travel.title}</h2>

        <p>
          📍 {travel.city}, {travel.country}
        </p>

        <div className="booking-form">
          <label>Number of Travellers</label>

          <input
            type="number"
            min="1"
            value={travellers}
            onChange={(e) => setTravellers(Number(e.target.value))}
          />

          <label>Travel Date</label>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <label>Duration (Days)</label>

          <input
            type="number"
            min="1"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />

          <div className="cost-box">
            <h3>Estimated Cost</h3>

            <p>${totalCost}</p>

            <small>
              {travellers} Traveller(s) × {duration} Day(s)
            </small>
          </div>

          <button className="confirm-btn" onClick={handleBooking}>
            ✅ Confirm Booking
          </button>
        </div>
      </div>
    </div>
  );
}

export default Booking;
