const express = require("express");
const { requireAuth } = require("../middleware/auth.js");
const { verifyOrigin } = require("../middleware/csrf.js");
const { uploadAvatar } = require("../config/cloudinary.js");
const { updateMyProfile, getPublicProfile } = require("../controllers/userController.js");

const router = express.Router();
router.patch("/me", requireAuth, verifyOrigin, uploadAvatar.single("avatar"), updateMyProfile);
router.get("/:id", getPublicProfile);

module.exports = router;
