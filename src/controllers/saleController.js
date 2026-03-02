const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const StockLog = require('../models/StockLog');
const { convertToPaints, calculateFeedItemPrice } = require('../utils/feedConversions');

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
const getAllSales = async (req, res) => {
  try {
    const { startDate, endDate, soldBy, department, status, page = 1, limit = 20 } = req.query;

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

    const { items, paymentMethod, notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sale must have at least one item'
      });
    }

    const processedItems = [];
    let totalAmount = 0;

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
        // Calculate for store products (quantity-based)
        const quantity = item.quantity || 0;

        if (quantity <= 0) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Invalid quantity for ${product.name}`
          });
        }

        // Check stock availability
        if (quantity > product.stockInQuantity) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}. Available: ${product.stockInQuantity}`
          });
        }

        itemTotal = quantity * product.pricePerUnit;

        // Deduct stock
        const previousStock = product.stockInQuantity;
        product.stockInQuantity -= quantity;
        await product.save({ session });

        // Log stock change
        await StockLog.create([{
          product: product._id,
          productName: product.name,
          department: product.department,
          actionType: 'sale',
          previousStockInQuantity: previousStock,
          quantityChangedInQuantity: -quantity,
          newStockInQuantity: product.stockInQuantity,
          performedBy: req.user.id
        }], { session });

        processedItems.push({
          product: product._id,
          productName: product.name,
          department: product.department,
          unitType: product.unitType,
          quantity,
          unitPrice: product.pricePerUnit,
          totalPrice: itemTotal
        });
      }

      totalAmount += itemTotal;
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

    // Create the sale
    const sale = new Sale({
      saleNumber,
      items: processedItems,
      totalAmount,
      paymentMethod: paymentMethod || 'cash',
      soldBy: req.user.id,
      soldByDepartment: req.user.department,
      notes
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
  getMySalesSummary
};
