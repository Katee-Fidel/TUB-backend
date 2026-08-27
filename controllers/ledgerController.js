const mongoose = require('mongoose');
const Wallet = require('../models/Wallet.js');
const Ticket = require('../models/Ticket.js');
const Event = require('../models/Event.js');
const { createLedgerEntry } = require('../services/ledger.js');

async function contributeSavings(req, res) {
  const amount = Number(req.body.amount);
  const eventId = req.body.eventId;
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Savings contribution must be greater than 0' });
  if (!mongoose.isValidObjectId(eventId)) return res.status(400).json({ message: 'A valid eventId is required' });

  const session = await mongoose.startSession();
  try {
    let entry;
    await session.withTransaction(async () => {
      const wallet = await Wallet.findOneAndUpdate(
        { user: req.user.id, 'savingGoals.event': eventId, balance: { $gte: amount } },
        { $inc: { balance: -amount, 'savingGoals.$.savedAmount': amount } },
        { new: true, session }
      );
      if (!wallet) {
        const error = new Error('Savings goal not found or insufficient wallet balance');
        error.status = 400;
        throw error;
      }
      const goal = wallet.savingGoals.find((item) => item.event?.toString() === String(eventId));
      entry = await createLedgerEntry({
        user: req.user.id,
        wallet: wallet._id,
        event: eventId,
        type: 'savings_contribution',
        direction: 'debit',
        amount,
        status: 'completed',
      }, session);
      entry = entry.toObject();
      entry.savedAmount = goal?.savedAmount ?? null;
    });
    return res.status(201).json({ message: 'Savings contribution recorded', transaction: entry });
  } catch (error) {
    console.error('contributeSavings error:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Could not record savings contribution' });
  } finally {
    await session.endSession();
  }
}

async function refundTicket(req, res) {
  const session = await mongoose.startSession();
  try {
    let entry;
    await session.withTransaction(async () => {
      const ticket = await Ticket.findOneAndUpdate(
        { _id: req.params.ticketId, user: req.user.id, status: 'paid', paymentMethod: 'wallet' },
        { $set: { status: 'cancelled' } },
        { new: true, session }
      );
      if (!ticket) {
        const error = new Error('Only a paid wallet ticket can be refunded');
        error.status = 400;
        throw error;
      }

      const event = await Event.findOneAndUpdate(
        { _id: ticket.event, ticketsSold: { $gte: ticket.quantity } },
        { $inc: { ticketsSold: -ticket.quantity } },
        { new: true, session }
      );
      if (!event) throw new Error('Ticket inventory could not be restored');

      const wallet = await Wallet.findOneAndUpdate(
        { _id: await Wallet.findOne({ user: req.user.id }).session(session).then((w) => w?._id) },
        { $inc: { balance: ticket.totalAmount } },
        { new: true, session }
      );
      if (!wallet) throw new Error('Wallet not found');

      entry = await createLedgerEntry({
        user: req.user.id,
        wallet: wallet._id,
        event: event._id,
        ticket: ticket._id,
        type: 'refund',
        direction: 'credit',
        amount: ticket.totalAmount,
        status: 'completed',
      }, session);
    });
    return res.status(201).json({ message: 'Ticket refunded to wallet', transaction: entry });
  } catch (error) {
    console.error('refundTicket error:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Could not refund ticket' });
  } finally {
    await session.endSession();
  }
}

module.exports = { contributeSavings, refundTicket };
