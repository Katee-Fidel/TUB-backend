const jwt = require("jsonwebtoken");

function ticketSigningSecret() {
  // A dedicated secret is preferred. The access-token secret is retained as a
  // temporary fallback so existing development environments keep working.
  return process.env.JWT_TICKET_SECRET || process.env.JWT_ACCESS_SECRET;
}

function createTicketToken(ticket) {
  return jwt.sign(
    {
      ticketId: ticket._id.toString(),
      eventId: ticket.event.toString(),
      purpose: "ticket-admission",
    },
    ticketSigningSecret(),
    { expiresIn: process.env.TICKET_TOKEN_EXPIRATION || "180d" }
  );
}

function verifyTicketToken(token) {
  const payload = jwt.verify(token, ticketSigningSecret());
  if (payload.purpose !== "ticket-admission" || !payload.ticketId || !payload.eventId) {
    throw new Error("Invalid ticket token");
  }
  return payload;
}

module.exports = { createTicketToken, verifyTicketToken };
