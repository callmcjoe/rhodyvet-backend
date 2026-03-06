const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
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

// Sales routes (specific routes BEFORE generic /:id)
router.get('/', getAllSales);
router.get('/my-summary', getMySalesSummary);
router.get('/number/:saleNumber', getSaleByNumber);

// Discount request routes (must be before /:id)
router.post('/request-discount', requestDiscount);
router.get('/my-discount-requests', getMyDiscountRequests);
router.get('/discount-requests', authorizeMinRole('admin'), getDiscountRequests);
router.put('/discount-requests/:id/approve', authorizeMinRole('admin'), approveDiscountRequest);
router.put('/discount-requests/:id/reject', authorizeMinRole('admin'), rejectDiscountRequest);

// Refund routes (must be before /:id)
router.get('/refunds/all', getAllRefunds);
router.get('/refunds/pending', authorizeMinRole('admin'), getPendingRefunds);
router.post('/refunds', createRefundValidation, createRefund);
router.get('/refunds/:id', getRefund);
router.put('/refunds/:id/approve', authorizeMinRole('admin'), approveRefund);
router.put('/refunds/:id/reject', authorizeMinRole('admin'), rejectRefund);

// Generic routes (must be last)
router.get('/:id', getSale);
router.post('/', createSaleValidation, createSale);

module.exports = router;
