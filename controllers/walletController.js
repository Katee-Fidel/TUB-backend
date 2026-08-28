// controllers/walletController.js
const Wallet = require('../models/Wallet.js');
const Transaction = require('../models/Transaction.js');
const Ticket = require('../models/Ticket.js');
const Event = require('../models/Event.js');
const { initiateStkPush } = require('../utils/mpesa.js');
const { generateAndUploadQRCode } = require('../utils/qrCode.js');
const { createLedgerEntry } = require('../services/ledger.js');

async function getMyWallet(req, res) {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id }).populate('savingGoals.event', 'title date bannerUrl');
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
    return res.status(200).json({ wallet });
  } catch (error) { console.error('getMyWallet error:', error); return res.status(500).json({ message: 'Could not load wallet' }); }
}

async function getWalletTransactions(req, res) {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id }).select('_id');
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
    const transactions = await Transaction.find({ wallet: wallet._id }).populate('event', 'title date').populate('ticket', 'quantity totalAmount status').sort({ createdAt: -1 });
    return res.status(200).json({ transactions });
  } catch (error) { console.error('getWalletTransactions error:', error); return res.status(500).json({ message: 'Could not load wallet transactions' }); }
}

async function topupWallet(req, res) {
  try {
    const amount = Number(req.body.amount); const rawPhone = String(req.body.phone || '').trim();
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Top-up amount must be greater than 0' });
    if (!rawPhone) return res.status(400).json({ message: 'Phone number is required' });
    const normalizedPhone = rawPhone.replace(/^\+/, '').replace(/^0/, '254');
    if (!/^254\d{9}$/.test(normalizedPhone)) return res.status(400).json({ message: 'Enter a valid phone number in the format 2547xx...' });
    const wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
    const transaction = await createLedgerEntry({ user: req.user.id, wallet: wallet._id, type: 'wallet_topup', direction: 'credit', amount, phone: normalizedPhone, merchantRequestID: `pending-${Date.now()}`, checkoutRequestID: `pending-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`, status: 'pending' });
    try {
      const response = await initiateStkPush({ phone: normalizedPhone, amount: Math.round(amount), accountReference: `TUB-${wallet._id.toString().slice(-6)}`, transactionDesc: 'Wallet top up' });
      transaction.merchantRequestID = response.MerchantRequestID || transaction.merchantRequestID; transaction.checkoutRequestID = response.CheckoutRequestID || transaction.checkoutRequestID; transaction.resultDesc = response.ResponseDescription || 'STK push initiated'; await transaction.save();
      return res.status(200).json({ message: 'Top-up request initiated', transaction });
    } catch (error) { transaction.status = 'failed'; transaction.resultDesc = error.message || 'STK push failed'; await transaction.save(); return res.status(502).json({ message: 'Could not initiate M-Pesa request. Please try again.' }); }
  } catch (error) { console.error('topupWallet error:', error); return res.status(500).json({ message: 'Could not create wallet top-up' }); }
}

async function getTopupStatus(req, res) {
  try { const transaction = await Transaction.findOne({ _id: req.params.id, user: req.user.id, type: 'wallet_topup' }); if (!transaction) return res.status(404).json({ message: 'Top-up not found' }); return res.status(200).json({ transaction }); }
  catch (error) { console.error('getTopupStatus error:', error); return res.status(500).json({ message: 'Could not load top-up status' }); }
}

function callbackMetadata(callback) { const metadata = {}; for (const item of callback.CallbackMetadata?.Item || []) if (item?.Name) metadata[item.Name] = item.Value; return metadata; }

async function handleMpesaCallback(req, res) {
  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return res.status(400).json({ ResultCode: 1, ResultDesc: 'Missing callback payload' });
    const checkoutRequestID = callback.CheckoutRequestID, merchantRequestID = callback.MerchantRequestID, resultCode = Number(callback.ResultCode ?? -1), resultDesc = callback.ResultDesc || 'M-Pesa callback received', metadata = callbackMetadata(callback);
    const transaction = await Transaction.findOne({ checkoutRequestID });

    // Only wallet_topup transactions credit the wallet. Ticket purchases have
    // their own ticket transition below and must never be treated as top-ups.
    if (transaction?.type === 'wallet_topup') {
      transaction.merchantRequestID = merchantRequestID || transaction.merchantRequestID; transaction.resultCode = resultCode; transaction.resultDesc = resultDesc;
      if (transaction.status === 'completed') { await transaction.save(); return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' }); }
      if (resultCode !== 0) { transaction.status = 'failed'; await transaction.save(); return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' }); }
      const callbackAmount = Number(metadata.Amount ?? transaction.amount);
      if (!Number.isFinite(callbackAmount) || callbackAmount <= 0 || Math.abs(callbackAmount - Number(transaction.amount)) > 0.01) { transaction.status = 'failed'; transaction.resultDesc = 'Invalid or mismatched callback amount'; await transaction.save(); return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' }); }
      const wallet = await Wallet.findById(transaction.wallet);
      if (!wallet) { transaction.status = 'failed'; transaction.resultDesc = 'Wallet not found'; await transaction.save(); return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' }); }
      wallet.balance = Number(wallet.balance || 0) + callbackAmount; await wallet.save(); transaction.status = 'completed'; transaction.mpesaReceiptNumber = metadata.MpesaReceiptNumber ? String(metadata.MpesaReceiptNumber) : transaction.mpesaReceiptNumber; await transaction.save();
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const pendingTicket = await Ticket.findOne({ checkoutRequestID });
    if (!pendingTicket) return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    if (['paid', 'used', 'cancelled'].includes(pendingTicket.status)) return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

    if (resultCode !== 0) {
      const cancelled = await Ticket.findOneAndUpdate({ _id: pendingTicket._id, status: 'pending' }, { $set: { status: 'cancelled', merchantRequestID: merchantRequestID || pendingTicket.merchantRequestID } }, { new: true });
      if (cancelled && transaction?.type === 'ticket_purchase') { transaction.status = 'failed'; transaction.resultCode = resultCode; transaction.resultDesc = resultDesc; transaction.merchantRequestID = merchantRequestID || transaction.merchantRequestID; await transaction.save(); }
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const callbackAmount = Number(metadata.Amount ?? pendingTicket.totalAmount);
    if (!Number.isFinite(callbackAmount) || callbackAmount <= 0 || Math.abs(callbackAmount - Number(pendingTicket.totalAmount)) > 0.01) {
      const cancelled = await Ticket.findOneAndUpdate({ _id: pendingTicket._id, status: 'pending' }, { $set: { status: 'cancelled', merchantRequestID: merchantRequestID || pendingTicket.merchantRequestID } }, { new: true });
      if (cancelled && transaction?.type === 'ticket_purchase') { transaction.status = 'failed'; transaction.resultCode = resultCode; transaction.resultDesc = 'Invalid or mismatched callback amount'; await transaction.save(); }
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const paidTicket = await Ticket.findOneAndUpdate({ _id: pendingTicket._id, status: 'pending' }, { $set: { status: 'paid', merchantRequestID: merchantRequestID || pendingTicket.merchantRequestID } }, { new: true });
    if (!paidTicket) return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    if (transaction?.type === 'ticket_purchase') { transaction.status = 'completed'; transaction.resultCode = resultCode; transaction.resultDesc = resultDesc; transaction.merchantRequestID = merchantRequestID || transaction.merchantRequestID; transaction.mpesaReceiptNumber = metadata.MpesaReceiptNumber ? String(metadata.MpesaReceiptNumber) : transaction.mpesaReceiptNumber; await transaction.save(); }
    try { paidTicket.qrImageUrl = await generateAndUploadQRCode(paidTicket.qrCode, paidTicket._id.toString()); await paidTicket.save(); } catch (err) { console.error('QR code generation failed:', err); }
    await Event.updateOne({ _id: paidTicket.event }, { $inc: { ticketsSold: paidTicket.quantity } });
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) { console.error('handleMpesaCallback error:', error); return res.status(500).json({ ResultCode: 1, ResultDesc: 'Server error' }); }
}

module.exports = { getMyWallet, getWalletTransactions, topupWallet, getTopupStatus, handleMpesaCallback };