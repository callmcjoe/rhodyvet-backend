const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const StockLog = require('../models/StockLog');
const { formatStockDisplay } = require('../utils/feedConversions');

// @desc    Get all products
// @route   GET /api/products
// @access  Private
const getAllProducts = async (req, res) => {
  try {
    const { department, search, isActive, lowStock } = req.query;

    const query = {};

    // Filter by department
    if (department) {
      query.department = department;
    }

    // Filter by active status
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Search by name or description
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    let products = await Product.find(query)
      .populate('createdBy', 'firstName lastName')
      .sort({ name: 1 });

    // Filter for low stock if requested
    if (lowStock === 'true') {
      products = products.filter(p => p.isLowStock);
    }

    // Add formatted stock display
    const productsWithDisplay = products.map(p => ({
      ...p.toObject(),
      stockDisplay: formatStockDisplay(p)
    }));

    res.json({
      success: true,
      count: productsWithDisplay.length,
      data: productsWithDisplay
    });
  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('createdBy', 'firstName lastName');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: {
        ...product.toObject(),
        stockDisplay: formatStockDisplay(product)
      }
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Private (Admin/Super Admin)
const createProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      name,
      description,
      department,
      unitType,
      pricePerBag,
      pricePerHalfBag,
      pricePerThirdBag,
      pricePerPaint,
      pricePerHalfPaint,
      pricePerUnit,
      stockInPaints,
      stockInQuantity,
      lowStockThreshold
    } = req.body;

    // Validate unit type matches department
    if (department === 'feeds' && unitType !== 'bag') {
      return res.status(400).json({
        success: false,
        message: 'Feeds department products must use bag unit type'
      });
    }

    if (department === 'store' && unitType !== 'quantity') {
      return res.status(400).json({
        success: false,
        message: 'Store department products must use quantity unit type'
      });
    }

    const product = await Product.create({
      name,
      description,
      department,
      unitType,
      pricePerBag: unitType === 'bag' ? pricePerBag : undefined,
      pricePerHalfBag: unitType === 'bag' ? pricePerHalfBag : undefined,
      pricePerThirdBag: unitType === 'bag' ? pricePerThirdBag : undefined,
      pricePerPaint: unitType === 'bag' ? pricePerPaint : undefined,
      pricePerHalfPaint: unitType === 'bag' ? pricePerHalfPaint : undefined,
      pricePerUnit: unitType === 'quantity' ? pricePerUnit : undefined,
      stockInPaints: unitType === 'bag' ? (stockInPaints || 0) : 0,
      stockInQuantity: unitType === 'quantity' ? (stockInQuantity || 0) : 0,
      lowStockThreshold: lowStockThreshold || 10,
      createdBy: req.user.id
    });

    // Log initial stock if any
    if ((unitType === 'bag' && stockInPaints > 0) || (unitType === 'quantity' && stockInQuantity > 0)) {
      await StockLog.create({
        product: product._id,
        productName: product.name,
        department: product.department,
        actionType: 'stock_in',
        previousStockInPaints: 0,
        quantityChangedInPaints: unitType === 'bag' ? stockInPaints : 0,
        newStockInPaints: unitType === 'bag' ? stockInPaints : 0,
        previousStockInQuantity: 0,
        quantityChangedInQuantity: unitType === 'quantity' ? stockInQuantity : 0,
        newStockInQuantity: unitType === 'quantity' ? stockInQuantity : 0,
        notes: 'Initial stock on product creation',
        performedBy: req.user.id
      });
    }

    res.status(201).json({
      success: true,
      data: {
        ...product.toObject(),
        stockDisplay: formatStockDisplay(product)
      }
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private (Admin/Super Admin)
const updateProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const {
      name,
      description,
      pricePerBag,
      pricePerHalfBag,
      pricePerThirdBag,
      pricePerPaint,
      pricePerHalfPaint,
      pricePerUnit,
      lowStockThreshold,
      isActive
    } = req.body;

    // Update allowed fields (cannot change department or unitType after creation)
    if (name) product.name = name;
    if (description !== undefined) product.description = description;
    if (lowStockThreshold !== undefined) product.lowStockThreshold = lowStockThreshold;
    if (isActive !== undefined) product.isActive = isActive;

    // Update prices based on unit type
    if (product.unitType === 'bag') {
      if (pricePerBag !== undefined) product.pricePerBag = pricePerBag;
      if (pricePerHalfBag !== undefined) product.pricePerHalfBag = pricePerHalfBag;
      if (pricePerThirdBag !== undefined) product.pricePerThirdBag = pricePerThirdBag;
      if (pricePerPaint !== undefined) product.pricePerPaint = pricePerPaint;
      if (pricePerHalfPaint !== undefined) product.pricePerHalfPaint = pricePerHalfPaint;
    } else {
      if (pricePerUnit !== undefined) product.pricePerUnit = pricePerUnit;
    }

    await product.save();

    res.json({
      success: true,
      data: {
        ...product.toObject(),
        stockDisplay: formatStockDisplay(product)
      }
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Deactivate product (soft delete)
// @route   DELETE /api/products/:id
// @access  Private (Admin/Super Admin)
const deactivateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.isActive = false;
    await product.save();

    res.json({
      success: true,
      message: 'Product deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Reactivate product
// @route   PUT /api/products/:id/reactivate
// @access  Private (Admin/Super Admin)
const reactivateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.isActive = true;
    await product.save();

    res.json({
      success: true,
      message: 'Product reactivated successfully',
      data: product
    });
  } catch (error) {
    console.error('Reactivate product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get products with low stock
// @route   GET /api/products/low-stock
// @access  Private (Admin/Super Admin)
const getLowStockProducts = async (req, res) => {
  try {
    const { department } = req.query;

    const query = { isActive: true };
    if (department) {
      query.department = department;
    }

    const products = await Product.find(query);

    const lowStockProducts = products
      .filter(p => p.isLowStock)
      .map(p => ({
        ...p.toObject(),
        stockDisplay: formatStockDisplay(p)
      }));

    res.json({
      success: true,
      count: lowStockProducts.length,
      data: lowStockProducts
    });
  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getAllProducts,
  getProduct,
  createProduct,
  updateProduct,
  deactivateProduct,
  reactivateProduct,
  getLowStockProducts
};
