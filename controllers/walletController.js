// controllers/walletController.js
const Wallet = require('../models/Wallet.js');

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

module.exports = { getMyWallet };