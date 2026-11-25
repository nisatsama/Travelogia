const express = require("express");
const auth = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const controller = require("../controllers/journalController");

const router = express.Router();

router.get("/photo/:filename", controller.serveJournalPhoto);
router.get("/public", controller.listPublicStories);
router.get("/mine", auth, controller.listMyJournals);
router.get("/:id", optionalAuth, controller.getJournalEntry);
router.post("/", auth, controller.uploadMiddleware, controller.createJournalEntry);
router.put("/:id", auth, controller.updateJournalEntry);
router.delete("/:id", auth, controller.deleteJournalEntry);

module.exports = router;
