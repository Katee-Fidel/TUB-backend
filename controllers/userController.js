const User = require("../models/User.js");
const Event = require("../models/Event.js");
const { cloudinary } = require("../config/cloudinary.js");

async function updateMyProfile(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: "Name cannot be empty" });
      user.name = name;
    }

    if (req.file) {
      if (user.avatarPublicId) await cloudinary.uploader.destroy(user.avatarPublicId).catch(() => {});
      user.avatarUrl = req.file.path;
      user.avatarPublicId = req.file.filename;
    }

    await user.save();
    return res.status(200).json({ user });
  } catch (error) {
    console.error("updateMyProfile error:", error);
    return res.status(500).json({ message: "Could not update profile" });
  }
}

async function getPublicProfile(req, res) {
  try {
    const user = await User.findById(req.params.id).select("name avatarUrl role createdAt");
    if (!user) return res.status(404).json({ message: "User not found" });
    const events = user.role === "artist"
      ? await Event.find({ artist: user._id, status: "published" }).sort({ date: 1 })
      : [];
    return res.status(200).json({ user, events });
  } catch (_error) { return res.status(400).json({ message: "Invalid user id" }); }
}

module.exports = { updateMyProfile, getPublicProfile };
