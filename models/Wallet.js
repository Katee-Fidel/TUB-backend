const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
    {
        user: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
        balance: {type: Number, default: 0},
        savingGoals: [
            {
                event: {type: mongoose.Schema.Types.ObjectId, ref: "Event"},
                targetAmount: Number,
                savedAmount: {type: Number, default: 0},
            },
        ],
    },
    {timestamps: true}
);

module.exports = mongoose.model('Wallet', walletSchema);