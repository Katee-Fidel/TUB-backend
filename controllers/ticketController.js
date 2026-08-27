const Ticket = require("../models/Ticket.js");
const Event = require("../models/Event.js");
const { verifyTicketToken } = require("../utils/ticketToken.js");

// GET /api/tickets/mine  (authenticated — user's own tickets only)
async function getMyTickets(req, res) {
  try {
    const tickets = await Ticket.find({ user: req.user.id })
      .populate("event", "title date venue bannerUrl")
      .sort({ createdAt: -1 });

    return res.status(200).json({ tickets });
  } catch (err) {
    console.error("getMyTickets error:", err);
    return res.status(500).json({ message: "Server error fetching tickets" });
  }
}

// GET /api/tickets/:id/status  (authenticated — check ticket status for polling)
async function getTicketStatus(req, res) {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Ensure user can only check their own tickets
    if (ticket.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "You do not own this ticket" });
    }

    // Return the ticket with its current status for polling
    return res.status(200).json({
      status: ticket.status, // 'pending', 'paid', 'cancelled', 'used'
      ticket: ticket.toObject(),
    });
  } catch (err) {
    console.error("getTicketStatus error:", err);
    return res.status(500).json({ message: "Server error checking ticket status" });
  }
}

// POST /api/tickets/validate (artist only — scan a signed ticket QR token)
async function validateTicket(req, res) {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) {
      return res.status(400).json({ message: "A ticket QR token is required" });
    }

    let payload;
    try {
      payload = verifyTicketToken(token);
    } catch (_error) {
      return res.status(400).json({ message: "Invalid or expired ticket QR code" });
    }

    const event = await Event.findOne({ _id: payload.eventId, artist: req.user.id });
    if (!event) {
      return res.status(403).json({ message: "You cannot validate tickets for this event" });
    }

    // The conditional update makes scanning idempotent: only a paid, unused
    // ticket can be admitted, even when two devices scan it at the same time.
    const ticket = await Ticket.findOneAndUpdate(
      { _id: payload.ticketId, event: event._id, status: "paid" },
      { $set: { status: "used" } },
      { new: true }
    ).populate("event", "title date venue").populate("user", "name email");

    if (ticket) {
      return res.status(200).json({ message: "Ticket accepted", ticket });
    }

    const existingTicket = await Ticket.findOne({ _id: payload.ticketId, event: event._id });
    if (!existingTicket) {
      return res.status(400).json({ message: "Ticket does not match this event" });
    }
    if (existingTicket.status === "used") {
      return res.status(409).json({ message: "This ticket has already been used" });
    }
    return res.status(400).json({ message: "This ticket is not paid or is no longer valid" });
  } catch (error) {
    console.error("validateTicket error:", error);
    return res.status(500).json({ message: "Could not validate ticket" });
  }
}

module.exports = {
  getMyTickets,
  getTicketStatus,
  validateTicket,
};
