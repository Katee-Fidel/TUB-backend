require('dotenv').config()

const express = require('express');
const dns = require('dns');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const connectDB = require('./config/dbcon.js');
const Transaction = require('./models/Transaction.js');
const authRoutes = require('./routes/authRoutes.js');
const eventRoutes = require('./routes/eventRoutes.js');
const walletRoutes = require('./routes/walletRoutes.js');
const ticketRoutes = require('./routes/ticketRoutes.js');
const postRoutes = require('./routes/postRoutes.js');
const userRoutes = require('./routes/userRoutes.js');
const { handleMpesaCallback } = require('./controllers/walletController.js');
const { getAccessToken, getNetworkDiagnostics } = require('./utils/mpesa.js');

const app = express()
const PORT = process.env.PORT || 5000

app.set('trust proxy', 1);
dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))
app.use(express.json());
app.use(cookieParser())

const ensureTransactionIndexes = async () => {
    const collection = Transaction.collection;
    const indexes = await collection.indexes();
    const checkoutIndex = indexes.find((index) => index.name === 'checkoutRequestID_1');
    const receiptIndex = indexes.find((index) => index.name === 'mpesaReceiptNumber_1');

    if (checkoutIndex && !checkoutIndex.partialFilterExpression) await collection.dropIndex('checkoutRequestID_1');
    if (receiptIndex && !receiptIndex.partialFilterExpression) await collection.dropIndex('mpesaReceiptNumber_1');

    await collection.createIndex({ checkoutRequestID: 1 }, {
        name: 'checkoutRequestID_1', unique: true,
        partialFilterExpression: { checkoutRequestID: { $type: 'string' } },
    }).catch((error) => { if (error.code !== 85 && error.code !== 86) throw error; });

    await collection.createIndex({ mpesaReceiptNumber: 1 }, {
        name: 'mpesaReceiptNumber_1', unique: true,
        partialFilterExpression: { mpesaReceiptNumber: { $type: 'string' } },
    }).catch((error) => { if (error.code !== 85 && error.code !== 86) throw error; });
};

const startServer = async () => {
    try {
        await connectDB();
        await ensureTransactionIndexes();
        app.listen(PORT, () => console.log(`Server is listening at http://localhost:${PORT}`));
    } catch (error) {
        console.error("Server startup failed:", error);
        process.exit(1);
    }
};

startServer();

app.get('/api/health', (_req, res) => res.json({ status: "Ok Tub server is running and healthy" }));

const requireMpesaDiagnosticToken = (req, res) => {
    const expectedToken = process.env.MPESA_DIAGNOSTIC_TOKEN;
    if (!expectedToken || req.get('x-mpesa-diagnostic-token') !== expectedToken) {
        res.status(404).json({ message: 'Not found' });
        return false;
    }
    return true;
};

const fingerprint = (value) => value
    ? crypto.createHash('sha256').update(value, 'utf8').digest('hex')
    : null;

app.get('/api/mpesa/diagnostics/oauth', async (req, res) => {
    if (!requireMpesaDiagnosticToken(req, res)) return;

    try {
        const startedAt = Date.now();
        await getAccessToken(true);
        return res.json({
            ok: true,
            environment: process.env.DARAJA_ENV || 'sandbox(default)',
            baseUrl: process.env.DARAJA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke',
            elapsedMs: Date.now() - startedAt,
            consumerKeyConfigured: Boolean(process.env.DARAJA_CONSUMER_KEY),
            consumerSecretConfigured: Boolean(process.env.DARAJA_CONSUMER_SECRET),
            consumerKeyLength: process.env.DARAJA_CONSUMER_KEY?.length || 0,
            consumerSecretLength: process.env.DARAJA_CONSUMER_SECRET?.length || 0,
        });
    } catch (error) {
        return res.status(502).json({
            ok: false,
            environment: process.env.DARAJA_ENV || 'sandbox(default)',
            baseUrl: process.env.DARAJA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke',
            error: error.message,
            consumerKeyConfigured: Boolean(process.env.DARAJA_CONSUMER_KEY),
            consumerSecretConfigured: Boolean(process.env.DARAJA_CONSUMER_SECRET),
            consumerKeyLength: process.env.DARAJA_CONSUMER_KEY?.length || 0,
            consumerSecretLength: process.env.DARAJA_CONSUMER_SECRET?.length || 0,
        });
    }
});

app.get('/api/mpesa/diagnostics/network', async (req, res) => {
    if (!requireMpesaDiagnosticToken(req, res)) return;

    try {
        return res.json({ ok: true, ...(await getNetworkDiagnostics()) });
    } catch (error) {
        return res.status(502).json({ ok: false, error: error.message });
    }
});

app.get('/api/mpesa/diagnostics/config', (req, res) => {
    if (!requireMpesaDiagnosticToken(req, res)) return;

    const consumerKey = process.env.DARAJA_CONSUMER_KEY || '';
    const consumerSecret = process.env.DARAJA_CONSUMER_SECRET || '';
    const passkey = process.env.DARAJA_PASSKEY || '';
    const callbackUrl = process.env.DARAJA_CALLBACK_URL || '';

    return res.json({
        environment: process.env.DARAJA_ENV || 'sandbox(default)',
        consumerKey: { configured: Boolean(consumerKey), length: consumerKey.length, sha256: fingerprint(consumerKey) },
        consumerSecret: { configured: Boolean(consumerSecret), length: consumerSecret.length, sha256: fingerprint(consumerSecret) },
        passkey: { configured: Boolean(passkey), length: passkey.length, sha256: fingerprint(passkey) },
        shortcode: { configured: Boolean(process.env.DARAJA_SHORTCODE), value: process.env.DARAJA_SHORTCODE || null },
        callbackUrl: { configured: Boolean(callbackUrl), value: callbackUrl || null },
    });
});

app.post('/api/mpesa/callback', handleMpesaCallback);
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
});
