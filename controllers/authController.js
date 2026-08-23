const bcrypt = require('bcryptjs');
const User = require('../models/User.js');
const Wallet = require('../models/Wallet.js');
const {signAccessToken, signRefreshToken, verifyRefreshToken, cookieOptions,} = require('../utils/jwt.js')


const ACCESS_MAX_AGE =15 * 60 * 1000;
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function setAuthCookies(res, user) {
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.cookie("accessToken", accessToken, cookieOptions(ACCESS_MAX_AGE));
    res.cookie("refreshToken", refreshToken, cookieOptions(REFRESH_MAX_AGE));
}

async function register(req, res) {
    try {
        const {name, email, phone, password, role} = req.body;
        if (!name || !email || !phone || !password || !role) {
            return res.status(400).json({
                message: "Oops you forgot something"
            })
        }
        if (!["fan", "artist"].includes(role)) {
            return res.status(400).json(
                {
                    message: "Pick a side 'fan' or 'artist'"
                }
            )
        }

        const existing = await User.findOne({ email: email.toLowerCase() });
        if(existing) {
            return res.status(409).json({
                message: "Sorry email already registered"
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, phone, passwordHash, role});

        // Every user gets a wallet on signup 
        const wallet = await Wallet.create({user: user._id});
        user.wallet = wallet._id;
        await user.save();


        setAuthCookies(res, user);
        
        return res.status(201).json({ user });
    } catch(error) {
        console.error("register error:", error);
        return res.status(500).json(
            {
                message: "Server error during registeration"
            }
        );
    }
}


async function login(req, res) {
    try {
        const {email, password } = req.body;
        if(!email || !password) {
            return res.status(400).json({
                message: "Boss Email and password are required"
            })
        }

        const user = await User.findOne({email: email.toLowerCase()});
        if (!user) {
            return res.status(401).json(
                {
                    message: "Invalid credentials"
                }
            );
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json(
                {
                    message: "Invalid credentials"
                }
            )
        }

        setAuthCookies(res, user);
        return res.status(200).json({user});

    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            message: "Server error during login"
        })
    }
}

async function refresh(req, res) {
    try {
        const token = req.cookies?.refreshToken;
        if(!token) {
            return res.status(401).json({
                message: "No refresh token"
            })
        }

        const decoded = verifyRefreshToken(token);
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                message: "User no longer exists"
            })
        }

        const accessToken = signAccessToken(user);
        res.cookie("accessToken", accessToken, cookieOptions(ACCESS_MAX_AGE));

        return res.status(200).json({
            message: "Token refreshed"
        })

    } catch(error) {
        return res.status(401).json({
            message: "Invalid or expired refresh token"
        });
    }
}

async function logout(req, res) {
    res.clearCookie("accessToken", cookieOptions(0));
    res.clearCookie("refreshToken", cookieOptions(0));
    return res.status(200).json({
        message: "Logged out - See you soon :-)"
    })
}

async function me(req, res) {
    const user = await User.findById(req.user.id);
    if(!user) {
        return res.status(404).json({
            message: "User not found"
        });
    }
    return res.status(200).json({user})
}

module.exports = {register, login, refresh, logout, me};