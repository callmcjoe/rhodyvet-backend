const mongoose = require('mongoose');

const refundItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  unitType: {
    type: String,
    enum: ['bag', 'quantity'],
    required: true
  },
  // For feeds (bag-based) - quantities refunded
  quantityBags: {
    type: Number,
    default: 0,
    min: 0
  },
  quantityHalfBags: {
    type: Number,
    default: 0,
    min: 0
  },
  quantityThirdBags: {
    type: Number,
    default: 0,
    min: 0
  },
  quantityPaints: {
    type: Number,
    default: 0,
    min: 0
  },
  quantityHalfPaints: {
    type: Number,
    default: 0,
    min: 0
  },
  // For store items
  quantity: {
    type: Number,
    default: 0,
    min: 0
  },
  // Total paints equivalent (for stock restoration)
  totalPaintsEquivalent: {
    type: Number,
    default: 0
  },
  refundAmount: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const refundSchema = new mongoose.Schema({
  refundNumber: {
    type: String,
    unique: true,
    required: true
  },
  sale: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
    required: true
  },
  saleNumber: {
    type: String,
    required: true
  },
  items: [refundItemSchema],
  totalRefundAmount: {
    type: Number,
    required: true,
    min: 0
  },
  reason: {
    type: String,
    required: [true, 'Refund reason is required'],
    trim: true
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  processedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Generate refund number before saving
refundSchema.pre('save', async function(next) {
  if (this.isNew) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    const count = await this.constructor.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const sequence = (count + 1).toString().padStart(4, '0');
    this.refundNumber = `REF-${year}${month}${day}-${sequence}`;
  }
  next();
});

// Indexes
refundSchema.index({ refundNumber: 1 });
refundSchema.index({ sale: 1 });
refundSchema.index({ status: 1, createdAt: -1 });
refundSchema.index({ requestedBy: 1 });

module.exports = mongoose.model('Refund', refundSchema);
