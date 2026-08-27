const DARAJA_BASE_URL =
    process.env.DARAJA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken(forceRefresh = false) {
    if (!forceRefresh && cachedToken && Date.now() < cachedTokenExpiresAt) {
        return cachedToken;
    }

    const consumerKey = process.env.DARAJA_CONSUMER_KEY;
    const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;

    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

    const res = await fetch(`${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
            Authorization: `Basic ${credentials}`,
            Accept: "application/json",
        },
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        const contentType = res.headers.get("content-type") || "unknown";
        const requestId =
            res.headers.get("x-request-id") ||
            res.headers.get("x-correlation-id") ||
            res.headers.get("x-amzn-requestid") ||
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
            status: res.status,
            statusText: res.statusText,
            baseUrl: DARAJA_BASE_URL,
            environment: process.env.DARAJA_ENV || "sandbox(default)",
            contentType,
            bodyLength: body.length,
            requestId,
            consumerKeyConfigured: Boolean(consumerKey),
            consumerSecretConfigured: Boolean(consumerSecret),
            consumerKeyLength: consumerKey?.length || 0,
            consumerSecretLength: consumerSecret?.length || 0,
        });

        throw new Error(
            `Daraja OAuth request failed (${res.status}): ${details || "Provider returned an empty error response"}`
        );
    }

    const data = await res.json();

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

    // A server can retain a token after Daraja invalidates it. Refresh once and
    // retry the exact request; do not retry other failures to avoid duplicate STK prompts.
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
