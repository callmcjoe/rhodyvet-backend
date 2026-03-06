const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const StockLog = require('../models/StockLog');
const { formatStockDisplay, PAINTS_PER_BAG } = require('../utils/feedConversions');

// @desc    Get stock overview
// @route   GET /api/stock
// @access  Private (Admin/Super Admin)
const getStockOverview = async (req, res) => {
  try {
    const { department } = req.query;

    const query = { isActive: true };
    if (department) {
      query.department = department;
    }

    const products = await Product.find(query)
      .select('name department unitType stockInPaints stockInQuantity lowStockThreshold baseUnit stockUnit stockUnitEquivalent')
      .sort({ name: 1 });

    const stockData = products.map(p => ({
      _id: p._id,
      name: p.name,
      department: p.department,
      unitType: p.unitType,
      currentStock: p.unitType === 'bag' ? p.stockInPaints : p.stockInQuantity,
      stockDisplay: formatStockDisplay(p),
      stockInBags: p.unitType === 'bag' ? (p.stockInPaints / PAINTS_PER_BAG).toFixed(2) : null,
      isLowStock: p.isLowStock,
      lowStockThreshold: p.lowStockThreshold,
      // Include stock unit fields for store products
      baseUnit: p.baseUnit,
      stockUnit: p.stockUnit,
      stockUnitEquivalent: p.stockUnitEquivalent
    }));

    // Summary statistics
    const summary = {
      totalProducts: products.length,
      lowStockCount: stockData.filter(s => s.isLowStock).length,
      feedsProducts: products.filter(p => p.department === 'feeds').length,
      storeProducts: products.filter(p => p.department === 'store').length
    };

    res.json({
      success: true,
      summary,
      data: stockData
    });
  } catch (error) {
    console.error('Get stock overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Add stock to product
// @route   POST /api/stock/:productId/add
// @access  Private (Admin/Super Admin)
const addStock = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { quantity, quantityInBags, notes } = req.body;
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    let quantityToAdd;
    let stockLog;

    if (product.unitType === 'bag') {
      // If quantityInBags is provided, convert to paints
      quantityToAdd = quantityInBags ? quantityInBags * PAINTS_PER_BAG : quantity;

      const previousStock = product.stockInPaints;
      product.stockInPaints += quantityToAdd;

      stockLog = await StockLog.create({
        product: product._id,
        productName: product.name,
        department: product.department,
        actionType: 'stock_in',
        previousStockInPaints: previousStock,
        quantityChangedInPaints: quantityToAdd,
        newStockInPaints: product.stockInPaints,
        notes: notes || `Added ${quantityInBags || (quantityToAdd / PAINTS_PER_BAG).toFixed(2)} bag(s)`,
        performedBy: req.user.id
      });
    } else {
      quantityToAdd = quantity;
      const previousStock = product.stockInQuantity;
      product.stockInQuantity += quantityToAdd;

      stockLog = await StockLog.create({
        product: product._id,
        productName: product.name,
        department: product.department,
        actionType: 'stock_in',
        previousStockInQuantity: previousStock,
        quantityChangedInQuantity: quantityToAdd,
        newStockInQuantity: product.stockInQuantity,
        notes: notes || `Added ${quantityToAdd} units`,
        performedBy: req.user.id
      });
    }

    await product.save();

    res.json({
      success: true,
      message: 'Stock added successfully',
      data: {
        product: {
          _id: product._id,
          name: product.name,
          stockDisplay: formatStockDisplay(product)
        },
        stockLog
      }
    });
  } catch (error) {
    console.error('Add stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Remove stock from product
// @route   POST /api/stock/:productId/remove
// @access  Private (Admin/Super Admin)
const removeStock = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { quantity, quantityInBags, notes } = req.body;
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    let quantityToRemove;

    if (product.unitType === 'bag') {
      quantityToRemove = quantityInBags ? quantityInBags * PAINTS_PER_BAG : quantity;

      if (quantityToRemove > product.stockInPaints) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock'
        });
      }

      const previousStock = product.stockInPaints;
      product.stockInPaints -= quantityToRemove;

      await StockLog.create({
        product: product._id,
        productName: product.name,
        department: product.department,
        actionType: 'stock_out',
        previousStockInPaints: previousStock,
        quantityChangedInPaints: -quantityToRemove,
        newStockInPaints: product.stockInPaints,
        notes: notes || `Removed ${quantityInBags || (quantityToRemove / PAINTS_PER_BAG).toFixed(2)} bag(s)`,
        performedBy: req.user.id
      });
    } else {
      quantityToRemove = quantity;

      if (quantityToRemove > product.stockInQuantity) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock'
        });
      }

      const previousStock = product.stockInQuantity;
      product.stockInQuantity -= quantityToRemove;

      await StockLog.create({
        product: product._id,
        productName: product.name,
        department: product.department,
        actionType: 'stock_out',
        previousStockInQuantity: previousStock,
        quantityChangedInQuantity: -quantityToRemove,
        newStockInQuantity: product.stockInQuantity,
        notes: notes || `Removed ${quantityToRemove} units`,
        performedBy: req.user.id
      });
    }

    await product.save();

    res.json({
      success: true,
      message: 'Stock removed successfully',
      data: {
        _id: product._id,
        name: product.name,
        stockDisplay: formatStockDisplay(product)
      }
    });
  } catch (error) {
    console.error('Remove stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Adjust stock (for stock taking / corrections)
// @route   POST /api/stock/:productId/adjust
// @access  Private (Admin/Super Admin)
const adjustStock = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { newStock, newStockInBags, notes } = req.body;
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (!notes) {
      return res.status(400).json({
        success: false,
        message: 'Notes are required for stock adjustment'
      });
    }

    if (product.unitType === 'bag') {
      const actualNewStock = newStockInBags ? newStockInBags * PAINTS_PER_BAG : newStock;
      const previousStock = product.stockInPaints;
      const difference = actualNewStock - previousStock;

      product.stockInPaints = actualNewStock;

      await StockLog.create({
        product: product._id,
        productName: product.name,
        department: product.department,
        actionType: 'adjustment',
        previousStockInPaints: previousStock,
        quantityChangedInPaints: difference,
        newStockInPaints: actualNewStock,
        notes,
        performedBy: req.user.id
      });
    } else {
      const previousStock = product.stockInQuantity;
      const difference = newStock - previousStock;

      product.stockInQuantity = newStock;

      await StockLog.create({
        product: product._id,
        productName: product.name,
        department: product.department,
        actionType: 'adjustment',
        previousStockInQuantity: previousStock,
        quantityChangedInQuantity: difference,
        newStockInQuantity: newStock,
        notes,
        performedBy: req.user.id
      });
    }

    await product.save();

    res.json({
      success: true,
      message: 'Stock adjusted successfully',
      data: {
        _id: product._id,
        name: product.name,
        stockDisplay: formatStockDisplay(product)
      }
    });
  } catch (error) {
    console.error('Adjust stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get stock logs for a product
// @route   GET /api/stock/:productId/logs
// @access  Private (Admin/Super Admin)
const getProductStockLogs = async (req, res) => {
  try {
    const { startDate, endDate, actionType, page = 1, limit = 20 } = req.query;

    const query = { product: req.params.productId };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    if (actionType) {
      query.actionType = actionType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      StockLog.find(query)
        .populate('performedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      StockLog.countDocuments(query)
    ]);

    res.json({
      success: true,
      count: logs.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: logs
    });
  } catch (error) {
    console.error('Get product stock logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get all stock logs
// @route   GET /api/stock/logs
// @access  Private (Admin/Super Admin)
const getAllStockLogs = async (req, res) => {
  try {
    const { department, actionType, startDate, endDate, page = 1, limit = 50 } = req.query;

    const query = {};

    if (department) {
      query.department = department;
    }

    if (actionType) {
      query.actionType = actionType;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      StockLog.find(query)
        .populate('performedBy', 'firstName lastName')
        .populate('product', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      StockLog.countDocuments(query)
    ]);

    res.json({
      success: true,
      count: logs.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: logs
    });
  } catch (error) {
    console.error('Get all stock logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getStockOverview,
  addStock,
  removeStock,
  adjustStock,
  getProductStockLogs,
  getAllStockLogs
};
