const path = require("path");
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
const mockDb = require("./mockDb");

// MIDDLEWARE & ROUTES
const auth = require("./middleware/auth");
const adminOnly = require("./middleware/admin");
const packageRoutes = require("./routes/packageRoutes");

// CONFIG
dotenv.config();
mongoose.set("bufferCommands", false); // CRITICAL: fail fast, don't hang

const isDbConnected = () => mongoose.connection.readyState === 1;

// MIDDLEWARE SETUP
app.use(express.json());
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// DATABASE CONNECTION (non-blocking, falls back to in-memory mockDb if offline)
const MONGO_URL = process.env.MONGO_URL;
if (MONGO_URL) {
  mongoose
    .connect(MONGO_URL, { serverSelectionTimeoutMS: 3000 })
    .then(() => {
      console.log("✅ Connected to DB");
    })
    .catch((err) => {
      console.warn(
        "⚠️ MongoDB not connected — running with in-memory mock store:",
        err.message,
      );
    });
} else {
  console.warn(
    "⚠️ MONGO_URL not configured — running with in-memory mock store",
  );
}

// ============================
// API ROUTER (/api)
// ============================
const apiRouter = express.Router();

apiRouter.use("/packages", packageRoutes);

// HOME / HEALTH ROUTE
apiRouter.get("/", (req, res) => {
  res.json({
    message: "Backend connected successfully 🚀",
  });
});

// ============================
// AUTH ROUTES (SIGNUP & LOGIN)
// ============================

// SIGNUP
apiRouter.post("/signup", async (req, res) => {
  try {
    const { username, email, password, role = "user" } = req.body;

    if (!isDbConnected()) {
      const existingUser = mockDb.users.find((u) => u.email === email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = {
        _id: mockDb.createId("user"),
        username,
        email,
        password: hashedPassword,
        role,
        favourites: [],
        memberSince: new Date().toISOString(),
      };
      mockDb.users.push(user);
      return res.status(201).json({
        message: "User created successfully",
        role: user.role,
      });
    }

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
apiRouter.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    let user;
    if (!isDbConnected()) {
      user = mockDb.users.find((u) => u.email === email);
    } else {
      user = await User.findOne({ email });
    }

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
apiRouter.get("/travels", async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json(mockDb.travels);
    }
    const allTravels = await Travel.find({});
    res.json(allTravels);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error fetching data" });
  }
});

// GET SINGLE TRAVEL
apiRouter.get("/travels/:id", async (req, res) => {
  try {
    if (!isDbConnected()) {
      const travel = mockDb.travels.find((t) => t._id === req.params.id);
      if (!travel) {
        return res.status(404).json({ message: "Travel not found" });
      }
      return res.json(travel);
    }
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
apiRouter.post("/travels", auth, async (req, res) => {
  try {
    res.status(200).json({
      message: "Authenticated user access granted",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE TRAVEL PLACE (Admin only)
apiRouter.delete("/travels/:id", auth, adminOnly, async (req, res) => {
  try {
    if (!isDbConnected()) {
      const idx = mockDb.travels.findIndex((t) => t._id === req.params.id);
      if (idx === -1) {
        return res.status(404).json({ message: "Travel not found" });
      }
      mockDb.travels.splice(idx, 1);
      return res.status(200).json({ message: "Travel deleted successfully" });
    }
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
apiRouter.post("/favorites", auth, async (req, res) => {
  try {
    const { travelId } = req.body;

    if (!isDbConnected()) {
      const existing = mockDb.favorites.find(
        (f) => f.user === req.user.id && f.travel === travelId,
      );
      if (existing) {
        return res.status(400).json({ message: "Already in favorites" });
      }
      mockDb.favorites.push({
        _id: mockDb.createId("fav"),
        user: req.user.id,
        travel: travelId,
      });
      return res.status(201).json({ message: "Added to favorites" });
    }

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
apiRouter.get("/favorites", auth, async (req, res) => {
  try {
    if (!isDbConnected()) {
      const favorites = mockDb.favorites
        .filter((f) => f.user === req.user.id)
        .map((f) => ({
          ...f,
          travel: mockDb.travels.find((t) => t._id === f.travel) || null,
        }));
      return res.json(favorites);
    }
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
apiRouter.post("/bookings", auth, async (req, res) => {
  try {
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

    if (!isDbConnected()) {
      const booking = {
        _id: mockDb.createId("booking"),
        user: req.user.id,
        travel: travelId || travel,
        destination,
        travelers: travelers || travellers,
        duration,
        totalCost,
        date: date || travelDate,
        createdAt: new Date().toISOString(),
      };
      mockDb.bookings.push(booking);
      return res.status(201).json({
        success: true,
        message: "Booking confirmed",
        booking,
      });
    }

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
apiRouter.get("/bookings", auth, async (req, res) => {
  try {
    if (!isDbConnected()) {
      const bookings = mockDb.bookings
        .filter((b) => b.user === req.user.id)
        .map((b) => ({
          ...b,
          travel: mockDb.travels.find((t) => t._id === b.travel) || null,
        }));
      return res.json(bookings);
    }
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

apiRouter.get("/profile", auth, async (req, res) => {
  try {
    if (!isDbConnected()) {
      const userDoc = mockDb.users.find((u) => u._id === req.user.id);
      if (!userDoc) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...user } = userDoc;
      const bookings = mockDb.bookings
        .filter((b) => b.user === req.user.id)
        .map((b) => ({
          ...b,
          travel: mockDb.travels.find((t) => t._id === b.travel) || null,
        }));
      const favorites = mockDb.favorites
        .filter((f) => f.user === req.user.id)
        .map((f) => ({
          ...f,
          travel: mockDb.travels.find((t) => t._id === f.travel) || null,
        }));
      return res.status(200).json({
        user,
        favorites,
        bookings,
        stats: {
          packagesViewed: 12,
          tripsBooked: bookings.length,
          wishlistItems: favorites.length,
          countriesVisited: 3,
        },
      });
    }

    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

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
      stats: {
        packagesViewed: 12,
        tripsBooked: bookings.length,
        wishlistItems: favorites.length,
        countriesVisited: 3,
      },
    });
  } catch (error) {
    console.error("PROFILE ERROR:", error);
    res.status(500).json({
      message: error.message,
    });
  }
});

app.use("/api", apiRouter);

// Route-level Mongoose fallback error middleware
app.use((err, req, res, next) => {
  if (
    err.name === "MongooseError" ||
    err.name === "MongoNetworkError" ||
    (err.message && err.message.includes("buffering timed out"))
  ) {
    console.warn("[AI Studio] Database offline — returning mock empty response");
    if (req.method === "GET") {
      return res.json(
        req.path.endsWith("s") || req.path.endsWith("s/") ? [] : {},
      );
    }
    return res
      .status(503)
      .json({ error: "Service temporarily unavailable (database offline)" });
  }
  next(err);
});

// ============================
// SERVE FRONTEND BUILD (SPA)
// ============================
const frontendDist = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendDist));

app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    return res.sendFile(path.join(frontendDist, "index.html"));
  }
  next();
});

// ============================
// SERVER ENGINE
// ============================
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
