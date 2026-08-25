
const DARAJA_BASE_URL =
    process.env.DARAJA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

let cachedToken = null;
let cachedTokenExpiresAt = 0;


async function getAccessToken() {
    if (cachedToken && Date.now() < cachedTokenExpiresAt) {
        return cachedToken;
    }

    const credentials = Buffer.from(
        `${process.env.DARAJA_CONSUMER_KEY}:${process.env.DARAJA_CONSUMER_SECRET}`
    ).toString("base64");

    const res = await fetch(`${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${credentials}` },
    });

    if (!res.ok) {
        throw new Error(`Daraja OAuth request failed: ${res.status}`);
    }

    const data = await res.json();

    cachedToken = data.access_token;
   
    cachedTokenExpiresAt = Date.now() + (Number(data.expires_in || 3599) - 60) * 1000;

    return cachedToken;
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
    const token = await getAccessToken();
    const timestamp = buildTimestamp();
    const password = buildPassword(timestamp);

    const res = await fetch(`${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
        }),
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.errorMessage || "STK push request failed");
    }

    return data; 
}

module.exports = { getAccessToken, initiateStkPush };