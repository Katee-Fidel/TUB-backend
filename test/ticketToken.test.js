const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createTicketToken, verifyTicketToken } = require('../utils/ticketToken.js');

process.env.JWT_TICKET_SECRET = 'phase-a-test-ticket-secret';
process.env.TICKET_TOKEN_EXPIRATION = '1h';

test('creates and verifies an admission token with the ticket and event IDs', () => {
  const ticket = {
    _id: '66f000000000000000000001',
    event: '66f000000000000000000002',
  };
  const token = createTicketToken(ticket);
  const payload = verifyTicketToken(token);

  assert.equal(payload.ticketId, ticket._id);
  assert.equal(payload.eventId, ticket.event);
  assert.equal(payload.purpose, 'ticket-admission');
});

test('rejects an admission token signed with another secret', () => {
  const token = jwt.sign(
    {
      ticketId: '66f000000000000000000001',
      eventId: '66f000000000000000000002',
      purpose: 'ticket-admission',
    },
    'wrong-secret',
    { expiresIn: '1h' }
  );

  assert.throws(() => verifyTicketToken(token));
});

test('rejects tokens with the wrong purpose', () => {
  const token = jwt.sign(
    {
      ticketId: '66f000000000000000000001',
      eventId: '66f000000000000000000002',
      purpose: 'not-ticket-admission',
    },
    process.env.JWT_TICKET_SECRET,
    { expiresIn: '1h' }
  );

  assert.throws(() => verifyTicketToken(token), /Invalid ticket token/);
});
