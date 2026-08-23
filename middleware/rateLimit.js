const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, //15 mins
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {message: "Too many login attempts. Please try again in 15 minutes"}
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    messagge: {message: "Too many accounts created from this location. Please try again later."}
});

module.exports = {loginLimiter, registerLimiter};