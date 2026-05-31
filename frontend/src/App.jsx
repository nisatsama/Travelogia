import { useEffect, useState } from "react";
import axios from "axios";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Travelogia from "./pages/Travel";
import Details from "./pages/Details";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import Packages from "./pages/Packages";
import PackageCategory from "./pages/PackageCategory";
import Contact from "./pages/Contact";
import Gallery from "./pages/Gallery";
import Booking from "./pages/Booking";
function App() {
  const [message, setMessage] = useState("");
  const [travels, setTravels] = useState([]);

  useEffect(() => {
    // Fetch message
    axios
      .get("https://travelogia-nfpk.onrender.com/")
      .then((res) => {
        setMessage(res.data.message);
      })
      .catch((err) => {
        console.log(err);
      });

    // Fetch travel data
    axios
      .get("https://travelogia-nfpk.onrender.com/travels")
      .then((res) => {
        setTravels(res.data);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/travels" element={<Travelogia allTravels={travels} />} />
        <Route path="/travels/:id" element={<Details />} />

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/profile" element={<Profile />} />

        <Route path="/packages" element={<Packages />} />

        <Route path="/contact" element={<Contact />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/booking" element={<Booking />} />
        <Route
          path="/packages/category/:category"
          element={<PackageCategory />}
        />
      </Routes>
    </Router>
  );
}

export default App;
