const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// MODELS
const Booking = require("./model/Booking");
const User = require("./model/User");
const Travel = require("./model/travel");
const Favorite = require("./model/Favourite");

// MIDDLEWARE & ROUTES
const auth = require("./middleware/auth");
const adminOnly = require("./middleware/admin");
const packageRoutes = require("./routes/packageRoutes");

// CONFIG
dotenv.config();

// MIDDLEWARE SETUP
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", "https://travelogia.vercel.app"],
    credentials: true,
  }),
);

app.use("/packages", packageRoutes);

// DATABASE CONNECTION
const MONGO_URL = process.env.MONGO_URL;
mongoose
  .connect(MONGO_URL)
  .then(() => {
    console.log("✅ Connected to DB");
  })
  .catch((err) => {
    console.log("❌ Error connecting to DB", err);
  });

// HOME ROUTE
app.get("/", (req, res) => {
  res.json({
    message: "Backend connected successfully 🚀",
  });
});

// ============================
// AUTH ROUTES (SIGNUP & LOGIN)
// ============================

// SIGNUP
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password, role = "user" } = req.body;

    // Check existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      role,
    });

    await user.save();

    res.status(201).json({
      message: "User created successfully",
      role: user.role,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Check selected role
    if (role && user.role !== role) {
      return res.status(403).json({
        message: `This account is registered as ${user.role}, not ${role}`,
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" },
    );

    res.status(200).json({
      token,
      role: user.role,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// TRAVEL ROUTES
// ============================

// GET ALL TRAVELS
app.get("/travels", async (req, res) => {
  try {
    const allTravels = await Travel.find({});
    res.json(allTravels);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error fetching data" });
  }
});

// GET SINGLE TRAVEL
app.get("/travels/:id", async (req, res) => {
  try {
    const travel = await Travel.findById(req.params.id);
    if (!travel) {
      return res.status(404).json({ message: "Travel not found" });
    }
    res.json(travel);
  } catch (err) {
    res.status(500).json({ message: "Error fetching travel" });
  }
});

// CREATE TRAVEL PLACE (Logged in users only)
app.post("/travels", auth, async (req, res) => {
  try {
    // Implement actual travel package creation logic here if needed
    res.status(200).json({
      message: "Authenticated user access granted",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE TRAVEL PLACE (Admin only)
app.delete("/travels/:id", auth, adminOnly, async (req, res) => {
  try {
    const deletedTravel = await Travel.findByIdAndDelete(req.params.id);
    if (!deletedTravel) {
      return res.status(404).json({ message: "Travel not found" });
    }
    res.status(200).json({ message: "Travel deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================
// FAVORITES ROUTES
// ============================

// ADD TO FAVORITES
app.post("/favorites", auth, async (req, res) => {
  try {
    const { travelId } = req.body;

    // Check if already in favorites to prevent duplicates
    const existing = await Favorite.findOne({
      user: req.user.id,
      travel: travelId,
    });

    if (existing) {
      return res.status(400).json({ message: "Already in favorites" });
    }

    const favorite = new Favorite({
      user: req.user.id,
      travel: travelId,
    });

    await favorite.save();

    res.status(201).json({ message: "Added to favorites" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET USER FAVORITES
app.get("/favorites", auth, async (req, res) => {
  try {
    const favorites = await Favorite.find({ user: req.user.id }).populate(
      "travel",
    );
    res.json(favorites);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================
// BOOKINGS ROUTES
// ============================

// CREATE BOOKING
app.post("/bookings", auth, async (req, res) => {
  try {
    // Safely supports both payloads variants you passed in your snippets
    const {
      travelId,
      travel,
      destination,
      travelers,
      travellers,
      duration,
      totalCost,
      date,
      travelDate,
    } = req.body;

    const booking = new Booking({
      user: req.user.id,
      travel: travelId || travel,
      destination,
      travelers: travelers || travellers,
      duration,
      totalCost,
      date: date || travelDate,
    });

    await booking.save();

    res.status(201).json({
      success: true,
      message: "Booking confirmed",
      booking,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// GET USER BOOKINGS
app.get("/bookings", auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id }).populate(
      "travel",
    );
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================
// USER Profile ROUTE
// ============================

app.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Fetch live user bookings and favorites details
    const bookings = await Booking.find({ user: req.user.id }).populate(
      "travel",
    );
    const favorites = await Favorite.find({ user: req.user.id }).populate(
      "travel",
    );

    res.status(200).json({
      user,
      favorites,
      bookings,
      // Leaving your mock stats object here for your frontend logic
      stats: {
        packagesViewed: 12,
        tripsBooked: bookings.length,
        wishlistItems: favorites.length,
        countriesVisited: 3,
      },
    });
  } catch (error) {
    console.error("PROFILE ERROR:");
    console.error(error);

    res.status(500).json({
      message: error.message,
      stack: error.stack,
    });
  }
});

// ============================
// SERVER ENGINE
// ============================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
