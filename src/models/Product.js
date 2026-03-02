const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  department: {
    type: String,
    enum: ['feeds', 'store'],
    required: [true, 'Department is required']
  },
  unitType: {
    type: String,
    enum: ['bag', 'quantity'],
    required: [true, 'Unit type is required']
  },
  // Pricing for feeds (bag-based products)
  pricePerBag: {
    type: Number,
    min: 0
  },
  pricePerHalfBag: {
    type: Number,
    min: 0
  },
  pricePerThirdBag: {
    type: Number,
    min: 0
  },
  pricePerPaint: {
    type: Number,
    min: 0
  },
  pricePerHalfPaint: {
    type: Number,
    min: 0
  },
  // Pricing for store items (quantity-based)
  pricePerUnit: {
    type: Number,
    min: 0
  },
  // Stock stored in smallest unit (paints for feeds, quantity for store)
  // For feeds: 1 bag = 8 paints, so stock is in paints
  stockInPaints: {
    type: Number,
    default: 0,
    min: 0
  },
  // For store items: stock in units
  stockInQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  lowStockThreshold: {
    type: Number,
    default: 10
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Virtual for current stock in bags (for display)
productSchema.virtual('stockInBags').get(function() {
  if (this.unitType === 'bag') {
    return this.stockInPaints / 8;
  }
  return null;
});

// Virtual for low stock check
productSchema.virtual('isLowStock').get(function() {
  if (this.unitType === 'bag') {
    return this.stockInPaints < (this.lowStockThreshold * 8);
  }
  return this.stockInQuantity < this.lowStockThreshold;
});

// Ensure virtuals are included
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

// Index for search
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ department: 1, isActive: 1 });

module.exports = mongoose.model('Product', productSchema);
