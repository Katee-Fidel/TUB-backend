require('dotenv').config()

const express = require('express');
const dns = require('dns');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/dbcon.js');
const Transaction = require('./models/Transaction.js');
const authRoutes = require('./routes/authRoutes.js');
const eventRoutes = require('./routes/eventRoutes.js');
const walletRoutes = require('./routes/walletRoutes.js');
const ticketRoutes = require('./routes/ticketRoutes.js');
const postRoutes = require('./routes/postRoutes.js');
const userRoutes = require('./routes/userRoutes.js');
const { handleMpesaCallback } = require('./controllers/walletController.js');

const app = express()
const PORT = process.env.PORT || 5000

app.set('trust proxy', 1);

dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);

app.use(
    cors({
        origin: process.env.CLIENT_URL,
        credentials: true,
    })
)

app.use(express.json());
app.use(cookieParser())

const ensureTransactionIndexes = async () => {
    const collection = Transaction.collection;
    const indexes = await collection.indexes();

    const checkoutIndex = indexes.find((index) => index.name === 'checkoutRequestID_1');
    const receiptIndex = indexes.find((index) => index.name === 'mpesaReceiptNumber_1');

    // Older deployments created ordinary unique indexes. Remove only those
    // legacy indexes; the schema below recreates nullable-safe partial indexes.
    if (checkoutIndex && !checkoutIndex.partialFilterExpression) {
        await collection.dropIndex('checkoutRequestID_1');
    }

    if (receiptIndex && !receiptIndex.partialFilterExpression) {
        await collection.dropIndex('mpesaReceiptNumber_1');
    }

    await collection.createIndex(
        { checkoutRequestID: 1 },
        {
            name: 'checkoutRequestID_1',
            unique: true,
            partialFilterExpression: { checkoutRequestID: { $type: 'string' } },
        }
    ).catch((error) => {
        if (error.code !== 85 && error.code !== 86) throw error;
    });

    await collection.createIndex(
        { mpesaReceiptNumber: 1 },
        {
            name: 'mpesaReceiptNumber_1',
            unique: true,
            partialFilterExpression: { mpesaReceiptNumber: { $type: 'string' } },
        }
    ).catch((error) => {
        if (error.code !== 85 && error.code !== 86) throw error;
    });
};

const startServer = async () => {
    try {
        await connectDB();
        await ensureTransactionIndexes();

        app.listen(PORT, () => {
            console.log(`Server is listening at http://localhost:${PORT}`)
        })
    } catch (error) {
        console.error("Server startup failed:", error);
        process.exit(1);
    }
};

startServer();

app.get('/api/health', (req, res) => {
    res.json(
        {
            status: "Ok Tub server is running and healthy"
        }
    )
})

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
