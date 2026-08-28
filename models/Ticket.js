const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null, index: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'paid', 'cancelled', 'used'], default: 'pending' },
    paymentMethod: { type: String, enum: ['wallet', 'mpesa'], required: true },
    qrCode: { type: String, required: true, unique: true },
    qrImageUrl: { type: String, default: null },
    checkoutRequestID: { type: String, default: null },
    merchantRequestID: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ticket', ticketSchema);
