const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllProducts,
  getProduct,
  createProduct,
  updateProduct,
  deactivateProduct,
  reactivateProduct,
  getLowStockProducts
} = require('../controllers/productController');
const { protect } = require('../middleware/auth');
const { authorizeMinRole } = require('../middleware/roleCheck');

// Validation rules
const createProductValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('department').isIn(['feeds', 'store']).withMessage('Department must be feeds or store'),
  body('unitType').isIn(['bag', 'quantity']).withMessage('Unit type must be bag or quantity'),
  body('pricePerBag').optional().isFloat({ min: 0 }).withMessage('Price per bag must be a positive number'),
  body('pricePerHalfBag').optional().isFloat({ min: 0 }).withMessage('Price per half bag must be a positive number'),
  body('pricePerThirdBag').optional().isFloat({ min: 0 }).withMessage('Price per third bag must be a positive number'),
  body('pricePerPaint').optional().isFloat({ min: 0 }).withMessage('Price per paint must be a positive number'),
  body('pricePerHalfPaint').optional().isFloat({ min: 0 }).withMessage('Price per half paint must be a positive number'),
  body('pricePerUnit').optional().isFloat({ min: 0 }).withMessage('Price per unit must be a positive number'),
  body('stockInPaints').optional().isInt({ min: 0 }).withMessage('Stock in paints must be a non-negative integer'),
  body('stockInQuantity').optional().isInt({ min: 0 }).withMessage('Stock in quantity must be a non-negative integer'),
  body('lowStockThreshold').optional().isInt({ min: 0 }).withMessage('Low stock threshold must be a non-negative integer')
];

const updateProductValidation = [
  body('name').optional().trim().notEmpty().withMessage('Product name cannot be empty'),
  body('pricePerBag').optional().isFloat({ min: 0 }).withMessage('Price per bag must be a positive number'),
  body('pricePerHalfBag').optional().isFloat({ min: 0 }).withMessage('Price per half bag must be a positive number'),
  body('pricePerThirdBag').optional().isFloat({ min: 0 }).withMessage('Price per third bag must be a positive number'),
  body('pricePerPaint').optional().isFloat({ min: 0 }).withMessage('Price per paint must be a positive number'),
  body('pricePerHalfPaint').optional().isFloat({ min: 0 }).withMessage('Price per half paint must be a positive number'),
  body('pricePerUnit').optional().isFloat({ min: 0 }).withMessage('Price per unit must be a positive number'),
  body('lowStockThreshold').optional().isInt({ min: 0 }).withMessage('Low stock threshold must be a non-negative integer'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

// All routes require authentication
router.use(protect);

// Public routes (all authenticated users)
router.get('/', getAllProducts);
router.get('/low-stock', authorizeMinRole('admin'), getLowStockProducts);
router.get('/:id', getProduct);

// Admin only routes
router.post('/', authorizeMinRole('admin'), createProductValidation, createProduct);
router.put('/:id', authorizeMinRole('admin'), updateProductValidation, updateProduct);
router.delete('/:id', authorizeMinRole('admin'), deactivateProduct);
router.put('/:id/reactivate', authorizeMinRole('admin'), reactivateProduct);

module.exports = router;
