import React from "react";
import "./Gallery.css";

const galleryImages = [
  {
    image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
    title: "Majestic Mountains",
    //category: "Nature",
  },
  {
    image: "https://images.unsplash.com/photo-1469474968028-56623f02e42e",
    title: "Swiss Alps Adventure",
    //category: "Successful Trip",
  },
  {
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
    title: "Tropical Paradise",
    //category: "Beach",
  },
  {
    image: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1",
    title: "Road To Freedom",
    //category: "Travel Experience",
  },
  {
    image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c",
    title: "Dubai Skyline",
    //category: "Infrastructure",
  },

  {
    image: "https://images.unsplash.com/photo-1488646953014-85cb44e25828",
    title: "European Streets",
    //category: "Successful Trip",
  },
  {
    image: "https://images.unsplash.com/photo-1527631746610-bca00a040d60",
    title: "Northern Lights",
    //category: "Nature",
  },
  {
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34",
    title: "Paris Memories",
    //category: "Culture",
  },
  {
    image: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b",
    title: "Global Connectivity",
    //category: "Infrastructure",
  },
  {
    image: "https://images.unsplash.com/photo-1530521954074-e64f6810b32d",
    title: "African Safari",
    //category: "Wildlife",
  },
  {
    image: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d",
    title: "Traditional Festival",
    //category: "Culture",
  },
  {
    image: "https://images.unsplash.com/photo-1516483638261-f4dbaf036963",
    title: "Modern Architecture",
    //category: "Infrastructure",
  },
  {
    image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470",
    title: "God's Gifted Beauty",
    //category: "Nature",
  },
  {
    image: "https://images.unsplash.com/photo-1521295121783-8a321d551ad2",
    title: "World Explorer",
    //category: "Adventure",
  },
  {
    image: "https://images.unsplash.com/photo-1482192596544-9eb780fc7f66",
    title: "Mountain Escape",
    //category: "Nature",
  },
  {
    image: "https://images.unsplash.com/photo-1514565131-fce0801e5785",
    title: "Singapore Nights",
    //category: "Infrastructure",
  },
  {
    image: "https://images.unsplash.com/photo-1494526585095-c41746248156",
    title: "Cultural Diversity",
    //category: "Culture",
  },
  {
    image: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800",
    title: "Dream Destination",
    //category: "Successful Trip",
  },
  {
    image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
    title: "Natural Wonder",
    //category: "Nature",
  },
];

const Gallery = () => {
  return (
    <div className="gallery-page">
      <div className="gallery-header">
        <h1>Travel Memories Around The World 🌎</h1>
        <p>
          Discover breathtaking landscapes, diverse cultures, iconic
          infrastructure, and unforgettable journeys curated by Travelogia.
        </p>
      </div>

      <div className="gallery-grid">
        {galleryImages.map((item, index) => (
          <div className="gallery-card" key={index}>
            <img src={item.image} alt={item.title} />
            <div className="gallery-overlay">
              <h3>{item.title}</h3>
              <span>{item.category}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Gallery;
