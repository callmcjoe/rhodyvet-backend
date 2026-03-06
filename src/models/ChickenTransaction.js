const mongoose = require('mongoose');

const chickenTransactionSchema = new mongoose.Schema({
  transactionNumber: {
    type: String,
    unique: true
  },
  transactionType: {
    type: String,
    enum: ['purchase', 'sale'],
    required: [true, 'Transaction type is required']
  },
  chickenType: {
    type: String,
    enum: ['broiler', 'noiler', 'turkey'],
    required: [true, 'Chicken type is required']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1']
  },
  pricePerUnit: {
    type: Number,
    required: [true, 'Price per unit is required'],
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  notes: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Static method to generate transaction number
chickenTransactionSchema.statics.generateTransactionNumber = async function() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  const count = await this.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });

  const sequence = (count + 1).toString().padStart(4, '0');
  return `CHK-${year}${month}${day}-${sequence}`;
};

// Ensure virtuals are included
chickenTransactionSchema.set('toJSON', { virtuals: true });
chickenTransactionSchema.set('toObject', { virtuals: true });

// Indexes
chickenTransactionSchema.index({ transactionType: 1 });
chickenTransactionSchema.index({ chickenType: 1 });
chickenTransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ChickenTransaction', chickenTransactionSchema);
