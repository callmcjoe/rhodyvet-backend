const { validationResult } = require('express-validator');
const ChickenStock = require('../models/ChickenStock');
const ChickenTransaction = require('../models/ChickenTransaction');

// Initialize stock records if they don't exist
const initializeStock = async () => {
  const types = ['broiler', 'noiler', 'turkey'];
  for (const type of types) {
    await ChickenStock.findOneAndUpdate(
      { chickenType: type },
      { $setOnInsert: { chickenType: type, currentStock: 0, totalPurchased: 0, totalSold: 0 } },
      { upsert: true, new: true }
    );
  }
};

// @desc    Get stock overview
// @route   GET /api/chicken/stock
// @access  Private (Admin/Super Admin)
const getStockOverview = async (req, res) => {
  try {
    await initializeStock();

    const stocks = await ChickenStock.find().sort({ chickenType: 1 });

    const totalStock = stocks.reduce((sum, s) => sum + s.currentStock, 0);

    res.json({
      success: true,
      data: stocks,
      summary: {
        totalStock,
        types: stocks.length
      }
    });
  } catch (error) {
    console.error('Get stock overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get all transactions
// @route   GET /api/chicken/transactions
// @access  Private (Admin/Super Admin)
const getAllTransactions = async (req, res) => {
  try {
    const {
      transactionType,
      chickenType,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const query = {};

    if (transactionType) {
      query.transactionType = transactionType;
    }

    if (chickenType) {
      query.chickenType = chickenType;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total] = await Promise.all([
      ChickenTransaction.find(query)
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ChickenTransaction.countDocuments(query)
    ]);

    res.json({
      success: true,
      count: transactions.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: transactions
    });
  } catch (error) {
    console.error('Get all transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create purchase
// @route   POST /api/chicken/purchase
// @access  Private (Admin/Super Admin)
const createPurchase = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { chickenType, quantity, pricePerUnit, notes } = req.body;

    await initializeStock();

    // Generate transaction number
    const transactionNumber = await ChickenTransaction.generateTransactionNumber();

    // Calculate total
    const totalAmount = quantity * pricePerUnit;

    // Create transaction
    const transaction = await ChickenTransaction.create({
      transactionNumber,
      transactionType: 'purchase',
      chickenType,
      quantity,
      pricePerUnit,
      totalAmount,
      notes,
      createdBy: req.user.id
    });

    // Update stock
    await ChickenStock.findOneAndUpdate(
      { chickenType },
      {
        $inc: {
          currentStock: quantity,
          totalPurchased: quantity
        }
      }
    );

    await transaction.populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Purchase recorded successfully',
      data: transaction
    });
  } catch (error) {
    console.error('Create purchase error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create sale
// @route   POST /api/chicken/sale
// @access  Private (Admin/Super Admin)
const createSale = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { chickenType, quantity, pricePerUnit, notes } = req.body;

    await initializeStock();

    // Check stock availability
    const stock = await ChickenStock.findOne({ chickenType });
    if (!stock || stock.currentStock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Only ${stock?.currentStock || 0} ${chickenType} available.`
      });
    }

    // Generate transaction number
    const transactionNumber = await ChickenTransaction.generateTransactionNumber();

    // Calculate total
    const totalAmount = quantity * pricePerUnit;

    // Create transaction
    const transaction = await ChickenTransaction.create({
      transactionNumber,
      transactionType: 'sale',
      chickenType,
      quantity,
      pricePerUnit,
      totalAmount,
      notes,
      createdBy: req.user.id
    });

    // Update stock
    await ChickenStock.findOneAndUpdate(
      { chickenType },
      {
        $inc: {
          currentStock: -quantity,
          totalSold: quantity
        }
      }
    );

    await transaction.populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Sale recorded successfully',
      data: transaction
    });
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get statistics
// @route   GET /api/chicken/stats
// @access  Private (Admin/Super Admin)
const getStats = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const [
      stocks,
      totalPurchaseAmount,
      totalSaleAmount,
      todayPurchases,
      todaySales
    ] = await Promise.all([
      ChickenStock.find(),
      ChickenTransaction.aggregate([
        { $match: { transactionType: 'purchase' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, quantity: { $sum: '$quantity' } } }
      ]),
      ChickenTransaction.aggregate([
        { $match: { transactionType: 'sale' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, quantity: { $sum: '$quantity' } } }
      ]),
      ChickenTransaction.aggregate([
        { $match: { transactionType: 'purchase', createdAt: { $gte: startOfDay, $lte: endOfDay } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, quantity: { $sum: '$quantity' } } }
      ]),
      ChickenTransaction.aggregate([
        { $match: { transactionType: 'sale', createdAt: { $gte: startOfDay, $lte: endOfDay } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, quantity: { $sum: '$quantity' } } }
      ])
    ]);

    const totalStock = stocks.reduce((sum, s) => sum + s.currentStock, 0);

    res.json({
      success: true,
      data: {
        totalStock,
        stockByType: stocks.reduce((acc, s) => {
          acc[s.chickenType] = s.currentStock;
          return acc;
        }, {}),
        totalPurchaseAmount: totalPurchaseAmount[0]?.total || 0,
        totalPurchaseQuantity: totalPurchaseAmount[0]?.quantity || 0,
        totalSaleAmount: totalSaleAmount[0]?.total || 0,
        totalSaleQuantity: totalSaleAmount[0]?.quantity || 0,
        todayPurchaseAmount: todayPurchases[0]?.total || 0,
        todayPurchaseQuantity: todayPurchases[0]?.quantity || 0,
        todaySaleAmount: todaySales[0]?.total || 0,
        todaySaleQuantity: todaySales[0]?.quantity || 0
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getStockOverview,
  getAllTransactions,
  createPurchase,
  createSale,
  getStats
};
