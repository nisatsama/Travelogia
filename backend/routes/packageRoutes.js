const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Package = require("../model/Package");
const mockDb = require("../mockDb");

const isDbConnected = () => mongoose.connection.readyState === 1;

router.get("/", async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json(mockDb.packages);
    }
    const packages = await Package.find();
    res.json(packages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/category/:category", async (req, res) => {
  try {
    if (!isDbConnected()) {
      const cat = (req.params.category || "").toLowerCase();
      const filtered = mockDb.packages.filter(
        (p) => (p.category || "").toLowerCase() === cat,
      );
      return res.json(filtered);
    }
    const packages = await Package.find({
      category: req.params.category,
    });

    res.json(packages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!isDbConnected()) {
      const pkg = mockDb.packages.find((p) => p._id === req.params.id) || null;
      return res.json(pkg);
    }
    const packageData = await Package.findById(req.params.id);

    res.json(packageData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
