// routes/walletRoutes.js
const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const { verifyOrigin } = require('../middleware/csrf.js');
const {
    getMyWallet,
    topupWallet,
    getTopupStatus,
} = require('../controllers/walletController.js');

const router = express.Router();

router.get('/', requireAuth, getMyWallet);
router.post('/topup', requireAuth, verifyOrigin, topupWallet);
router.get('/topup/:id/status', requireAuth, getTopupStatus);

module.exports = router;