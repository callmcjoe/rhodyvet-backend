const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Refund = require('../models/Refund');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const StockLog = require('../models/StockLog');
const { convertToPaints } = require('../utils/feedConversions');

// @desc    Get all refunds
// @route   GET /api/refunds
// @access  Private (Admin/Super Admin for all, Sales Rep for own)
const getAllRefunds = async (req, res) => {
  try {
    const { status, requestedBy, startDate, endDate, page = 1, limit = 20 } = req.query;

    const query = {};

    // Sales reps can only see their own refund requests
    if (req.user.role === 'sales_rep') {
      query.requestedBy = req.user.id;
    } else if (requestedBy) {
      query.requestedBy = requestedBy;
    }

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [refunds, total] = await Promise.all([
      Refund.find(query)
        .populate('requestedBy', 'firstName lastName')
        .populate('approvedBy', 'firstName lastName')
        .populate('rejectedBy', 'firstName lastName')
        .populate('sale', 'saleNumber totalAmount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Refund.countDocuments(query)
    ]);

    res.json({
      success: true,
      count: refunds.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: refunds
    });
  } catch (error) {
    console.error('Get all refunds error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get pending refunds (for admin approval queue)
// @route   GET /api/refunds/pending
// @access  Private (Admin/Super Admin)
const getPendingRefunds = async (req, res) => {
  try {
    const refunds = await Refund.find({ status: 'pending' })
      .populate('requestedBy', 'firstName lastName department')
      .populate('sale', 'saleNumber totalAmount soldBy createdAt')
      .sort({ createdAt: 1 }); // Oldest first

    res.json({
      success: true,
      count: refunds.length,
      data: refunds
    });
  } catch (error) {
    console.error('Get pending refunds error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single refund
// @route   GET /api/refunds/:id
// @access  Private
const getRefund = async (req, res) => {
  try {
    const refund = await Refund.findById(req.params.id)
      .populate('requestedBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName')
      .populate('rejectedBy', 'firstName lastName')
      .populate('sale')
      .populate('items.product', 'name department unitType');

    if (!refund) {
      return res.status(404).json({
        success: false,
        message: 'Refund not found'
      });
    }

    // Sales reps can only view their own refund requests
    if (req.user.role === 'sales_rep' && refund.requestedBy._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this refund'
      });
    }

    res.json({
      success: true,
      data: refund
    });
  } catch (error) {
    console.error('Get refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create refund request
// @route   POST /api/refunds
// @access  Private
const createRefund = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { saleId, items, reason } = req.body;

    // Find the original sale
    const sale = await Sale.findById(saleId).populate('items.product');

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    // Check if sale can be refunded
    if (sale.status === 'fully_refunded') {
      return res.status(400).json({
        success: false,
        message: 'This sale has already been fully refunded'
      });
    }

    // Process refund items
    const processedItems = [];
    let totalRefundAmount = 0;

    for (const refundItem of items) {
      // Find the item in the original sale
      const saleItem = sale.items.find(si => si.product._id.toString() === refundItem.productId);

      if (!saleItem) {
        return res.status(400).json({
          success: false,
          message: `Product ${refundItem.productId} was not in the original sale`
        });
      }

      let refundAmount = 0;
      let totalPaintsEquivalent = 0;

      if (saleItem.unitType === 'bag') {
        const quantities = {
          quantityBags: refundItem.quantityBags || 0,
          quantityHalfBags: refundItem.quantityHalfBags || 0,
          quantityThirdBags: refundItem.quantityThirdBags || 0,
          quantityPaints: refundItem.quantityPaints || 0,
          quantityHalfPaints: refundItem.quantityHalfPaints || 0
        };

        totalPaintsEquivalent = convertToPaints(quantities);

        // Validate quantities don't exceed original sale
        if (totalPaintsEquivalent > saleItem.totalPaintsEquivalent) {
          return res.status(400).json({
            success: false,
            message: `Refund quantity exceeds original sale for ${saleItem.productName}`
          });
        }

        // Calculate refund amount proportionally
        refundAmount = (totalPaintsEquivalent / saleItem.totalPaintsEquivalent) * saleItem.totalPrice;

        processedItems.push({
          product: saleItem.product._id,
          productName: saleItem.productName,
          unitType: 'bag',
          quantityBags: quantities.quantityBags,
          quantityHalfBags: quantities.quantityHalfBags,
          quantityThirdBags: quantities.quantityThirdBags,
          quantityPaints: quantities.quantityPaints,
          quantityHalfPaints: quantities.quantityHalfPaints,
          totalPaintsEquivalent,
          refundAmount
        });
      } else {
        const quantity = refundItem.quantity || 0;

        if (quantity > saleItem.quantity) {
          return res.status(400).json({
            success: false,
            message: `Refund quantity exceeds original sale for ${saleItem.productName}`
          });
        }

        refundAmount = quantity * saleItem.unitPrice;

        processedItems.push({
          product: saleItem.product._id,
          productName: saleItem.productName,
          unitType: 'quantity',
          quantity,
          refundAmount
        });
      }

      totalRefundAmount += refundAmount;
    }

    // Generate refund number
    const refundNumber = await Refund.generateRefundNumber();

    // Check if user is admin (auto-approve) or sales rep (needs approval)
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    if (isAdmin) {
      // Admin: Auto-approve refund and restore stock immediately
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Create approved refund
        const refund = await Refund.create([{
          refundNumber,
          sale: sale._id,
          saleNumber: sale.saleNumber,
          items: processedItems,
          totalRefundAmount,
          reason,
          requestedBy: req.user.id,
          status: 'approved',
          approvedBy: req.user.id,
          processedAt: new Date()
        }], { session });

        // Restore stock for each item
        for (const item of processedItems) {
          const product = await Product.findById(item.product).session(session);

          if (product) {
            if (item.unitType === 'bag') {
              const previousStock = product.stockInPaints;
              product.stockInPaints += item.totalPaintsEquivalent;
              await product.save({ session });

              await StockLog.create([{
                product: product._id,
                productName: product.name,
                department: product.department,
                actionType: 'refund',
                previousStockInPaints: previousStock,
                quantityChangedInPaints: item.totalPaintsEquivalent,
                newStockInPaints: product.stockInPaints,
                refundReference: refund[0]._id,
                performedBy: req.user.id
              }], { session });
            } else {
              const previousStock = product.stockInQuantity;
              product.stockInQuantity += item.quantity;
              await product.save({ session });

              await StockLog.create([{
                product: product._id,
                productName: product.name,
                department: product.department,
                actionType: 'refund',
                previousStockInQuantity: previousStock,
                quantityChangedInQuantity: item.quantity,
                newStockInQuantity: product.stockInQuantity,
                refundReference: refund[0]._id,
                performedBy: req.user.id
              }], { session });
            }
          }
        }

        // Update sale status
        if (totalRefundAmount >= sale.totalAmount * 0.99) {
          sale.status = 'fully_refunded';
        } else {
          sale.status = 'partially_refunded';
        }
        await sale.save({ session });

        await session.commitTransaction();

        const populatedRefund = await Refund.findById(refund[0]._id)
          .populate('requestedBy', 'firstName lastName')
          .populate('approvedBy', 'firstName lastName')
          .populate('sale', 'saleNumber');

        res.status(201).json({
          success: true,
          message: 'Refund processed and stock restored',
          data: populatedRefund
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } else {
      // Sales rep: Create pending refund request
      const refund = await Refund.create({
        refundNumber,
        sale: sale._id,
        saleNumber: sale.saleNumber,
        items: processedItems,
        totalRefundAmount,
        reason,
        requestedBy: req.user.id,
        status: 'pending'
      });

      // Update sale status to pending refund
      sale.status = 'refund_pending';
      await sale.save();

      const populatedRefund = await Refund.findById(refund._id)
        .populate('requestedBy', 'firstName lastName')
        .populate('sale', 'saleNumber');

      res.status(201).json({
        success: true,
        message: 'Refund request submitted for approval',
        data: populatedRefund
      });
    }
  } catch (error) {
    console.error('Create refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Approve refund
// @route   PUT /api/refunds/:id/approve
// @access  Private (Admin/Super Admin)
const approveRefund = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const refund = await Refund.findById(req.params.id).session(session);

    if (!refund) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Refund not found'
      });
    }

    if (refund.status !== 'pending') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Refund has already been processed'
      });
    }

    // Restore stock for each item
    for (const item of refund.items) {
      const product = await Product.findById(item.product).session(session);

      if (product) {
        if (item.unitType === 'bag') {
          const previousStock = product.stockInPaints;
          product.stockInPaints += item.totalPaintsEquivalent;
          await product.save({ session });

          await StockLog.create([{
            product: product._id,
            productName: product.name,
            department: product.department,
            actionType: 'refund',
            previousStockInPaints: previousStock,
            quantityChangedInPaints: item.totalPaintsEquivalent,
            newStockInPaints: product.stockInPaints,
            refundReference: refund._id,
            performedBy: req.user.id
          }], { session });
        } else {
          const previousStock = product.stockInQuantity;
          product.stockInQuantity += item.quantity;
          await product.save({ session });

          await StockLog.create([{
            product: product._id,
            productName: product.name,
            department: product.department,
            actionType: 'refund',
            previousStockInQuantity: previousStock,
            quantityChangedInQuantity: item.quantity,
            newStockInQuantity: product.stockInQuantity,
            refundReference: refund._id,
            performedBy: req.user.id
          }], { session });
        }
      }
    }

    // Update refund status
    refund.status = 'approved';
    refund.approvedBy = req.user.id;
    refund.processedAt = new Date();
    await refund.save({ session });

    // Update sale status
    const sale = await Sale.findById(refund.sale).session(session);
    if (sale) {
      // Check if full or partial refund
      if (refund.totalRefundAmount >= sale.totalAmount * 0.99) { // Allow for rounding
        sale.status = 'fully_refunded';
      } else {
        sale.status = 'partially_refunded';
      }
      await sale.save({ session });
    }

    await session.commitTransaction();

    const populatedRefund = await Refund.findById(refund._id)
      .populate('requestedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName');

    res.json({
      success: true,
      message: 'Refund approved and stock restored',
      data: populatedRefund
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Approve refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  } finally {
    session.endSession();
  }
};

// @desc    Reject refund
// @route   PUT /api/refunds/:id/reject
// @access  Private (Admin/Super Admin)
const rejectRefund = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const refund = await Refund.findById(req.params.id);

    if (!refund) {
      return res.status(404).json({
        success: false,
        message: 'Refund not found'
      });
    }

    if (refund.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Refund has already been processed'
      });
    }

    refund.status = 'rejected';
    refund.rejectedBy = req.user.id;
    refund.rejectionReason = rejectionReason || 'No reason provided';
    refund.processedAt = new Date();
    await refund.save();

    // Revert sale status
    const sale = await Sale.findById(refund.sale);
    if (sale && sale.status === 'refund_pending') {
      sale.status = 'completed';
      await sale.save();
    }

    const populatedRefund = await Refund.findById(refund._id)
      .populate('requestedBy', 'firstName lastName')
      .populate('rejectedBy', 'firstName lastName');

    res.json({
      success: true,
      message: 'Refund request rejected',
      data: populatedRefund
    });
  } catch (error) {
    console.error('Reject refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getAllRefunds,
  getPendingRefunds,
  getRefund,
  createRefund,
  approveRefund,
  rejectRefund
};
