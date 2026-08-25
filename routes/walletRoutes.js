// routes/walletRoutes.js
const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const { getMyWallet } = require('../controllers/walletController.js');

const router = express.Router();

router.get('/', requireAuth, getMyWallet);

module.exports = router;