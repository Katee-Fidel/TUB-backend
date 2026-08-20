const express = require('express');
const {requireAuth, requireRole} = require('../middleware/auth.js');

const router = express.Router();

router.post('/', requireAuth, requireRole('artist'), (req, res) => {
    res.status(201).json({
        message: `Event created by artist ${req.user.id} (RBAC check passed)`,
    });
});

router.get('/ping-fan-blocked', requireAuth, requireRole('artist'), (req, res) => {
    res.status(200).json({
        message: "If you see this weh ni msanii"
    });
});

module.exports = router;
