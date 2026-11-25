import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import TravelogiaChat from "./components/TravelogiaChat";
import "./components/StateViews.css";
import "./styles/TravelogiaV2.css";

import Home from "./pages/Home";
import Travelogia from "./pages/Travel";
import Details from "./pages/Details";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import AdminDashboard from "./pages/AdminDashboard";
import Packages from "./pages/Packages";
import PackageCategory from "./pages/PackageCategory";
import Contact from "./pages/Contact";
import Gallery from "./pages/Gallery";
import Booking from "./pages/Booking";
import TripBuilder from "./pages/TripBuilder";
import BudgetOptimizer from "./pages/BudgetOptimizer";
import CollaborativeTrips from "./pages/CollaborativeTrips";
import RoutePlanner from "./pages/RoutePlanner";
import HiddenGems from "./pages/HiddenGems";
import DestinationCompare from "./pages/DestinationCompare";
import TravelJournal from "./pages/TravelJournal";
import PackingAssistant from "./pages/PackingAssistant";
import PriceWatcher from "./pages/PriceWatcher";

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/travels" element={<Travelogia />} />
          <Route path="/travels/:id" element={<Details />} />

          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-profile"
            element={
              <ProtectedRoute requireAdmin>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="/packages" element={<Packages />} />
          <Route
            path="/packages/category/:category"
            element={<PackageCategory />}
          />

          <Route path="/contact" element={<Contact />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/booking" element={<Booking />} />

          {/* Travelogia 2.0 Smart Planning Suite */}
          <Route path="/trip-builder" element={<TripBuilder />} />
          <Route path="/budget-optimizer" element={<BudgetOptimizer />} />
          <Route path="/collaborate" element={<CollaborativeTrips />} />
          <Route path="/route-planner" element={<RoutePlanner />} />
          <Route path="/hidden-gems" element={<HiddenGems />} />
          <Route path="/compare" element={<DestinationCompare />} />
          <Route path="/journal" element={<TravelJournal />} />
          <Route path="/packing" element={<PackingAssistant />} />
          <Route path="/price-watcher" element={<PriceWatcher />} />
        </Routes>
        <TravelogiaChat />
      </Router>
    </AuthProvider>
  );
}

export default App;
