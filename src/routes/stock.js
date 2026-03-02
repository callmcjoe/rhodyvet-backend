const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getStockOverview,
  addStock,
  removeStock,
  adjustStock,
  getProductStockLogs,
  getAllStockLogs
} = require('../controllers/stockController');
const { protect } = require('../middleware/auth');
const { authorizeMinRole } = require('../middleware/roleCheck');

// Validation rules
const addStockValidation = [
  body('quantity').optional().isFloat({ min: 0.01 }).withMessage('Quantity must be a positive number'),
  body('quantityInBags').optional().isFloat({ min: 0.01 }).withMessage('Quantity in bags must be a positive number'),
  body('notes').optional().trim()
];

const removeStockValidation = [
  body('quantity').optional().isFloat({ min: 0.01 }).withMessage('Quantity must be a positive number'),
  body('quantityInBags').optional().isFloat({ min: 0.01 }).withMessage('Quantity in bags must be a positive number'),
  body('notes').optional().trim()
];

const adjustStockValidation = [
  body('newStock').optional().isFloat({ min: 0 }).withMessage('New stock must be a non-negative number'),
  body('newStockInBags').optional().isFloat({ min: 0 }).withMessage('New stock in bags must be a non-negative number'),
  body('notes').trim().notEmpty().withMessage('Notes are required for stock adjustment')
];

// All routes require authentication and admin role
router.use(protect);
router.use(authorizeMinRole('admin'));

// Routes
router.get('/', getStockOverview);
router.get('/logs', getAllStockLogs);
router.get('/:productId/logs', getProductStockLogs);
router.post('/:productId/add', addStockValidation, addStock);
router.post('/:productId/remove', removeStockValidation, removeStock);
router.post('/:productId/adjust', adjustStockValidation, adjustStock);

module.exports = router;
