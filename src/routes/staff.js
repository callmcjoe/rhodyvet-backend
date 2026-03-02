const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllStaff,
  getStaff,
  createStaff,
  updateStaff,
  transferStaff,
  deactivateStaff,
  reactivateStaff
} = require('../controllers/staffController');
const { protect } = require('../middleware/auth');
const { authorizeMinRole } = require('../middleware/roleCheck');

// Validation rules
const createStaffValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'sales_rep']).withMessage('Role must be admin or sales_rep'),
  body('department').isIn(['feeds', 'store']).withMessage('Department must be feeds or store')
];

const updateStaffValidation = [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().withMessage('Please provide a valid email'),
  body('role').optional().isIn(['admin', 'sales_rep']).withMessage('Role must be admin or sales_rep'),
  body('department').optional().isIn(['feeds', 'store']).withMessage('Department must be feeds or store'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

const transferValidation = [
  body('department').isIn(['feeds', 'store']).withMessage('Department must be feeds or store')
];

// All routes require authentication and at least admin role
router.use(protect);
router.use(authorizeMinRole('admin'));

// Routes
router.route('/')
  .get(getAllStaff)
  .post(createStaffValidation, createStaff);

router.route('/:id')
  .get(getStaff)
  .put(updateStaffValidation, updateStaff)
  .delete(deactivateStaff);

router.put('/:id/transfer', transferValidation, transferStaff);
router.put('/:id/reactivate', reactivateStaff);

module.exports = router;
