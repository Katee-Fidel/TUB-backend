const mongoose = require('mongoose');
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
  } catch (error) {
    console.error('getMyWallet error:', error);
    return res.status(500).json({ message: 'Could not load wallet' });
  }
}

async function getWalletTransactions(req, res) {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id }).select('_id');
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
    const transactions = await Transaction.find({ wallet: wallet._id })
      .populate('event', 'title date')
      .populate('ticket', 'quantity totalAmount status')
      .sort({ createdAt: -1 });
    return res.status(200).json({ transactions });
  } catch (error) {
    console.error('getWalletTransactions error:', error);
    return res.status(500).json({ message: 'Could not load wallet transactions' });
  }
}

async function topupWallet(req, res) {
  try {
    const amount = Number(req.body.amount);
    const rawPhone = String(req.body.phone || '').trim();
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Top-up amount must be greater than 0' });
    if (!rawPhone) return res.status(400).json({ message: 'Phone number is required' });

    const normalizedPhone = rawPhone.replace(/^\+/, '').replace(/^0/, '254');
    if (!/^254\d{9}$/.test(normalizedPhone)) return res.status(400).json({ message: 'Enter a valid phone number in the format 2547xx...' });

    const wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

    const transaction = await createLedgerEntry({
      user: req.user.id,
      wallet: wallet._id,
      type: 'topup',
      direction: 'credit',
      amount,
      phone: normalizedPhone,
      merchantRequestID: `pending-${Date.now()}`,
      checkoutRequestID: `pending-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
      status: 'pending',
    });

    try {
      const response = await initiateStkPush({
        phone: normalizedPhone,
        amount: Math.round(amount),
        accountReference: `TUB-${wallet._id.toString().slice(-6)}`,
        transactionDesc: 'Wallet top up',
      });
      transaction.merchantRequestID = response.MerchantRequestID || transaction.merchantRequestID;
      transaction.checkoutRequestID = response.CheckoutRequestID || transaction.checkoutRequestID;
      transaction.resultDesc = response.ResponseDescription || 'STK push initiated';
      await transaction.save();
      return res.status(200).json({ message: 'Top-up request initiated', transaction });
    } catch (error) {
      transaction.status = 'failed';
      transaction.resultDesc = error.message || 'STK push failed';
      await transaction.save();
      return res.status(502).json({ message: 'Could not initiate M-Pesa request. Please try again.' });
    }
  } catch (error) {
    console.error('topupWallet error:', error);
    return res.status(500).json({ message: 'Could not create wallet top-up' });
  }
}

async function getTopupStatus(req, res) {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, user: req.user.id });
    if (!transaction || transaction.type !== 'topup') return res.status(404).json({ message: 'Top-up not found' });
    return res.status(200).json({ transaction });
  } catch (error) {
    console.error('getTopupStatus error:', error);
    return res.status(500).json({ message: 'Could not load top-up status' });
  }
}

function parseMpesaDate(value) {
  if (!value) return null;
  const text = String(value);
  if (!/^\d{14}$/.test(text)) return null;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6)) - 1;
  const day = Number(text.slice(6, 8));
  const hour = Number(text.slice(8, 10));
  const minute = Number(text.slice(10, 12));
  const second = Number(text.slice(12, 14));
  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

function callbackMetadata(callback) {
  const metadata = {};
  for (const item of callback.CallbackMetadata?.Item || []) {
    if (item?.Name) metadata[item.Name] = item.Value;
  }
  return metadata;
}

async function handleMpesaCallback(req, res) {
  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return res.status(400).json({ ResultCode: 1, ResultDesc: 'Missing callback payload' });

    const checkoutRequestID = callback.CheckoutRequestID;
    const merchantRequestID = callback.MerchantRequestID;
    const resultCode = Number(callback.ResultCode ?? -1);
    const resultDesc = callback.ResultDesc || 'M-Pesa callback received';
    if (!checkoutRequestID) return res.status(400).json({ ResultCode: 1, ResultDesc: 'Missing CheckoutRequestID' });

    const session = await mongoose.startSession();
    let processedTicketId = null;
    let shouldGenerateQr = false;
    let callbackMatchedTransaction = false;
    try {
      await session.withTransaction(async () => {
        const transaction = await Transaction.findOne({ checkoutRequestID }).session(session);
        if (!transaction) return;
        callbackMatchedTransaction = true;

        // Idempotency: once a callback has transitioned the ledger out of pending,
        // duplicate callbacks cannot credit/deduct the wallet or inventory again.
        if (transaction.status !== 'pending') {
          if (transaction.type === 'ticket_purchase' && transaction.ticket) {
            const existingTicket = await Ticket.findById(transaction.ticket).session(session);
            if (existingTicket?.status === 'paid' && !existingTicket.qrImageUrl) {
              processedTicketId = existingTicket._id;
              shouldGenerateQr = true;
            }
          }
          return;
        }

        transaction.merchantRequestID = merchantRequestID || transaction.merchantRequestID;
        transaction.resultCode = resultCode;
        transaction.resultDesc = resultDesc;

        const metadata = callbackMetadata(callback);
        const callbackAmount = Number(metadata.Amount ?? transaction.amount);
        const amountMatches = Number.isFinite(callbackAmount) && Math.abs(callbackAmount - Number(transaction.amount)) <= 0.01;

        if (resultCode !== 0 || !amountMatches) {
          transaction.status = 'failed';
          if (resultCode === 0 && !amountMatches) transaction.resultDesc = 'Callback amount mismatch';
          await transaction.save({ session });

          if (transaction.type === 'ticket_purchase' && transaction.ticket && transaction.event) {
            const ticket = await Ticket.findById(transaction.ticket).session(session);
            if (ticket && ticket.status === 'pending') {
              ticket.status = 'cancelled';
              ticket.merchantRequestID = merchantRequestID || ticket.merchantRequestID;
              await ticket.save({ session });
              await Event.updateOne(
                { _id: transaction.event, reservedTickets: { $gte: ticket.quantity } },
                { $inc: { reservedTickets: -ticket.quantity } },
                { session }
              );
            }
          }
          return;
        }

        transaction.mpesaReceiptNumber = metadata.MpesaReceiptNumber ? String(metadata.MpesaReceiptNumber) : null;
        transaction.transactionDate = parseMpesaDate(metadata.TransactionDate);
        transaction.phone = metadata.PhoneNumber ? String(metadata.PhoneNumber) : transaction.phone;

        if (transaction.type === 'topup') {
          const wallet = await Wallet.findById(transaction.wallet).session(session);
          if (!wallet) {
            transaction.status = 'failed';
            transaction.resultDesc = 'Wallet not found';
            await transaction.save({ session });
            return;
          }
          await Wallet.updateOne(
            { _id: wallet._id },
            { $inc: { balance: transaction.amount } },
            { session }
          );
          transaction.status = 'completed';
          await transaction.save({ session });
          return;
        }

        if (transaction.type === 'ticket_purchase') {
          const ticket = await Ticket.findById(transaction.ticket).session(session);
          if (!ticket) {
            transaction.status = 'failed';
            transaction.resultDesc = 'Ticket not found';
            await transaction.save({ session });
            return;
          }

          ticket.status = 'paid';
          ticket.merchantRequestID = merchantRequestID || ticket.merchantRequestID;
          await ticket.save({ session });
          await Event.updateOne(
            { _id: transaction.event, reservedTickets: { $gte: ticket.quantity } },
            { $inc: { reservedTickets: -ticket.quantity, ticketsSold: ticket.quantity } },
            { session }
          );
          transaction.status = 'completed';
          await transaction.save({ session });
          processedTicketId = ticket._id;
          shouldGenerateQr = true;
        }
      });
    } finally {
      await session.endSession();
    }

    // If Daraja beat our STK response persistence, the callback must be retried.
    // Returning 5xx here is intentional: the transaction can only be processed
    // safely once the checkoutRequestID has been stored, while matched callbacks
    // are idempotent and return 200 even when repeated.
    if (!callbackMatchedTransaction) {
      console.warn('M-Pesa callback received before checkout transaction was linked', { checkoutRequestID });
      return res.status(500).json({ ResultCode: 1, ResultDesc: 'Transaction not ready; please retry callback' });
    }

    if (processedTicketId && shouldGenerateQr) {
      try {
        const ticket = await Ticket.findById(processedTicketId);
        if (ticket && ticket.status === 'paid' && !ticket.qrImageUrl) {
          ticket.qrImageUrl = await generateAndUploadQRCode(ticket.qrData || ticket.qrCode, ticket._id.toString());
          await ticket.save();
        }
      } catch (qrError) {
        console.error('M-Pesa ticket QR generation failed:', qrError);
      }
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('handleMpesaCallback error:', error);
    // A non-2xx response allows the provider to retry a transient failure.
    return res.status(500).json({ ResultCode: 1, ResultDesc: 'Server error' });
  }
}

module.exports = {
  getMyWallet,
  getWalletTransactions,
  topupWallet,
  getTopupStatus,
  handleMpesaCallback,
};