const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
    {
        name: {type: String, required: true, trim: true},
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        phone: {type: String, required: true, trim: true},
        passwordHash: {type: String, required: true},
        role: {
            type: String,
            enum: ["fan", "artist"],
            required: true,
            default: "fan",
        },
        avatarUrl: {type: String, default:""},
        wallet: {type: mongoose.Schema.Types.ObjectId, ref: "Wallet"},
    },
    {timestamps: true}
);

// Compares plaintext to stored hash
userSchema.methods.comparePassword = function (plainPassword) {
    return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.passwordHash;
        return ret;
    }
}) 

module.exports = mongoose.model('User', userSchema);
