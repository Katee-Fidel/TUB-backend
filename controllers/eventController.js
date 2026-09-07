const mongoose = require("mongoose");
const Event = require("../models/Event.js");
const Ticket = require("../models/Ticket.js");
const Wallet = require("../models/Wallet.js");
const Transaction = require("../models/Transaction.js");
const { cloudinary } = require("../config/cloudinary.js");
const { generateAndUploadQRCode } = require("../utils/qrCode.js");
const { initiateStkPush } = require("../utils/mpesa.js");
const { createTicketToken } = require("../utils/ticketToken.js");
const { createLedgerEntry } = require("../services/ledger.js");
const { randomUUID } = require("crypto");

async function createEvent(req, res) {
  try { const { title, description, venue, date, ticketPrice, totalTickets, status } = req.body; if (!title || !description || !venue || !date || ticketPrice === undefined || ticketPrice === "" || totalTickets === undefined || totalTickets === "") return res.status(400).json({ message: "Missing required event fields" }); const event = await Event.create({ artist: req.user.id, title, description, venue, date, ticketPrice, totalTickets, status: status === "published" ? "published" : "draft", bannerUrl: req.file?.path || "", bannerPublicId: req.file?.filename || "" }); return res.status(201).json({ event }); } catch (err) { console.error("createEvent error:", err); return res.status(500).json({ message: "Server error creating event" }); }
}
async function getPublicEvents(req, res) { try { const events = await Event.find({ status: "published" }).sort({ date: 1 }).populate("artist", "name avatarUrl"); return res.status(200).json({ events }); } catch (err) { console.error("getPublicEvents error:", err); return res.status(500).json({ message: "Server error fetching events" }); } }
async function getMyEvents(req, res) { try { const events = await Event.find({ artist: req.user.id }).sort({ createdAt: -1 }); return res.status(200).json({ events }); } catch (err) { console.error("getMyEvents error:", err); return res.status(500).json({ message: "Server error fetching your events" }); } }
async function getEventAnalytics(req, res) { try { const event = await Event.findOne({ _id: req.params.id, artist: req.user.id }); if (!event) return res.status(404).json({ message: "Event not found" }); const [summaryRows, recentTickets] = await Promise.all([Ticket.aggregate([{ $match: { event: event._id } }, { $group: { _id: "$status", orders: { $sum: 1 }, quantity: { $sum: "$quantity" }, revenue: { $sum: "$totalAmount" } } }]), Ticket.find({ event: event._id }).populate("user", "name email").sort({ createdAt: -1 }).limit(10).select("user quantity totalAmount unitPrice status paymentMethod createdAt")]); const byStatus = Object.fromEntries(summaryRows.map((row) => [row._id, row])); const paid = byStatus.paid || { orders: 0, quantity: 0, revenue: 0 }; const used = byStatus.used || { orders: 0, quantity: 0, revenue: 0 }; const pending = byStatus.pending || { orders: 0, quantity: 0, revenue: 0 }; const cancelled = byStatus.cancelled || { orders: 0, quantity: 0, revenue: 0 }; return res.status(200).json({ event, analytics: { capacity: event.totalTickets, ticketsSold: event.ticketsSold, ticketsRemaining: Math.max(0, event.totalTickets - event.ticketsSold - event.reservedTickets), revenue: paid.revenue + used.revenue, paidTickets: paid.quantity, pendingTickets: pending.quantity, cancelledTickets: cancelled.quantity, checkIns: used.quantity, orders: { paid: paid.orders, pending: pending.orders, cancelled: cancelled.orders, used: used.orders } }, recentTransactions: recentTickets }); } catch (err) { console.error("getEventAnalytics error:", err); return res.status(500).json({ message: "Server error fetching event analytics" }); } }
async function getEventById(req, res) { try { const visibility = [{ status: "published" }]; if (req.user) visibility.push({ artist: req.user.id }); const event = await Event.findOne({ _id: req.params.id, $or: visibility }).populate("artist", "name avatarUrl"); if (!event) return res.status(404).json({ message: "Event not found" }); return res.status(200).json({ event }); } catch (_err) { return res.status(400).json({ message: "Invalid event id" }); } }
async function updateEvent(req, res) { try { const event = await Event.findById(req.params.id); if (!event) return res.status(404).json({ message: "Event not found" }); if (event.artist.toString() !== req.user.id) return res.status(403).json({ message: "You do not own this event" }); for (const field of ["title", "description", "venue", "date", "ticketPrice", "totalTickets", "status"]) if (req.body[field] !== undefined) event[field] = req.body[field]; if (event.totalTickets < event.ticketsSold + event.reservedTickets) return res.status(400).json({ message: "Total tickets cannot be less than sold or reserved tickets" }); if (req.file) { if (event.bannerPublicId) await cloudinary.uploader.destroy(event.bannerPublicId).catch(() => {}); event.bannerUrl = req.file.path; event.bannerPublicId = req.file.filename; } await event.save(); return res.status(200).json({ event }); } catch (err) { console.error("updateEvent error:", err); return res.status(500).json({ message: "Server error updating event" }); } }
async function deleteEvent(req, res) { try { const event = await Event.findById(req.params.id); if (!event) return res.status(404).json({ message: "Event not found" }); if (event.artist.toString() !== req.user.id) return res.status(403).json({ message: "You do not own this event" }); if (event.bannerPublicId) await cloudinary.uploader.destroy(event.bannerPublicId).catch(() => {}); await event.deleteOne(); return res.status(200).json({ message: "Event deleted" }); } catch (err) { console.error("deleteEvent error:", err); return res.status(500).json({ message: "Server error deleting event" }); } }

async function purchaseEventTicket(req, res) {
  let session;
  try {
    const quantity = Number(req.body.quantity ?? 1);
    const paymentMethod = req.body.paymentMethod || "wallet";
    const phone = req.body.phone || "";
    if (!["wallet", "mpesa"].includes(paymentMethod)) return res.status(400).json({ message: "Invalid payment method" });
    if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ message: "Quantity must be a positive whole number" });
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.status !== "published") return res.status(400).json({ message: "This event is not currently open for ticket purchase" });
    const totalAmount = event.ticketPrice * quantity;
    const normalizedPhone = String(phone).replace(/^\+/, "").replace(/^0/, "254");
    if (paymentMethod === "mpesa" && !/^254\d{9}$/.test(normalizedPhone)) return res.status(400).json({ message: "Invalid phone number format (expected 2547xxxxxxxx)" });
    const wallet = await Wallet.findOne({ user: req.user.id }).select("_id");
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    session = await mongoose.startSession();
    let ticket;
    await session.withTransaction(async () => {
      const reserved = await Event.findOneAndUpdate(
        { _id: event._id, status: "published", $expr: { $lte: [{ $add: ["$ticketsSold", "$reservedTickets", quantity] }, "$totalTickets"] } },
        { $inc: { reservedTickets: quantity } },
        { new: true, session }
      );
      if (!reserved) {
        const fresh = await Event.findById(event._id).session(session);
        const remaining = fresh ? Math.max(0, fresh.totalTickets - fresh.ticketsSold - fresh.reservedTickets) : 0;
        const error = new Error(`Only ${remaining} ticket(s) remaining for this event`); error.status = 409; throw error;
      }

      if (paymentMethod === "wallet") {
        const chargedWallet = await Wallet.findOneAndUpdate({ _id: wallet._id, balance: { $gte: totalAmount } }, { $inc: { balance: -totalAmount } }, { new: true, session });
        if (!chargedWallet) { const error = new Error(`Insufficient wallet balance (need KES ${totalAmount})`); error.status = 400; throw error; }
      }

      ticket = new Ticket({ user: req.user.id, event: event._id, quantity, unitPrice: event.ticketPrice, totalAmount, paymentMethod, status: paymentMethod === "wallet" ? "paid" : "pending", qrCode: `pending-${randomUUID()}`, qrImageUrl: null });
      await ticket.save({ session });
      ticket.qrCode = createTicketToken(ticket);
      await ticket.save({ session });

      if (paymentMethod === "wallet") {
        const sold = await Event.findOneAndUpdate({ _id: event._id, reservedTickets: { $gte: quantity } }, { $inc: { reservedTickets: -quantity, ticketsSold: quantity } }, { new: true, session });
        if (!sold) throw new Error("Ticket inventory could not be finalized");
        const ledger = await createLedgerEntry({ user: req.user.id, wallet: wallet._id, event: event._id, ticket: ticket._id, type: "ticket_purchase", direction: "debit", amount: totalAmount, status: "completed" }, session);
        ticket.transaction = ledger._id;
        await ticket.save({ session });
      } else {
        const ledger = await createLedgerEntry({ user: req.user.id, wallet: wallet._id, event: event._id, ticket: ticket._id, type: "ticket_purchase", direction: "debit", amount: totalAmount, status: "pending", phone: normalizedPhone }, session);
        ticket.transaction = ledger._id;
        await ticket.save({ session });
      }
    });
    await session.endSession(); session = null;

    if (paymentMethod === "wallet") {
      try { ticket.qrImageUrl = await generateAndUploadQRCode(ticket.qrCode, ticket._id.toString()); await ticket.save(); } catch (error) { console.error("wallet ticket QR generation failed:", error); }
      return res.status(201).json({ message: "Ticket purchase successful", ticket: ticket.toObject() });
    }

    try {
      const stkResponse = await initiateStkPush({ phone: normalizedPhone, amount: Math.round(totalAmount), accountReference: `TUB-${event._id.toString().slice(-6)}-${ticket._id.toString().slice(-6)}`, transactionDesc: `${event.title} - ${quantity} ticket(s)` });
      ticket.checkoutRequestID = stkResponse.CheckoutRequestID || null;
      ticket.merchantRequestID = stkResponse.MerchantRequestID || null;
      await ticket.save();
      await Transaction.updateOne({ ticket: ticket._id, status: "pending" }, { $set: { checkoutRequestID: ticket.checkoutRequestID, merchantRequestID: ticket.merchantRequestID } });
      return res.status(201).json({ message: "M-Pesa STK push initiated — check status at /api/tickets/{id}/status", ticketId: ticket._id.toString() });
    } catch (error) {
      const cleanupSession = await mongoose.startSession();
      try {
        await cleanupSession.withTransaction(async () => {
          await Ticket.updateOne({ _id: ticket._id, status: "pending" }, { $set: { status: "cancelled" } }, { session: cleanupSession });
          await Event.updateOne({ _id: event._id, reservedTickets: { $gte: ticket.quantity } }, { $inc: { reservedTickets: -ticket.quantity } }, { session: cleanupSession });
          await Transaction.updateOne({ ticket: ticket._id, status: "pending" }, { $set: { status: "failed", resultDesc: error.message || "STK push failed" } }, { session: cleanupSession });
        });
      } finally { await cleanupSession.endSession(); }
      console.error("STK push initiation failed:", error);
      return res.status(502).json({ message: "Could not initiate M-Pesa payment. Please try again." });
    }
  } catch (err) {
    if (session) await session.endSession().catch(() => {});
    console.error("purchaseEventTicket error:", err);
    return res.status(err.status || 500).json({ message: err.message || "Server error purchasing ticket" });
  }
}

module.exports = { createEvent, getPublicEvents, getMyEvents, getEventAnalytics, getEventById, updateEvent, deleteEvent, purchaseEventTicket };
