// models/Transaction.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
        amount: { type: Number, required: true, min: 1 },
        phone: { type: String, required: true, trim: true },

        merchantRequestID: { type: String, required: true },
        checkoutRequestID: { type: String, required: true, unique: true },

        status: {
            type: String,
            enum: ["pending", "completed", "failed"],
            default: "pending",
        },

      
        resultCode: { type: Number, default: null },
        resultDesc: { type: String, default: "" },
    },
    { timestamps: true }
);

transactionSchema.index({ checkoutRequestID: 1 });
transactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);