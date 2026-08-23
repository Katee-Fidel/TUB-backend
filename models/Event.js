const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    artist: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    bannerUrl: { type: String, default: "" },
    bannerPublicId: { type: String, default: "" }, // needed to delete/replace on Cloudinary later
    venue: { type: String, required: true },
    date: { type: Date, required: true },
    ticketPrice: { type: Number, required: true, min: 0 },
    totalTickets: { type: Number, required: true, min: 1 },
    ticketsSold: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "published", "completed", "cancelled"],
      default: "draft",
    },
  },
  { timestamps: true }
);

// Convenience virtual — how many tickets are still available
eventSchema.virtual("ticketsRemaining").get(function () {
  return this.totalTickets - this.ticketsSold;
});
eventSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Event", eventSchema);