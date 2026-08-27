const https = require("https");

const DARAJA_BASE_URL =
    process.env.DARAJA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function requestOAuthToken() {
    return new Promise((resolve, reject) => {
        const consumerKey = process.env.DARAJA_CONSUMER_KEY;
        const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
        const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
        const url = new URL(`${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`);

        const req = https.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port || 443,
                path: `${url.pathname}${url.search}`,
                method: "GET",
                headers: {
                    Authorization: `Basic ${credentials}`,
                    Accept: "application/json",
                    "User-Agent": "TUB-backend/1.0",
                },
            },
            (res) => {
                let body = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    body += chunk;
                });
                res.on("end", () => {
                    resolve({ res, body });
                });
            }
        );

        req.setTimeout(15000, () => {
            req.destroy(new Error("Daraja OAuth request timed out"));
        });
        req.on("error", reject);
        req.end();
    });
}

async function getAccessToken(forceRefresh = false) {
    if (!forceRefresh && cachedToken && Date.now() < cachedTokenExpiresAt) {
        return cachedToken;
    }

    const { res, body } = await requestOAuthToken();

    if (res.statusCode < 200 || res.statusCode >= 300) {
        const contentType = res.headers["content-type"] || "unknown";
        const requestId =
            res.headers["x-request-id"] ||
            res.headers["x-correlation-id"] ||
            res.headers["x-amzn-requestid"] ||
            "none";

        let details = body.trim();
        if (details) {
            try {
                const parsed = JSON.parse(details);
                details =
                    parsed.errorMessage ||
                    parsed.error_description ||
                    parsed.message ||
                    details;
            } catch (_) {
                // Keep the raw response when Daraja does not return JSON.
            }
        }

        console.error("Daraja OAuth rejected request", {
            status: res.statusCode,
            statusText: res.statusMessage,
            baseUrl: DARAJA_BASE_URL,
            environment: process.env.DARAJA_ENV || "sandbox(default)",
            contentType,
            bodyLength: body.length,
            requestId,
            server: res.headers.server || "unknown",
            via: res.headers.via || "none",
            consumerKeyConfigured: Boolean(process.env.DARAJA_CONSUMER_KEY),
            consumerSecretConfigured: Boolean(process.env.DARAJA_CONSUMER_SECRET),
            consumerKeyLength: process.env.DARAJA_CONSUMER_KEY?.length || 0,
            consumerSecretLength: process.env.DARAJA_CONSUMER_SECRET?.length || 0,
        });

        throw new Error(
            `Daraja OAuth request failed (${res.statusCode}): ${details || "Provider returned an empty error response"}`
        );
    }

    let data;
    try {
        data = JSON.parse(body);
    } catch (_) {
        throw new Error("Daraja OAuth response was not valid JSON");
    }

    if (!data.access_token) {
        throw new Error("Daraja OAuth response did not include an access token");
    }

    cachedToken = data.access_token;
    cachedTokenExpiresAt = Date.now() + (Number(data.expires_in || 3599) - 60) * 1000;

    return cachedToken;
}

function isInvalidAccessTokenResponse(data) {
    const message = String(data?.errorMessage || data?.error_description || data?.message || "");
    return message.toLowerCase().includes("invalid access token");
}

async function sendStkPush(token, payload) {
    const res = await fetch(`${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    return { res, data };
}

function buildTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
        now.getFullYear().toString() +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds())
    );
}

function buildPassword(timestamp) {
    const raw = `${process.env.DARAJA_SHORTCODE}${process.env.DARAJA_PASSKEY}${timestamp}`;
    return Buffer.from(raw).toString("base64");
}

async function initiateStkPush({ phone, amount, accountReference, transactionDesc }) {
    const timestamp = buildTimestamp();
    const password = buildPassword(timestamp);

    const payload = {
        BusinessShortCode: process.env.DARAJA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(amount),
        PartyA: phone,
        PartyB: process.env.DARAJA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: process.env.DARAJA_CALLBACK_URL,
        AccountReference: accountReference,
        TransactionDesc: transactionDesc,
    };

    let { res, data } = await sendStkPush(await getAccessToken(), payload);

    if (!res.ok && isInvalidAccessTokenResponse(data)) {
        cachedToken = null;
        cachedTokenExpiresAt = 0;
        ({ res, data } = await sendStkPush(await getAccessToken(true), payload));
    }

    if (!res.ok) {
        const providerMessage = data.errorMessage || data.error_description || "STK push request failed";
        throw new Error(`Daraja STK push failed (${res.status}): ${providerMessage}`);
    }

    return data;
}

module.exports = { getAccessToken, initiateStkPush };
