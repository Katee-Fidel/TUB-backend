const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null, index: true },

    type: {
      type: String,
      enum: ['topup', 'ticket_purchase', 'savings_contribution', 'refund'],
      required: true,
      index: true,
    },
    direction: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending', index: true },

    phone: { type: String, trim: true, default: '' },
    merchantRequestID: { type: String, default: null, index: true },
    checkoutRequestID: { type: String, default: null },
    mpesaReceiptNumber: { type: String, default: null },
    transactionDate: { type: Date, default: null },
    resultCode: { type: Number, default: null },
    resultDesc: { type: String, default: '' },
    relatedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ wallet: 1, createdAt: -1 });

// Only real M-Pesa identifiers participate in uniqueness checks. This avoids
// MongoDB treating multiple null values as duplicates while preserving
// idempotency for actual checkout/receipt identifiers.
transactionSchema.index(
  { checkoutRequestID: 1 },
  { name: 'checkoutRequestID_1', unique: true, partialFilterExpression: { checkoutRequestID: { $type: 'string' } } }
);
transactionSchema.index(
  { mpesaReceiptNumber: 1 },
  { name: 'mpesaReceiptNumber_1', unique: true, partialFilterExpression: { mpesaReceiptNumber: { $type: 'string' } } }
);

module.exports = mongoose.model('Transaction', transactionSchema);
