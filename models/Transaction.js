const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },

    type: {
      type: String,
      enum: ["topup", "ticket_purchase", "savings_contribution", "refund"],
      required: true,
      index: true,
    },

    amount: { type: Number, required: true, min: 0 },
    phone: { type: String, default: "", trim: true },

    ticket: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket", default: null, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", default: null, index: true },

    merchantRequestID: { type: String, default: null },
    checkoutRequestID: { type: String, default: null },
    mpesaReceiptNumber: { type: String, default: null },

    status: {
      type: String,
      enum: ["pending", "completed", "failed", "reversed"],
      default: "pending",
      index: true,
    },

    resultCode: { type: Number, default: null },
    resultDesc: { type: String, default: "" },
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ checkoutRequestID: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Transaction", transactionSchema);
