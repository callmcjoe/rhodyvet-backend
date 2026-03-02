const mongoose = require('mongoose');

const stockLogSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  department: {
    type: String,
    enum: ['feeds', 'store'],
    required: true
  },
  actionType: {
    type: String,
    enum: ['stock_in', 'stock_out', 'adjustment', 'sale', 'refund'],
    required: true
  },
  // For bag-based products
  previousStockInPaints: {
    type: Number
  },
  quantityChangedInPaints: {
    type: Number
  },
  newStockInPaints: {
    type: Number
  },
  // For quantity-based products
  previousStockInQuantity: {
    type: Number
  },
  quantityChangedInQuantity: {
    type: Number
  },
  newStockInQuantity: {
    type: Number
  },
  // Reference to related documents
  saleReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale'
  },
  refundReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Refund'
  },
  notes: {
    type: String,
    trim: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
stockLogSchema.index({ product: 1, createdAt: -1 });
stockLogSchema.index({ actionType: 1, createdAt: -1 });
stockLogSchema.index({ performedBy: 1, createdAt: -1 });
stockLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockLog', stockLogSchema);
