const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const StockLog = require('../models/StockLog');
const DiscountRequest = require('../models/DiscountRequest');
const { convertToPaints, calculateFeedItemPrice } = require('../utils/feedConversions');

// Discount constants
const DISCOUNT_PER_BAG = 200; // ₦200 discount per bag
const MIN_BAGS_FOR_AUTO_DISCOUNT = 10; // Minimum bags for automatic discount

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
const getAllSales = async (req, res) => {
  try {
    const { startDate, endDate, soldBy, department, status, salesChannel, page = 1, limit = 20 } = req.query;

    const query = {};

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    // Filter by staff (sales_rep can only see their own sales)
    if (req.user.role === 'sales_rep') {
      query.soldBy = req.user.id;
    } else if (soldBy) {
      query.soldBy = soldBy;
    }

    // Filter by department (items in sale)
    if (department) {
      query['items.department'] = department;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by sales channel (jumia, walk-in)
    if (salesChannel) {
      query.salesChannel = salesChannel;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [sales, total] = await Promise.all([
      Sale.find(query)
        .populate('soldBy', 'firstName lastName department')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Sale.countDocuments(query)
    ]);

    res.json({
      success: true,
      count: sales.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: sales
    });
  } catch (error) {
    console.error('Get all sales error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single sale
// @route   GET /api/sales/:id
// @access  Private
const getSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('soldBy', 'firstName lastName email department')
      .populate('items.product', 'name department unitType');

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    // Sales reps can only view their own sales
    if (req.user.role === 'sales_rep' && sale.soldBy._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this sale'
      });
    }

    res.json({
      success: true,
      data: sale
    });
  } catch (error) {
    console.error('Get sale error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get sale by sale number
// @route   GET /api/sales/number/:saleNumber
// @access  Private
const getSaleByNumber = async (req, res) => {
  try {
    const sale = await Sale.findOne({ saleNumber: req.params.saleNumber })
      .populate('soldBy', 'firstName lastName email department')
      .populate('items.product', 'name department unitType');

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    res.json({
      success: true,
      data: sale
    });
  } catch (error) {
    console.error('Get sale by number error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create new sale
// @route   POST /api/sales
// @access  Private
const createSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { items, paymentMethod, notes, manualDiscount, discountReason, salesChannel } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sale must have at least one item'
      });
    }

    const processedItems = [];
    let subtotalAmount = 0;
    let totalBags = 0;

    // Process each item
    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);

      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`
        });
      }

      if (!product.isActive) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Product is not available: ${product.name}`
        });
      }

      let itemTotal = 0;
      let totalPaintsEquivalent = 0;

      if (product.unitType === 'bag') {
        // Calculate for feed products
        const quantities = {
          quantityBags: item.quantityBags || 0,
          quantityHalfBags: item.quantityHalfBags || 0,
          quantityThirdBags: item.quantityThirdBags || 0,
          quantityPaints: item.quantityPaints || 0,
          quantityHalfPaints: item.quantityHalfPaints || 0
        };

        // Count total bags for discount calculation
        totalBags += quantities.quantityBags;

        totalPaintsEquivalent = convertToPaints(quantities);
        itemTotal = calculateFeedItemPrice(quantities, product);

        // Check stock availability
        if (totalPaintsEquivalent > product.stockInPaints) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}. Available: ${product.stockInPaints} paints equivalent`
          });
        }

        // Deduct stock
        const previousStock = product.stockInPaints;
        product.stockInPaints -= totalPaintsEquivalent;
        await product.save({ session });

        // Log stock change
        await StockLog.create([{
          product: product._id,
          productName: product.name,
          department: product.department,
          actionType: 'sale',
          previousStockInPaints: previousStock,
          quantityChangedInPaints: -totalPaintsEquivalent,
          newStockInPaints: product.stockInPaints,
          performedBy: req.user.id
        }], { session });

        processedItems.push({
          product: product._id,
          productName: product.name,
          department: product.department,
          unitType: product.unitType,
          quantityBags: quantities.quantityBags,
          quantityHalfBags: quantities.quantityHalfBags,
          quantityThirdBags: quantities.quantityThirdBags,
          quantityPaints: quantities.quantityPaints,
          quantityHalfPaints: quantities.quantityHalfPaints,
          totalPaintsEquivalent,
          unitPrice: product.pricePerBag,
          totalPrice: itemTotal
        });
      } else {
        // Calculate for store products (quantity-based with sale units)
        const quantity = item.quantity || 0;

        if (quantity <= 0) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Invalid quantity for ${product.name}`
          });
        }

        // Get sale unit info (if provided)
        const saleUnitName = item.saleUnitName;
        const saleUnitPrice = item.saleUnitPrice;
        const saleUnitEquivalent = item.saleUnitEquivalent || 1;

        // Calculate stock to deduct (quantity * equivalent in base units)
        const stockToDeduct = quantity * saleUnitEquivalent;

        // Check stock availability
        if (stockToDeduct > product.stockInQuantity) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}. Available: ${product.stockInQuantity} ${product.baseUnit || 'units'}`
          });
        }

        // Calculate item total using sale unit price or fallback to pricePerUnit
        const unitPrice = saleUnitPrice || product.pricePerUnit || 0;
        itemTotal = quantity * unitPrice;

        // Deduct stock
        const previousStock = product.stockInQuantity;
        product.stockInQuantity -= stockToDeduct;
        await product.save({ session });

        // Log stock change
        await StockLog.create([{
          product: product._id,
          productName: product.name,
          department: product.department,
          actionType: 'sale',
          previousStockInQuantity: previousStock,
          quantityChangedInQuantity: -stockToDeduct,
          newStockInQuantity: product.stockInQuantity,
          performedBy: req.user.id
        }], { session });

        processedItems.push({
          product: product._id,
          productName: product.name,
          department: product.department,
          unitType: product.unitType,
          quantity,
          saleUnitName: saleUnitName || 'unit',
          saleUnitEquivalent,
          stockDeducted: stockToDeduct,
          unitPrice,
          totalPrice: itemTotal
        });
      }

      subtotalAmount += itemTotal;
    }

    // Calculate discount
    let discountAmount = 0;
    let discountType = 'none';
    let finalDiscountReason = null;

    // Automatic discount: ₦200 per bag when 10 or more bags
    if (totalBags >= MIN_BAGS_FOR_AUTO_DISCOUNT) {
      discountAmount = totalBags * DISCOUNT_PER_BAG;
      discountType = 'automatic';
      finalDiscountReason = `Automatic discount: ₦${DISCOUNT_PER_BAG} x ${totalBags} bags`;
    }

    // Manual discount from admin (overrides automatic)
    if (manualDiscount && manualDiscount > 0) {
      const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

      if (!isAdmin) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: 'Only admins can apply manual discounts directly'
        });
      }

      discountAmount = manualDiscount;
      discountType = 'manual';
      finalDiscountReason = discountReason || 'Manual discount by admin';
    }

    // Ensure discount doesn't exceed subtotal
    if (discountAmount > subtotalAmount) {
      discountAmount = subtotalAmount;
    }

    const totalAmount = subtotalAmount - discountAmount;

    // Generate sale number
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

    const count = await Sale.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).session(session);

    const sequence = (count + 1).toString().padStart(4, '0');
    const saleNumber = `SAL-${year}${month}${day}-${sequence}`;

    // Create the sale
    const sale = new Sale({
      saleNumber,
      items: processedItems,
      totalBags,
      subtotalAmount,
      discountAmount,
      discountType,
      discountReason: finalDiscountReason,
      totalAmount,
      paymentMethod: paymentMethod || 'cash',
      soldBy: req.user.id,
      soldByDepartment: req.user.department,
      notes,
      salesChannel: salesChannel || 'walk-in'
    });

    await sale.save({ session });

    await session.commitTransaction();

    // Populate and return the created sale
    const populatedSale = await Sale.findById(sale._id)
      .populate('soldBy', 'firstName lastName department');

    res.status(201).json({
      success: true,
      data: populatedSale
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Create sale error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  } finally {
    session.endSession();
  }
};

// @desc    Request discount (for sales reps - needs admin approval)
// @route   POST /api/sales/request-discount
// @access  Private
const requestDiscount = async (req, res) => {
  try {
    const { items, paymentMethod, notes, discountAmount, discountReason } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sale must have at least one item'
      });
    }

    if (!discountAmount || discountAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Discount amount is required'
      });
    }

    if (!discountReason) {
      return res.status(400).json({
        success: false,
        message: 'Discount reason is required'
      });
    }

    // Calculate totals without deducting stock
    let subtotalAmount = 0;
    let totalBags = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);

      if (!product || !product.isActive) {
        return res.status(400).json({
          success: false,
          message: `Product not available: ${item.productId}`
        });
      }

      if (product.unitType === 'bag') {
        const quantities = {
          quantityBags: item.quantityBags || 0,
          quantityHalfBags: item.quantityHalfBags || 0,
          quantityThirdBags: item.quantityThirdBags || 0,
          quantityPaints: item.quantityPaints || 0,
          quantityHalfPaints: item.quantityHalfPaints || 0
        };

        totalBags += quantities.quantityBags;
        subtotalAmount += calculateFeedItemPrice(quantities, product);
      } else {
        // Handle store products with sale units
        const quantity = item.quantity || 0;
        const unitPrice = item.saleUnitPrice || product.pricePerUnit || 0;
        subtotalAmount += quantity * unitPrice;
      }
    }

    // Check if automatic discount would apply
    if (totalBags >= MIN_BAGS_FOR_AUTO_DISCOUNT) {
      return res.status(400).json({
        success: false,
        message: `This sale qualifies for automatic discount (${totalBags} bags). No approval needed.`
      });
    }

    const finalAmount = subtotalAmount - discountAmount;

    // Create discount request
    const discountRequest = await DiscountRequest.create({
      pendingSaleData: { items, paymentMethod, notes },
      discountAmount,
      discountReason,
      totalBags,
      subtotalAmount,
      finalAmount,
      requestedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Discount request submitted for admin approval',
      data: discountRequest
    });
  } catch (error) {
    console.error('Request discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get pending discount requests
// @route   GET /api/sales/discount-requests
// @access  Private (Admin/Super Admin)
const getDiscountRequests = async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const requests = await DiscountRequest.find({ status })
      .populate('requestedBy', 'firstName lastName department')
      .populate('processedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    console.error('Get discount requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Approve discount request
// @route   PUT /api/sales/discount-requests/:id/approve
// @access  Private (Admin/Super Admin)
const approveDiscountRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const discountRequest = await DiscountRequest.findById(req.params.id);

    if (!discountRequest) {
      return res.status(404).json({
        success: false,
        message: 'Discount request not found'
      });
    }

    if (discountRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'This request has already been processed'
      });
    }

    const { items, paymentMethod, notes } = discountRequest.pendingSaleData;
    const processedItems = [];

    // Process items and deduct stock
    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);

      if (!product || !product.isActive) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Product no longer available: ${item.productId}`
        });
      }

      if (product.unitType === 'bag') {
        const quantities = {
          quantityBags: item.quantityBags || 0,
          quantityHalfBags: item.quantityHalfBags || 0,
          quantityThirdBags: item.quantityThirdBags || 0,
          quantityPaints: item.quantityPaints || 0,
          quantityHalfPaints: item.quantityHalfPaints || 0
        };

        const totalPaintsEquivalent = convertToPaints(quantities);
        const itemTotal = calculateFeedItemPrice(quantities, product);

        if (totalPaintsEquivalent > product.stockInPaints) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}`
          });
        }

        const previousStock = product.stockInPaints;
        product.stockInPaints -= totalPaintsEquivalent;
        await product.save({ session });

        await StockLog.create([{
          product: product._id,
          productName: product.name,
          department: product.department,
          actionType: 'sale',
          previousStockInPaints: previousStock,
          quantityChangedInPaints: -totalPaintsEquivalent,
          newStockInPaints: product.stockInPaints,
          performedBy: discountRequest.requestedBy
        }], { session });

        processedItems.push({
          product: product._id,
          productName: product.name,
          department: product.department,
          unitType: product.unitType,
          ...quantities,
          totalPaintsEquivalent,
          unitPrice: product.pricePerBag,
          totalPrice: itemTotal
        });
      } else {
        const quantity = item.quantity || 0;
        const saleUnitName = item.saleUnitName;
        const saleUnitPrice = item.saleUnitPrice;
        const saleUnitEquivalent = item.saleUnitEquivalent || 1;

        const stockToDeduct = quantity * saleUnitEquivalent;

        if (stockToDeduct > product.stockInQuantity) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}`
          });
        }

        const unitPrice = saleUnitPrice || product.pricePerUnit || 0;
        const itemTotal = quantity * unitPrice;
        const previousStock = product.stockInQuantity;
        product.stockInQuantity -= stockToDeduct;
        await product.save({ session });

        await StockLog.create([{
          product: product._id,
          productName: product.name,
          department: product.department,
          actionType: 'sale',
          previousStockInQuantity: previousStock,
          quantityChangedInQuantity: -stockToDeduct,
          newStockInQuantity: product.stockInQuantity,
          performedBy: discountRequest.requestedBy
        }], { session });

        processedItems.push({
          product: product._id,
          productName: product.name,
          department: product.department,
          unitType: product.unitType,
          quantity,
          saleUnitName: saleUnitName || 'unit',
          saleUnitEquivalent,
          stockDeducted: stockToDeduct,
          unitPrice,
          totalPrice: itemTotal
        });
      }
    }

    // Generate sale number
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

    const count = await Sale.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).session(session);

    const sequence = (count + 1).toString().padStart(4, '0');
    const saleNumber = `SAL-${year}${month}${day}-${sequence}`;

    // Get the user who requested the discount
    const requestedByUser = await mongoose.model('User').findById(discountRequest.requestedBy);

    // Create sale with approved discount
    const sale = new Sale({
      saleNumber,
      items: processedItems,
      totalBags: discountRequest.totalBags,
      subtotalAmount: discountRequest.subtotalAmount,
      discountAmount: discountRequest.discountAmount,
      discountType: 'approved',
      discountReason: discountRequest.discountReason,
      discountApprovedBy: req.user.id,
      totalAmount: discountRequest.finalAmount,
      paymentMethod: paymentMethod || 'cash',
      soldBy: discountRequest.requestedBy,
      soldByDepartment: requestedByUser?.department || 'feeds',
      notes
    });

    await sale.save({ session });

    // Update discount request
    discountRequest.status = 'approved';
    discountRequest.processedBy = req.user.id;
    discountRequest.processedAt = new Date();
    discountRequest.sale = sale._id;
    await discountRequest.save({ session });

    await session.commitTransaction();

    const populatedSale = await Sale.findById(sale._id)
      .populate('soldBy', 'firstName lastName department')
      .populate('discountApprovedBy', 'firstName lastName');

    res.json({
      success: true,
      message: 'Discount approved and sale created',
      data: populatedSale
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Approve discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  } finally {
    session.endSession();
  }
};

// @desc    Reject discount request
// @route   PUT /api/sales/discount-requests/:id/reject
// @access  Private (Admin/Super Admin)
const rejectDiscountRequest = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const discountRequest = await DiscountRequest.findById(req.params.id);

    if (!discountRequest) {
      return res.status(404).json({
        success: false,
        message: 'Discount request not found'
      });
    }

    if (discountRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'This request has already been processed'
      });
    }

    discountRequest.status = 'rejected';
    discountRequest.processedBy = req.user.id;
    discountRequest.processedAt = new Date();
    discountRequest.rejectionReason = rejectionReason || 'Request rejected by admin';
    await discountRequest.save();

    res.json({
      success: true,
      message: 'Discount request rejected',
      data: discountRequest
    });
  } catch (error) {
    console.error('Reject discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get my discount requests (for sales rep)
// @route   GET /api/sales/my-discount-requests
// @access  Private
const getMyDiscountRequests = async (req, res) => {
  try {
    const requests = await DiscountRequest.find({ requestedBy: req.user.id })
      .populate('processedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    console.error('Get my discount requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get sales summary for a staff member
// @route   GET /api/sales/my-summary
// @access  Private
const getMySalesSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchQuery = { soldBy: new mongoose.Types.ObjectId(req.user.id) };

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const summary = await Sale.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          completedSales: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          refundedSales: {
            $sum: { $cond: [{ $in: ['$status', ['partially_refunded', 'fully_refunded']] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: summary[0] || {
        totalSales: 0,
        totalAmount: 0,
        completedSales: 0,
        refundedSales: 0
      }
    });
  } catch (error) {
    console.error('Get my sales summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getAllSales,
  getSale,
  getSaleByNumber,
  createSale,
  getMySalesSummary,
  requestDiscount,
  getDiscountRequests,
  approveDiscountRequest,
  rejectDiscountRequest,
  getMyDiscountRequests
};
