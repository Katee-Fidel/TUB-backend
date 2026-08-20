const jwt = require('jsonwebtoken');

 function signAccessToken(user) {
    return jwt.sign(
        { id: user._id.toString(), role: user.role},
        process.env.JWT_ACCESS_SECRET,
        {expiresIn: process.env.JWT_ACCESS_EXPIRATION || "15m"}
    );
}

 function signRefreshToken(user) {
    return jwt.sign(
        {id: user._id.toString()},
        process.env.JWT_REFRESH_SECRET,
        {expiresIn: process.env.JWT_REFRESH_EXPIRATION || "7d"}
    );
}

 function verifyAccessToken(token) {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

 function verifyRefreshToken(token) {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

function cookieOptions(maxAgeMs) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: maxAgeMs,
        path: "/",
    };
}

module.exports = {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    cookieOptions,
}