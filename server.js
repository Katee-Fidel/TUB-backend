require('dotenv').config()

const express = require('express');
const dns = require('dns');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/dbcon.js');
const authRoutes = require('./routes/authRoutes.js');
const eventRoutes = require('./routes/eventRoutes.js');


const app = express()
const PORT = process.env.PORT || 5000

dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);

app.use(
    cors({
        origin: process.env.CLIENT_URL,
        credentials: true,
    })
)


app.use(express.json());
app.use(cookieParser())

const startServer = async () => {
    try {
        await connectDB();

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

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});