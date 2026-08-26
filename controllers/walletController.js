// controllers/walletController.js
const Wallet = require('../models/Wallet.js');
const Transaction = require('../models/Transaction.js');
const Ticket = require('../models/Ticket.js');
const Event = require('../models/Event.js');
const { initiateStkPush } = require('../utils/mpesa.js');
const { generateAndUploadQRCode } = require('../utils/qrCode.js');

async function getMyWallet(req, res) {
    try {
        const wallet = await Wallet.findOne({ user: req.user.id }).populate(
            "savingGoals.event",
            "title date bannerUrl"
        );

        // Every user gets a wallet on signup (see authController.register), so
        // this should be unreachable in normal operation — but don't silently
        // auto-create one here if it's somehow missing, since that would mask
        // a real data-integrity bug instead of surfacing it.
        if (!wallet) {
            return res.status(404).json({ message: "Wallet not found" });
        }

        return res.status(200).json({ wallet });
    } catch (error) {
        console.error("getMyWallet error:", error);
        return res.status(500).json({ message: "Could not load wallet" });
    }
}

async function topupWallet(req, res) {
    try {
        const amount = Number(req.body.amount);
        const rawPhone = String(req.body.phone || "").trim();

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ message: "Top-up amount must be greater than 0" });
        }

        if (!rawPhone) {
            return res.status(400).json({ message: "Phone number is required" });
        }

        const normalizedPhone = rawPhone.replace(/^\+/, "").replace(/^0/, "254");
        const phonePattern = /^254\d{9}$/;

        if (!phonePattern.test(normalizedPhone)) {
            return res.status(400).json({ message: "Enter a valid phone number in the format 2547xx..." });
        }

        let wallet = await Wallet.findOne({ user: req.user.id });
        if (!wallet) {
            return res.status(404).json({ message: "Wallet not found" });
        }

        const transaction = await Transaction.create({
            user: req.user.id,
            wallet: wallet._id,
            amount,
            phone: normalizedPhone,
            merchantRequestID: `pending-${Date.now()}`,
            checkoutRequestID: `pending-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
            status: "pending",
        });

        try {
            const response = await initiateStkPush({
                phone: normalizedPhone,
                amount,
                accountReference: `TUB-${wallet._id.toString().slice(-6)}`,
                transactionDesc: "Wallet top up",
            });

            transaction.merchantRequestID = response.MerchantRequestID || transaction.merchantRequestID;
            transaction.checkoutRequestID = response.CheckoutRequestID || transaction.checkoutRequestID;
            transaction.resultDesc = response.ResponseDescription || "STK push initiated";
            await transaction.save();

            return res.status(200).json({
                message: "Top-up request initiated",
                transaction,
            });
        } catch (error) {
            transaction.status = "failed";
            transaction.resultDesc = error.message || "STK push failed";
            await transaction.save();
            return res.status(502).json({ message: "Could not initiate M-Pesa request. Please try again." });
        }
    } catch (error) {
        console.error("topupWallet error:", error);
        return res.status(500).json({ message: "Could not create wallet top-up" });
    }
}

async function getTopupStatus(req, res) {
    try {
        const transaction = await Transaction.findOne({
            _id: req.params.id,
            user: req.user.id,
        });

        if (!transaction) {
            return res.status(404).json({ message: "Top-up not found" });
        }

        return res.status(200).json({ transaction });
    } catch (error) {
        console.error("getTopupStatus error:", error);
        return res.status(500).json({ message: "Could not load top-up status" });
    }
}

async function handleMpesaCallback(req, res) {
    try {
        const callback = req.body?.Body?.stkCallback;

        if (!callback) {
            return res.status(400).json({ ResultCode: 1, ResultDesc: "Missing callback payload" });
        }

        const checkoutRequestID = callback.CheckoutRequestID;
        const merchantRequestID = callback.MerchantRequestID;
        const resultCode = Number(callback.ResultCode ?? -1);
        const resultDesc = callback.ResultDesc || "M-Pesa callback received";

        // Try to find in transactions (wallet topup)
        let transaction = await Transaction.findOne({ checkoutRequestID });
        
        if (transaction) {
            // Handle wallet topup callback
            if (merchantRequestID) {
                transaction.merchantRequestID = merchantRequestID;
            }

            transaction.resultCode = resultCode;
            transaction.resultDesc = resultDesc;

            if (transaction.status === "completed") {
                await transaction.save();
                return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
            }

            if (resultCode !== 0) {
                transaction.status = "failed";
                await transaction.save();
                return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
            }

            const callbackItems = callback.CallbackMetadata?.Item || [];
            const metadata = {};
            for (const item of callbackItems) {
                if (item && item.Name) {
                    metadata[item.Name] = item.Value;
                }
            }

            const callbackAmount = Number(metadata.Amount ?? transaction.amount);
            if (!Number.isFinite(callbackAmount) || callbackAmount <= 0) {
                transaction.status = "failed";
                transaction.resultDesc = "Invalid callback amount";
                await transaction.save();
                return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
            }

            const wallet = await Wallet.findById(transaction.wallet);
            if (!wallet) {
                transaction.status = "failed";
                transaction.resultDesc = "Wallet not found";
                await transaction.save();
                return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
            }

            if (Math.abs(callbackAmount - Number(transaction.amount)) > 0.01) {
                transaction.status = "failed";
                transaction.resultDesc = "Callback amount mismatch";
                await transaction.save();
                return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
            }

            wallet.balance = Number(wallet.balance || 0) + callbackAmount;
            await wallet.save();

            transaction.status = "completed";
            await transaction.save();

            return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        // Try to find in tickets (ticket purchase)
        const ticket = await Ticket.findOne({ checkoutRequestID });
        
        if (ticket) {
            // Handle ticket purchase callback
            if (ticket.status === "paid") {
                // Already processed
                return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
            }

            if (resultCode !== 0) {
                // Payment failed
                ticket.status = "cancelled";
                await ticket.save();
                return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
            }

            const callbackItems = callback.CallbackMetadata?.Item || [];
            const metadata = {};
            for (const item of callbackItems) {
                if (item && item.Name) {
                    metadata[item.Name] = item.Value;
                }
            }

            const callbackAmount = Number(metadata.Amount ?? ticket.totalAmount);
            if (!Number.isFinite(callbackAmount) || callbackAmount <= 0) {
                ticket.status = "cancelled";
                await ticket.save();
                return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
            }

            // Verify amount matches
            if (Math.abs(callbackAmount - Number(ticket.totalAmount)) > 0.01) {
                ticket.status = "cancelled";
                await ticket.save();
                return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
            }

            // Generate QR code for the ticket
            try {
                const qrImageUrl = await generateAndUploadQRCode(ticket.qrCode, ticket._id.toString());
                ticket.qrImageUrl = qrImageUrl;
            } catch (err) {
                console.error("QR code generation failed:", err);
                // Don't fail the callback if QR generation fails — mark as paid anyway
                ticket.qrImageUrl = null;
            }

            // Mark ticket as paid
            ticket.status = "paid";
            ticket.merchantRequestID = merchantRequestID || ticket.merchantRequestID;
            await ticket.save();

            // Update event sold count
            const event = await Event.findById(ticket.event);
            if (event) {
                event.ticketsSold += ticket.quantity;
                await event.save();
            }

            return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        // No matching transaction or ticket
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (error) {
        console.error("handleMpesaCallback error:", error);
        return res.status(500).json({ ResultCode: 1, ResultDesc: "Server error" });
    }
}

module.exports = { getMyWallet, topupWallet, getTopupStatus, handleMpesaCallback };