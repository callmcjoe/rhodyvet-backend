const mongoose = require('mongoose');

const discountRequestSchema = new mongoose.Schema({
  // Pending sale data (stored until approved)
  pendingSaleData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // Discount details
  discountAmount: {
    type: Number,
    required: true,
    min: 0
  },
  discountReason: {
    type: String,
    required: true,
    trim: true
  },
  totalBags: {
    type: Number,
    required: true,
    min: 0
  },
  subtotalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  finalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  // Request info
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  // Approval/Rejection info
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  // Reference to created sale (after approval)
  sale: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale'
  }
}, {
  timestamps: true
});

// Indexes
discountRequestSchema.index({ status: 1, createdAt: -1 });
discountRequestSchema.index({ requestedBy: 1, createdAt: -1 });

module.exports = mongoose.model('DiscountRequest', discountRequestSchema);
