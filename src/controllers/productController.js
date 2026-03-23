const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const StockLog = require('../models/StockLog');
const { formatStockDisplay } = require('../utils/feedConversions');

// @desc    Get all products
// @route   GET /api/products
// @access  Private
const getAllProducts = async (req, res) => {
  try {
    const { department, search, isActive, lowStock, page = 1, limit = 20 } = req.query;
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

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get total count for pagination
    let total = await Product.countDocuments(query);

    let products = await Product.find(query)
      .populate('createdBy', 'firstName lastName')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Filter for low stock if requested (after pagination for accurate count)
    if (lowStock === 'true') {
      // For low stock, we need to fetch all and filter, then paginate
      const allProducts = await Product.find(query)
        .populate('createdBy', 'firstName lastName')
        .sort({ name: 1 });
      const lowStockProducts = allProducts.filter(p => p.isLowStock);
      total = lowStockProducts.length;
      products = lowStockProducts.slice(skip, skip + parseInt(limit));
    }

    // Add formatted stock display
    const productsWithDisplay = products.map(p => ({
      ...p.toObject(),
      stockDisplay: formatStockDisplay(p)
    }));

    res.json({
      success: true,
      count: productsWithDisplay.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
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
      pricePerQuarterBag,
      pricePerPaint,
      pricePerHalfPaint,
      pricePerUnit,
      stockInPaints,
      stockInQuantity,
      initialStockInStockUnits,
      lowStockThreshold,
      baseUnit,
      stockUnit,
      stockUnitEquivalent,
      saleUnits
    } = req.body;

    // Check if product with same name already exists (case-insensitive)
    const trimmedName = name.trim();

    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (existingProduct) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_PRODUCT',
        message: `Product "${existingProduct.name}" already exists`,
        existingProduct: {
          _id: existingProduct._id,
          name: existingProduct.name,
          department: existingProduct.department,
          unitType: existingProduct.unitType,
          baseUnit: existingProduct.baseUnit,
          stockUnit: existingProduct.stockUnit,
          stockUnitEquivalent: existingProduct.stockUnitEquivalent,
          stockDisplay: formatStockDisplay(existingProduct)
        }
      });
    }

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

    // Validate store products have baseUnit and saleUnits
    if (department === 'store') {
      if (!baseUnit) {
        return res.status(400).json({
          success: false,
          message: 'Base unit is required for store products'
        });
      }
      if (!saleUnits || saleUnits.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one sale unit is required for store products'
        });
      }
    }

    // Calculate stock in base units for store products
    let calculatedStockInQuantity = stockInQuantity || 0;
    if (unitType === 'quantity' && initialStockInStockUnits && stockUnitEquivalent) {
      // Convert from stock units to base units
      calculatedStockInQuantity = initialStockInStockUnits * stockUnitEquivalent;
    }

    const product = await Product.create({
      name,
      description,
      department,
      unitType,
      pricePerBag: unitType === 'bag' ? pricePerBag : undefined,
      pricePerHalfBag: unitType === 'bag' ? pricePerHalfBag : undefined,
      pricePerQuarterBag: unitType === 'bag' ? pricePerQuarterBag : undefined,
      pricePerPaint: unitType === 'bag' ? pricePerPaint : undefined,
      pricePerHalfPaint: unitType === 'bag' ? pricePerHalfPaint : undefined,
      pricePerUnit: unitType === 'quantity' ? pricePerUnit : undefined,
      baseUnit: unitType === 'quantity' ? baseUnit : undefined,
      stockUnit: unitType === 'quantity' ? stockUnit : undefined,
      stockUnitEquivalent: unitType === 'quantity' ? stockUnitEquivalent : undefined,
      saleUnits: unitType === 'quantity' ? saleUnits : undefined,
      stockInPaints: unitType === 'bag' ? (stockInPaints || 0) : 0,
      stockInQuantity: unitType === 'quantity' ? calculatedStockInQuantity : 0,
      lowStockThreshold: lowStockThreshold || 10,
      createdBy: req.user.id
    });

    // Log initial stock if any
    if ((unitType === 'bag' && stockInPaints > 0) || (unitType === 'quantity' && calculatedStockInQuantity > 0)) {
      await StockLog.create({
        product: product._id,
        productName: product.name,
        department: product.department,
        actionType: 'stock_in',
        previousStockInPaints: 0,
        quantityChangedInPaints: unitType === 'bag' ? stockInPaints : 0,
        newStockInPaints: unitType === 'bag' ? stockInPaints : 0,
        previousStockInQuantity: 0,
        quantityChangedInQuantity: unitType === 'quantity' ? calculatedStockInQuantity : 0,
        newStockInQuantity: unitType === 'quantity' ? calculatedStockInQuantity : 0,
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
      pricePerQuarterBag,
      pricePerPaint,
      pricePerHalfPaint,
      pricePerUnit,
      lowStockThreshold,
      isActive,
      baseUnit,
      stockUnit,
      stockUnitEquivalent,
      saleUnits
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
      if (pricePerQuarterBag !== undefined) product.pricePerQuarterBag = pricePerQuarterBag;
      if (pricePerPaint !== undefined) product.pricePerPaint = pricePerPaint;
      if (pricePerHalfPaint !== undefined) product.pricePerHalfPaint = pricePerHalfPaint;
    } else {
      if (pricePerUnit !== undefined) product.pricePerUnit = pricePerUnit;
      if (baseUnit !== undefined) product.baseUnit = baseUnit;
      if (stockUnit !== undefined) product.stockUnit = stockUnit;
      if (stockUnitEquivalent !== undefined) product.stockUnitEquivalent = stockUnitEquivalent;
      if (saleUnits !== undefined) product.saleUnits = saleUnits;
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
