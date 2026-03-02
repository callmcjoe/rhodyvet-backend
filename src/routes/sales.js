const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllSales,
  getSale,
  getSaleByNumber,
  createSale,
  getMySalesSummary
} = require('../controllers/saleController');

const {
  getAllRefunds,
  getPendingRefunds,
  getRefund,
  createRefund,
  approveRefund,
  rejectRefund
} = require('../controllers/refundController');

const { protect } = require('../middleware/auth');
const { authorizeMinRole } = require('../middleware/roleCheck');

// Sale validation rules
const createSaleValidation = [
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').isMongoId().withMessage('Valid product ID is required'),
  body('paymentMethod').optional().isIn(['cash', 'transfer', 'card']).withMessage('Invalid payment method')
];

// Refund validation rules
const createRefundValidation = [
  body('saleId').isMongoId().withMessage('Valid sale ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').isMongoId().withMessage('Valid product ID is required'),
  body('reason').trim().notEmpty().withMessage('Refund reason is required')
];

// All routes require authentication
router.use(protect);

// Sales routes
router.get('/', getAllSales);
router.get('/my-summary', getMySalesSummary);
router.get('/number/:saleNumber', getSaleByNumber);
router.get('/:id', getSale);
router.post('/', createSaleValidation, createSale);

// Refund routes
router.get('/refunds/all', getAllRefunds);
router.get('/refunds/pending', authorizeMinRole('admin'), getPendingRefunds);
router.get('/refunds/:id', getRefund);
router.post('/refunds', createRefundValidation, createRefund);
router.put('/refunds/:id/approve', authorizeMinRole('admin'), approveRefund);
router.put('/refunds/:id/reject', authorizeMinRole('admin'), rejectRefund);

module.exports = router;
