const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.js');
const { verifyOrigin } = require('../middleware/csrf.js');
const { getArtistDashboard } = require('../controllers/artistDashboardController.js');

const router = express.Router();
router.use(verifyOrigin);
router.get('/', requireAuth, requireRole('artist'), getArtistDashboard);

module.exports = router;
