const express = require('express')
const {register, login, refresh,logout, me} = require('../controllers/authController.js');
const {requireAuth} = require('../middleware/auth.js');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

module.exports = router;