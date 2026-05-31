const express = require("express");
const router = express.Router();

const Package = require("../model/Package");

router.get("/", async (req, res) => {
  try {
    const packages = await Package.find();
    res.json(packages);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.get("/category/:category", async (req, res) => {
  try {
    const packages = await Package.find({
      category: req.params.category,
    });

    res.json(packages);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.get("/:id", async (req, res) => {
  try {
    const packageData = await Package.findById(req.params.id);

    res.json(packageData);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
