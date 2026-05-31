import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./Travel.css";

const Travel = ({ allTravels }) => {
  return (
    <div className="travel-body">
      <h1 className="travel-heading">🌍 Dream Destinations</h1>

      <div className="travel-container">
        {allTravels.map((travel) => (
          <Link
            to={`/travels/${travel._id}`}
            className="card-link"
            key={travel._id}
          >
            <div className="travel-card">
              <div className="image-wrapper">
                <img
                  src={travel.image.url}
                  alt={travel.title}
                  className="travel-image"
                />
              </div>

              <div className="card-content">
                <h2 className="travel-title">{travel.title}</h2>

                <p className="travel-location">
                  📍 {travel.city}, {travel.country}
                </p>

                <p className="travel-description">{travel.description}</p>

                <p className="travel-info">⭐ Rating: {travel.rating}/5</p>

                <p className="travel-info">
                  🗓 Best Time: {travel.bestTimeToVisit}
                </p>

                <span className="travel-badge">{travel.category}</span>

                <p className="travel-price">$ {travel.pricePerNight} / night</p>

                <div className="travel-highlights">
                  {travel.highlights.map((highlight, index) => (
                    <span key={index} className="highlight-item">
                      {highlight}
                    </span>
                  ))}
                </div>

                <button className="details-btn">View Details</button>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Travel;
