const express = require('express');
const router = express.Router();

const {
  getDashboardSummary,
  getSalesReport,
  getStaffPerformance,
  getLowStockAlerts,
  getRecentActivity,
  getRefundStats
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
const { authorizeMinRole } = require('../middleware/roleCheck');

// All routes require authentication and admin role
router.use(protect);
router.use(authorizeMinRole('admin'));

// Routes
router.get('/summary', getDashboardSummary);
router.get('/sales-report', getSalesReport);
router.get('/staff-performance', getStaffPerformance);
router.get('/low-stock', getLowStockAlerts);
router.get('/recent-activity', getRecentActivity);
router.get('/refund-stats', getRefundStats);

module.exports = router;
