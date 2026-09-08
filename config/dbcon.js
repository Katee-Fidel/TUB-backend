const mongoose = require('mongoose');
const Ticket = require('../models/Ticket.js');

const removeLegacyTicketIndexes = async () => {
    try {
        const indexes = await Ticket.collection.indexes();
        const hasLegacyQrDataIndex = indexes.some((index) => index.name === 'qrData_1');
        if (hasLegacyQrDataIndex) {
            await Ticket.collection.dropIndex('qrData_1');
            console.log('Removed legacy Ticket qrData_1 index');
        }
    } catch (error) {
        console.error(`Ticket index cleanup failed: ${error.message}`);
        throw error;
    }
};

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        await removeLegacyTicketIndexes();
        console.log(`Mongo db connected to the TubVerse database: ${conn.connection.host}`);
    } catch(error) {
        console.error(`Error connecting to the TubVerse: ${error.message}`);
        process.exit(1);
    }
}

module.exports = connectDB;