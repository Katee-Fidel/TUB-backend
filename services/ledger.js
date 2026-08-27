const Transaction = require('../models/Transaction.js');

async function createLedgerEntry(data, session) {
  const [entry] = await Transaction.create([data], session ? { session } : undefined);
  return entry;
}

module.exports = { createLedgerEntry };
