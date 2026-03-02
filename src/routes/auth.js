const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  login,
  getMe,
  logout,
  resetPassword,
  changePassword,
  setupSuperAdmin
} = require('../controllers/authController');
const { protect, refreshToken } = require('../middleware/auth');
const { authorizeMinRole } = require('../middleware/roleCheck');

// Validation rules
const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

const setupValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('department').isIn(['feeds', 'store']).withMessage('Department must be feeds or store')
];

const resetPasswordValidation = [
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
];

// Routes
router.post('/setup', setupValidation, setupSuperAdmin);
router.post('/login', loginValidation, login);
router.post('/refresh-token', refreshToken);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.put('/reset-password/:userId', protect, authorizeMinRole('admin'), resetPasswordValidation, resetPassword);
router.put('/change-password', protect, changePasswordValidation, changePassword);

module.exports = router;
