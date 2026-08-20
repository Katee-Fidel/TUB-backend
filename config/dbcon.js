const mongoose = require('mongoose');

const connectDB = async () => {
    try{
        const conn = await mongoose.connect(process.env.MONGODB_URI)
        console.log(`Mongo db connected to the TubVerse database: ${conn.connection.host}`)
    } catch(error) {
        console.error(`Error connecting to the TubVerse: ${error.message}`);
        process.exit(1)
    }
}

module.exports = connectDB;