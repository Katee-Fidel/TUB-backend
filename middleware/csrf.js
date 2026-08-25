// middleware/csrf.js
//
// Lightweight CSRF mitigation for cookie-based auth with sameSite: "none"
// in production (required for the Vercel <-> Render cross-domain split).
//
// The gap this closes: CORS's origin whitelist only stops a malicious
// page's JS from *reading* our response. It does NOT stop the browser from
// *sending* the request in the first place — a plain HTML <form> POST with
// multipart/form-data is a CORS "simple request" and skips preflight
// entirely, so it reaches the server with the victim's cookies attached
// regardless of what CORS allows. This middleware closes that gap by
// requiring the Origin header on state-changing requests to match our own
// frontend, rejecting anything else before it reaches a controller.
//
// Deliberately NOT applied globally. Any route that receives a genuine
// server-to-server call with no browser Origin — e.g. the M-Pesa callback
// webhook (Day 4) — must never use this, since Safaricom's servers will
// never send an Origin header matching CLIENT_URL. That route needs its own
// validation (payload/IP-based), not this one. Mount this per-router
// instead of in server.js so each router opts in deliberately.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function verifyOrigin(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
        return next();
    }

    const origin = req.get("origin");

    if (!origin || origin !== process.env.CLIENT_URL) {
        return res.status(403).json({ message: "Request origin not allowed" });
    }

    return next();
}

module.exports = { verifyOrigin };