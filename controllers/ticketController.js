const Ticket = require("../models/Ticket.js");

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

module.exports = {
  getMyTickets,
  getTicketStatus,
};
