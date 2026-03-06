const mongoose = require('mongoose');

const chickenStockSchema = new mongoose.Schema({
  chickenType: {
    type: String,
    enum: ['broiler', 'noiler', 'turkey'],
    required: [true, 'Chicken type is required'],
    unique: true
  },
  currentStock: {
    type: Number,
    default: 0,
    min: 0
  },
  totalPurchased: {
    type: Number,
    default: 0,
    min: 0
  },
  totalSold: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Ensure virtuals are included
chickenStockSchema.set('toJSON', { virtuals: true });
chickenStockSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('ChickenStock', chickenStockSchema);
