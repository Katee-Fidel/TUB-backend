const express = require('express');
const {requireAuth, requireRole, optionalAuth} = require('../middleware/auth.js');
const { uploadBanner } = require('../config/cloudinary.js');
const {verifyOrigin} = require('../middleware/csrf.js');
const {
    createEvent,
    getPublicEvents,
    getMyEvents,
    getEventById,
    updateEvent,
    deleteEvent,
} = require('../controllers/eventController.js');

const router = express.Router();

router.use(verifyOrigin);

router.get('/', getPublicEvents);
router.get('/mine', requireAuth, requireRole('artist'), getMyEvents);
router.get('/ping-fan-blocked', requireAuth, requireRole('artist'), (req, res) => {
    res.status(200).json({
        message: "If you see this weh ni msanii"
    });
});
router.post('/', requireAuth, requireRole('artist'), uploadBanner.single('banner'), createEvent);
router.get('/:id', optionalAuth, getEventById);
router.patch('/:id', requireAuth, requireRole('artist'), uploadBanner.single('banner'), updateEvent);
router.delete('/:id', requireAuth, requireRole('artist'), deleteEvent);

module.exports = router;
