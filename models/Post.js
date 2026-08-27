const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    imageUrl: { type: String, required: true },
    imagePublicId: { type: String, required: true },
    caption: { type: String, default: "", trim: true, maxlength: 500 },
    taggedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    taggedEvent: { type: mongoose.Schema.Types.ObjectId, ref: "Event", default: null },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      text: { type: String, required: true, trim: true, maxlength: 300 },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

postSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);
