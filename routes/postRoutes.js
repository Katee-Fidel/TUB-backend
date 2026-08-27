const express = require("express");
const { requireAuth } = require("../middleware/auth.js");
const { verifyOrigin } = require("../middleware/csrf.js");
const { uploadPost } = require("../config/cloudinary.js");
const { getFeed, createPost, toggleLike, addComment, updatePost, deletePost } = require("../controllers/postController.js");

const router = express.Router();

router.get("/", getFeed);
router.post("/", requireAuth, verifyOrigin, uploadPost.single("image"), createPost);
router.post("/:id/like", requireAuth, verifyOrigin, toggleLike);
router.post("/:id/comments", requireAuth, verifyOrigin, addComment);
router.patch("/:id", requireAuth, verifyOrigin, uploadPost.single("image"), updatePost);
router.delete("/:id", requireAuth, verifyOrigin, deletePost);

module.exports = router;
