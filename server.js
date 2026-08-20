require('dotenv').config()

const express = require('express');
const dns = require('dns');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/dbcon.js');

const app = express()
const PORT =process.env.PORT

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
    await connectDB();

    app.listen(PORT, () => {
        console.log(`Server is listening at http://localhost:${PORT}`)
    })
};

startServer();


app.get('/api/health', (req, res) => {
    res.json(
        {
            status: "Ok Tub server is running and healthy"
        }
    )
})