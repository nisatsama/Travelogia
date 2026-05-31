import { useNavigate } from "react-router-dom";
import "./Package.css";

const categories = [
  {
    title: "Solo Trips",
    icon: "🎒",
    slug: "Solo",
  },
  {
    title: "Honeymoon Escapes",
    icon: "❤️",
    slug: "Honeymoon",
  },
  {
    title: "Family Tours",
    icon: "👨‍👩‍👧‍👦",
    slug: "Family",
  },
  {
    title: "School Excursions",
    icon: "🚌",
    slug: "School",
  },
  {
    title: "Adventure Packages",
    icon: "⛰️",
    slug: "Adventure",
  },
  {
    title: "Luxury Vacations",
    icon: "👑",
    slug: "Luxury",
  },
];

function Packages() {
  const navigate = useNavigate();

  return (
    <div className="packages-page">
      <div className="packages-header">
        <h1>✈️ Explore Travel Packages</h1>

        <p>
          Discover handpicked journeys designed for every traveler. Whether
          you're planning a romantic honeymoon, an exciting solo adventure, or a
          memorable family getaway, we have the perfect package waiting for you.
        </p>
      </div>

      <div className="package-grid">
        {categories.map((cat) => (
          <div
            key={cat.slug}
            className="package-card"
            onClick={() => navigate(`/packages/category/${cat.slug}`)}
          >
            <div className="package-icon">{cat.icon}</div>

            <h3>{cat.title}</h3>

            <span>
              Explore curated experiences, premium stays, exciting activities,
              and unforgettable memories.
            </span>

            <div className="package-btn">Explore Packages →</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Packages;
