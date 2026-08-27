const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const { verifyOrigin } = require('../middleware/csrf.js');
const {
  getMyWallet,
  getWalletTransactions,
  topupWallet,
  getTopupStatus,
} = require('../controllers/walletController.js');
const { contributeSavings, refundTicket } = require('../controllers/ledgerController.js');

const router = express.Router();

router.get('/', requireAuth, getMyWallet);
router.get('/transactions', requireAuth, getWalletTransactions);
router.post('/topup', requireAuth, verifyOrigin, topupWallet);
router.get('/topup/:id/status', requireAuth, getTopupStatus);
router.post('/savings/contribute', requireAuth, verifyOrigin, contributeSavings);
router.post('/refund/:ticketId', requireAuth, verifyOrigin, refundTicket);

module.exports = router;
