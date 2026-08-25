const express = require('express')
const {register, login, refresh,logout, me} = require('../controllers/authController.js');
const {requireAuth} = require('../middleware/auth.js');
const {loginLimiter, registerLimiter} = require('../middleware/rateLimit.js')
const {verifyOrigin} = require('../middleware/csrf.js')

const router = express.Router();

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

module.exports = router;