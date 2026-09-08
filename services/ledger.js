const Transaction = require('../models/Transaction.js');

/**
 * Create a transaction ledger entry.
 *
 * When a MongoDB session is supplied, the transaction is written inside
 * the caller's transaction so ticket inventory, wallet changes, and the
 * corresponding ledger entry remain atomic.
 */
async function createLedgerEntry(data, session = null) {
  const transaction = new Transaction(data);
  if (session) {
    await transaction.save({ session });
  } else {
    await transaction.save();
  }
  return transaction;
}

module.exports = { createLedgerEntry };
