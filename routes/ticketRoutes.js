const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.js');
const { verifyOrigin } = require('../middleware/csrf.js');
const { getMyTickets, getTicketStatus, validateTicket } = require('../controllers/ticketController.js');

const router = express.Router();

router.use(requireAuth); // All ticket routes require authentication

router.get('/mine', getMyTickets);
router.post('/validate', verifyOrigin, requireRole('artist'), validateTicket);
router.get('/:id/status', getTicketStatus);

module.exports = router;
