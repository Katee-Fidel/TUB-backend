const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null, index: true },
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null, index: true },
  type: { type: String, enum: ['wallet_topup', 'ticket_purchase', 'savings_contribution', 'refund'], default: 'wallet_topup', index: true },
  direction: { type: String, enum: ['credit', 'debit'], default: 'credit', required: true },
  amount: { type: Number, required: true, min: 0.01 },
  phone: { type: String, default: null, trim: true },
  merchantRequestID: { type: String, default: null },
  checkoutRequestID: { type: String, default: null },
  mpesaReceiptNumber: { type: String, default: null },
  transactionDate: { type: Date, default: null },
  resultCode: { type: Number, default: null },
  resultDesc: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'reversed'], default: 'pending', index: true },
  relatedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
}, { timestamps: true });

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ wallet: 1, createdAt: -1 });
transactionSchema.index({ checkoutRequestID: 1 }, { unique: true, partialFilterExpression: { checkoutRequestID: { $type: 'string' } } });
transactionSchema.index({ mpesaReceiptNumber: 1 }, { unique: true, partialFilterExpression: { mpesaReceiptNumber: { $type: 'string' } } });

module.exports = mongoose.model('Transaction', transactionSchema);
