const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
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
  unitType: {
    type: String,
    enum: ['bag', 'quantity'],
    required: true
  },
  // For feeds (bag-based) - quantities sold
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
  quantityQuarterBags: {
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
  // For store items (quantity-based)
  quantity: {
    type: Number,
    default: 0,
    min: 0
  },
  // Sale unit info for store items
  saleUnitName: {
    type: String,
    trim: true
  },
  saleUnitEquivalent: {
    type: Number,
    default: 1,
    min: 0
  },
  stockDeducted: {
    type: Number,
    default: 0,
    min: 0
  },
  // Total paints equivalent (for stock calculation)
  totalPaintsEquivalent: {
    type: Number,
    default: 0
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const saleSchema = new mongoose.Schema({
  saleNumber: {
    type: String,
    unique: true,
    required: true
  },
  items: [saleItemSchema],
  // Total bags in this sale (for discount calculation)
  totalBags: {
    type: Number,
    default: 0,
    min: 0
  },
  // Subtotal before discount
  subtotalAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Discount information
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  discountType: {
    type: String,
    enum: ['none', 'automatic', 'manual', 'approved'],
    default: 'none'
  },
  discountReason: {
    type: String,
    trim: true
  },
  discountApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Final amount after discount
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'transfer', 'card'],
    default: 'cash'
  },
  soldBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  soldByDepartment: {
    type: String,
    enum: ['feeds', 'store'],
    required: true
  },
  status: {
    type: String,
    enum: ['completed', 'refund_pending', 'partially_refunded', 'fully_refunded'],
    default: 'completed'
  },
  notes: {
    type: String,
    trim: true
  },
  // Sales channel - where the sale was made from
  salesChannel: {
    type: String,
    enum: ['walk-in', 'jumia'],
    default: 'walk-in'
  }
}, {
  timestamps: true
});

// Generate sale number before saving (only if not already set)
saleSchema.pre('save', async function(next) {
  if (this.isNew && !this.saleNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    // Get count of sales today
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

    const count = await this.constructor.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const sequence = (count + 1).toString().padStart(4, '0');
    this.saleNumber = `SAL-${year}${month}${day}-${sequence}`;
  }
  next();
});

// Indexes
saleSchema.index({ saleNumber: 1 });
saleSchema.index({ soldBy: 1, createdAt: -1 });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ status: 1 });
saleSchema.index({ salesChannel: 1, createdAt: -1 });

module.exports = mongoose.model('Sale', saleSchema);
