const Event = require("../models/Event.js");
const Ticket = require("../models/Ticket.js");
const Wallet = require("../models/Wallet.js");
const { cloudinary } = require("../config/cloudinary.js");
const { generateAndUploadQRCode } = require("../utils/qrCode.js");
const { initiateStkPush } = require("../utils/mpesa.js");
const { createTicketToken } = require("../utils/ticketToken.js");
const { randomUUID } = require("crypto");

// POST /api/events  (artist only)
async function createEvent(req, res) {
  try {
    const { title, description, venue, date, ticketPrice, totalTickets, status } = req.body;
    if (!title || !description || !venue || !date || ticketPrice === undefined || ticketPrice === "" || totalTickets === undefined || totalTickets === "") return res.status(400).json({ message: "Missing required event fields" });
    const event = await Event.create({ artist: req.user.id, title, description, venue, date, ticketPrice, totalTickets, status: status === "published" ? "published" : "draft", bannerUrl: req.file?.path || "", bannerPublicId: req.file?.filename || "" });
    return res.status(201).json({ event });
  } catch (err) { console.error("createEvent error:", err); return res.status(500).json({ message: "Server error creating event" }); }
}

async function getPublicEvents(req, res) {
  try { const events = await Event.find({ status: "published" }).sort({ date: 1 }).populate("artist", "name avatarUrl"); return res.status(200).json({ events }); }
  catch (err) { console.error("getPublicEvents error:", err); return res.status(500).json({ message: "Server error fetching events" }); }
}

async function getMyEvents(req, res) {
  try { const events = await Event.find({ artist: req.user.id }).sort({ createdAt: -1 }); return res.status(200).json({ events }); }
  catch (err) { console.error("getMyEvents error:", err); return res.status(500).json({ message: "Server error fetching your events" }); }
}

async function getEventById(req, res) {
  try {
    const visibility = [{ status: "published" }];
    if (req.user) visibility.push({ artist: req.user.id });
    const event = await Event.findOne({ _id: req.params.id, $or: visibility }).populate("artist", "name avatarUrl");
    if (!event) return res.status(404).json({ message: "Event not found" });
    return res.status(200).json({ event });
  } catch (err) { return res.status(400).json({ message: "Invalid event id" }); }
}

async function updateEvent(req, res) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.artist.toString() !== req.user.id) return res.status(403).json({ message: "You do not own this event" });
    const editableFields = ["title", "description", "venue", "date", "ticketPrice", "totalTickets", "status"];
    for (const field of editableFields) if (req.body[field] !== undefined) event[field] = req.body[field];
    if (event.totalTickets < event.ticketsSold) return res.status(400).json({ message: "Total tickets cannot be less than tickets already sold" });
    if (req.file) {
      if (event.bannerPublicId) await cloudinary.uploader.destroy(event.bannerPublicId).catch(() => {});
      event.bannerUrl = req.file.path; event.bannerPublicId = req.file.filename;
    }
    await event.save(); return res.status(200).json({ event });
  } catch (err) { console.error("updateEvent error:", err); return res.status(500).json({ message: "Server error updating event" }); }
}

async function deleteEvent(req, res) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.artist.toString() !== req.user.id) return res.status(403).json({ message: "You do not own this event" });
    if (event.bannerPublicId) await cloudinary.uploader.destroy(event.bannerPublicId).catch(() => {});
    await event.deleteOne(); return res.status(200).json({ message: "Event deleted" });
  } catch (err) { console.error("deleteEvent error:", err); return res.status(500).json({ message: "Server error deleting event" }); }
}

async function purchaseEventTicket(req, res) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.status !== "published") return res.status(400).json({ message: "This event is not currently open for ticket purchase" });
    const quantity = Number(req.body.quantity ?? 1);
    const paymentMethod = req.body.paymentMethod || "wallet";
    const phone = req.body.phone || "";
    if (!["wallet", "mpesa"].includes(paymentMethod)) return res.status(400).json({ message: "Invalid payment method" });
    if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ message: "Quantity must be a positive whole number" });
    const remainingTickets = event.totalTickets - event.ticketsSold;
    if (quantity > remainingTickets) return res.status(400).json({ message: `Only ${remainingTickets} ticket(s) remaining for this event` });
    const totalAmount = event.ticketPrice * quantity;
    const ticket = await Ticket.create({ user: req.user.id, event: event._id, quantity, unitPrice: event.ticketPrice, totalAmount, paymentMethod, status: "pending", qrCode: `pending-${randomUUID()}`, qrImageUrl: null });
    ticket.qrCode = createTicketToken(ticket); await ticket.save();

    if (paymentMethod === "wallet") {
      const wallet = await Wallet.findOne({ user: req.user.id });
      if (!wallet) { await ticket.deleteOne(); return res.status(404).json({ message: "Wallet not found" }); }
      if (wallet.balance < totalAmount) { await ticket.deleteOne(); return res.status(400).json({ message: `Insufficient wallet balance (need KES ${totalAmount}, have KES ${wallet.balance})` }); }
      wallet.balance -= totalAmount; await wallet.save();
      const qrImageUrl = await generateAndUploadQRCode(ticket.qrCode, ticket._id.toString());
      ticket.status = "paid"; ticket.qrImageUrl = qrImageUrl; await ticket.save();
      event.ticketsSold += quantity; await event.save();
      return res.status(201).json({ message: "Ticket purchase successful", ticket: ticket.toObject() });
    }

    if (paymentMethod === "mpesa") {
      if (!phone) { await ticket.deleteOne(); return res.status(400).json({ message: "Phone number required for M-Pesa payment" }); }
      const normalizedPhone = String(phone).replace(/^\+/, "").replace(/^0/, "254");
      if (!/^254\d{9}$/.test(normalizedPhone)) { await ticket.deleteOne(); return res.status(400).json({ message: "Invalid phone number format (expected 2547xxxxxxxx)" }); }
      try {
        const stkResponse = await initiateStkPush({ phone: normalizedPhone, amount: Math.round(totalAmount), accountReference: `TUB-${event._id.toString().slice(-6)}-${ticket._id.toString().slice(-6)}`, transactionDesc: `${event.title} - ${quantity} ticket(s)` });
        ticket.checkoutRequestID = stkResponse.CheckoutRequestID || null; ticket.merchantRequestID = stkResponse.MerchantRequestID || null; await ticket.save();
        return res.status(201).json({ message: "M-Pesa STK push initiated — check status at /api/tickets/{id}/status", ticketId: ticket._id.toString() });
      } catch (error) { await ticket.deleteOne(); console.error("STK push initiation failed:", error); return res.status(502).json({ message: "Could not initiate M-Pesa payment. Please try again." }); }
    }
  } catch (err) { console.error("purchaseEventTicket error:", err); return res.status(500).json({ message: "Server error purchasing ticket" }); }
}

module.exports = { createEvent, getPublicEvents, getMyEvents, getEventById, updateEvent, deleteEvent, purchaseEventTicket };
