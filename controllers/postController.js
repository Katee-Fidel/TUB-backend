const Post = require("../models/Post.js");
const { cloudinary } = require("../config/cloudinary.js");

async function getFeed(_req, res) {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate("user", "name avatarUrl")
      .populate("taggedUsers", "name avatarUrl role")
      .populate("taggedEvent", "title")
      .populate("comments.user", "name avatarUrl")
      .limit(50);
    return res.status(200).json({ posts });
  } catch (error) {
    console.error("getFeed error:", error);
    return res.status(500).json({ message: "Could not load posts" });
  }
}

async function createPost(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: "A photo is required" });
    const caption = String(req.body.caption || "").trim();
    if (caption.length > 500) return res.status(400).json({ message: "Caption must be 500 characters or fewer" });

    const taggedUsers = Array.isArray(req.body.taggedUsers) ? req.body.taggedUsers : (req.body.taggedUsers ? [req.body.taggedUsers] : []);
    const post = await Post.create({
      user: req.user.id,
      imageUrl: req.file.path,
      imagePublicId: req.file.filename,
      caption,
      taggedUsers,
      taggedEvent: req.body.taggedEvent || null,
    });
    await post.populate("user", "name avatarUrl");
    return res.status(201).json({ post });
  } catch (error) {
    console.error("createPost error:", error);
    return res.status(500).json({ message: "Could not create post" });
  }
}

async function toggleLike(req, res) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const userId = req.user.id;
    const liked = post.likes.some((id) => id.toString() === userId);
    if (liked) post.likes.pull(userId);
    else post.likes.addToSet(userId);
    await post.save();
    return res.status(200).json({ liked: !liked, likeCount: post.likes.length });
  } catch (error) {
    return res.status(400).json({ message: "Invalid post id" });
  }
}

async function addComment(req, res) {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ message: "A comment cannot be empty" });
    if (text.length > 300) return res.status(400).json({ message: "Comments must be 300 characters or fewer" });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    post.comments.push({ user: req.user.id, text });
    await post.save();
    await post.populate("comments.user", "name avatarUrl");
    return res.status(201).json({ comment: post.comments.at(-1) });
  } catch (error) {
    return res.status(400).json({ message: "Invalid post id" });
  }
}

async function updatePost(req, res) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.user.toString() !== req.user.id) return res.status(403).json({ message: "You can only edit your own posts" });

    if (req.body.caption !== undefined) {
      const caption = String(req.body.caption).trim();
      if (caption.length > 500) return res.status(400).json({ message: "Caption must be 500 characters or fewer" });
      post.caption = caption;
    }
    if (req.body.taggedUsers !== undefined) post.taggedUsers = Array.isArray(req.body.taggedUsers) ? req.body.taggedUsers : (req.body.taggedUsers ? [req.body.taggedUsers] : []);
    if (req.body.taggedEvent !== undefined) post.taggedEvent = req.body.taggedEvent || null;
    if (req.file) {
      if (post.imagePublicId) await cloudinary.uploader.destroy(post.imagePublicId).catch(() => {});
      post.imageUrl = req.file.path;
      post.imagePublicId = req.file.filename;
    }

    await post.save();
    await post.populate(["user", "taggedUsers", "taggedEvent"]);
    return res.status(200).json({ post });
  } catch (error) {
    return res.status(400).json({ message: "Could not update post" });
  }
}

async function deletePost(req, res) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.user.toString() !== req.user.id) return res.status(403).json({ message: "You can only delete your own posts" });
    if (post.imagePublicId) await cloudinary.uploader.destroy(post.imagePublicId).catch(() => {});
    await post.deleteOne();
    return res.status(200).json({ message: "Post deleted" });
  } catch (error) {
    return res.status(400).json({ message: "Could not delete post" });
  }
}

module.exports = { getFeed, createPost, toggleLike, addComment, updatePost, deletePost };
