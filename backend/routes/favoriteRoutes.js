const express = require("express");
const router = express.Router();
const favoriteController = require("../controllers/favoriteController");
const auth = require("../middleware/auth");

router.get("/", auth, favoriteController.getFavorites);
router.post("/", auth, favoriteController.addFavorite);
router.delete("/:id", auth, favoriteController.removeFavorite);

module.exports = router;
