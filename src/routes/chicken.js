const express = require('express');
const { body } = require('express-validator');
const {
  getStockOverview,
  getAllTransactions,
  createPurchase,
  createSale,
  getStats
} = require('../controllers/chickenController');
const { protect } = require('../middleware/auth');
const { authorizeMinRole } = require('../middleware/roleCheck');

const router = express.Router();

// Validation rules
const purchaseValidation = [
  body('chickenType')
    .isIn(['broiler', 'noiler', 'turkey'])
    .withMessage('Chicken type must be broiler, noiler, or turkey'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  body('pricePerUnit')
    .isFloat({ min: 0 })
    .withMessage('Price per unit must be a positive number'),
  body('notes').optional().trim()
];

const saleValidation = [
  body('chickenType')
    .isIn(['broiler', 'noiler', 'turkey'])
    .withMessage('Chicken type must be broiler, noiler, or turkey'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  body('pricePerUnit')
    .isFloat({ min: 0 })
    .withMessage('Price per unit must be a positive number'),
  body('notes').optional().trim()
];

// Apply auth middleware to all routes
router.use(protect);
router.use(authorizeMinRole('admin'));

// Routes
router.get('/stock', getStockOverview);
router.get('/transactions', getAllTransactions);
router.get('/stats', getStats);
router.post('/purchase', purchaseValidation, createPurchase);
router.post('/sale', saleValidation, createSale);

module.exports = router;
