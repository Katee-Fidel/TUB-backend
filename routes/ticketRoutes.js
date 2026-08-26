const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const { getMyTickets, getTicketStatus } = require('../controllers/ticketController.js');

const router = express.Router();

router.use(requireAuth); // All ticket routes require authentication

router.get('/mine', getMyTickets);
router.get('/:id/status', getTicketStatus);

module.exports = router;
