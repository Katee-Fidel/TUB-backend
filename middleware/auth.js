const {verifyAccessToken} = require ('../utils/jwt.js');

function optionalAuth(req, _res, next) {
    const token = req.cookies?.accessToken;
    if (token) {
        try {
            const decoded = verifyAccessToken(token);
            req.user = {id: decoded.id, role: decoded.role};
        } catch (error) {
            // An invalid optional cookie should not block public requests.
        }
    }
    next();
}

 function requireAuth(req, res, next) {
    const token = req.cookies?.accessToken;

    if(!token) {
        return res.status(401).json({
            message: "Not Authenticated"
        })
    }
    try {
        const decoded = verifyAccessToken(token);
        req.user = {id: decoded.id, role: decoded.role};
        next();
    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired token"
        })
    }
}


 function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                message: "Not Authenticated"
            });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: `Forbidden: requires role ${allowedRoles.join("or")}`,
            });
        }
        next();
    };
}

module.exports = { requireAuth, requireRole, optionalAuth};

