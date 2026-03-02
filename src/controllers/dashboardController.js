const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Refund = require('../models/Refund');
const Product = require('../models/Product');
const User = require('../models/User');
const StockLog = require('../models/StockLog');

// @desc    Get dashboard summary
// @route   GET /api/dashboard/summary
// @access  Private (Admin/Super Admin)
const getDashboardSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's sales
    const todaySales = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
          status: { $ne: 'fully_refunded' }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Get pending refunds count
    const pendingRefunds = await Refund.countDocuments({ status: 'pending' });

    // Get low stock count
    const products = await Product.find({ isActive: true });
    const lowStockCount = products.filter(p => p.isLowStock).length;

    // Get active staff count
    const activeStaff = await User.countDocuments({ isActive: true });

    // Get sales by department today
    const salesByDepartment = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
          status: { $ne: 'fully_refunded' }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.department',
          total: { $sum: '$items.totalPrice' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        todaySales: todaySales[0] || { count: 0, total: 0 },
        pendingRefunds,
        lowStockCount,
        activeStaff,
        salesByDepartment: salesByDepartment.reduce((acc, curr) => {
          acc[curr._id] = { total: curr.total, count: curr.count };
          return acc;
        }, { feeds: { total: 0, count: 0 }, store: { total: 0, count: 0 } })
      }
    });
  } catch (error) {
    console.error('Get dashboard summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get sales report
// @route   GET /api/dashboard/sales-report
// @access  Private (Admin/Super Admin)
const getSalesReport = async (req, res) => {
  try {
    const { period = 'daily', startDate, endDate, department } = req.query;

    let start, end;
    const now = new Date();

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      switch (period) {
        case 'weekly':
          start = new Date(now);
          start.setDate(start.getDate() - 7);
          break;
        case 'monthly':
          start = new Date(now);
          start.setMonth(start.getMonth() - 1);
          break;
        case 'yearly':
          start = new Date(now);
          start.setFullYear(start.getFullYear() - 1);
          break;
        default: // daily - last 30 days
          start = new Date(now);
          start.setDate(start.getDate() - 30);
      }
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
    }

    const matchStage = {
      createdAt: { $gte: start, $lte: end },
      status: { $ne: 'fully_refunded' }
    };

    let groupFormat;
    switch (period) {
      case 'yearly':
        groupFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
        break;
      case 'monthly':
      case 'weekly':
        groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
        break;
      default:
        groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: groupFormat,
          totalSales: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          avgSaleAmount: { $avg: '$totalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const salesData = await Sale.aggregate(pipeline);

    // Department breakdown
    const departmentPipeline = [
      { $match: matchStage },
      { $unwind: '$items' }
    ];

    if (department) {
      departmentPipeline.push({ $match: { 'items.department': department } });
    }

    departmentPipeline.push({
      $group: {
        _id: '$items.department',
        totalSales: { $sum: 1 },
        totalAmount: { $sum: '$items.totalPrice' }
      }
    });

    const departmentData = await Sale.aggregate(departmentPipeline);

    res.json({
      success: true,
      data: {
        period,
        dateRange: { start, end },
        salesTrend: salesData,
        departmentBreakdown: departmentData.reduce((acc, curr) => {
          acc[curr._id] = { totalSales: curr.totalSales, totalAmount: curr.totalAmount };
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Get sales report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get staff performance report
// @route   GET /api/dashboard/staff-performance
// @access  Private (Admin/Super Admin)
const getStaffPerformance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      // Default to current month
      start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    const performance = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $ne: 'fully_refunded' }
        }
      },
      {
        $group: {
          _id: '$soldBy',
          totalSales: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          avgSaleAmount: { $avg: '$totalAmount' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'staff'
        }
      },
      { $unwind: '$staff' },
      {
        $project: {
          _id: 1,
          staffName: { $concat: ['$staff.firstName', ' ', '$staff.lastName'] },
          department: '$staff.department',
          totalSales: 1,
          totalAmount: 1,
          avgSaleAmount: { $round: ['$avgSaleAmount', 2] }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        dateRange: { start, end },
        performance
      }
    });
  } catch (error) {
    console.error('Get staff performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get low stock alerts
// @route   GET /api/dashboard/low-stock
// @access  Private (Admin/Super Admin)
const getLowStockAlerts = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .select('name department unitType stockInPaints stockInQuantity lowStockThreshold')
      .populate('createdBy', 'firstName lastName');

    const lowStockItems = products
      .filter(p => p.isLowStock)
      .map(p => ({
        _id: p._id,
        name: p.name,
        department: p.department,
        unitType: p.unitType,
        currentStock: p.unitType === 'bag'
          ? `${(p.stockInPaints / 8).toFixed(2)} bags (${p.stockInPaints} paints)`
          : `${p.stockInQuantity} units`,
        threshold: p.unitType === 'bag'
          ? `${p.lowStockThreshold} bags`
          : `${p.lowStockThreshold} units`
      }));

    res.json({
      success: true,
      count: lowStockItems.length,
      data: lowStockItems
    });
  } catch (error) {
    console.error('Get low stock alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get recent activity
// @route   GET /api/dashboard/recent-activity
// @access  Private (Admin/Super Admin)
const getRecentActivity = async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Get recent sales
    const recentSales = await Sale.find()
      .populate('soldBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) / 2)
      .lean();

    // Get recent refunds
    const recentRefunds = await Refund.find()
      .populate('requestedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) / 2)
      .lean();

    // Get recent stock logs
    const recentStockLogs = await StockLog.find({ actionType: { $in: ['stock_in', 'stock_out', 'adjustment'] } })
      .populate('performedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) / 2)
      .lean();

    // Combine and format activities
    const activities = [
      ...recentSales.map(s => ({
        type: 'sale',
        id: s._id,
        description: `Sale ${s.saleNumber} - ${s.totalAmount.toLocaleString()}`,
        user: s.soldBy ? `${s.soldBy.firstName} ${s.soldBy.lastName}` : 'Unknown',
        timestamp: s.createdAt,
        status: s.status
      })),
      ...recentRefunds.map(r => ({
        type: 'refund',
        id: r._id,
        description: `Refund ${r.refundNumber} - ${r.totalRefundAmount.toLocaleString()}`,
        user: r.requestedBy ? `${r.requestedBy.firstName} ${r.requestedBy.lastName}` : 'Unknown',
        timestamp: r.createdAt,
        status: r.status
      })),
      ...recentStockLogs.map(l => ({
        type: 'stock',
        id: l._id,
        description: `${l.actionType.replace('_', ' ')} - ${l.productName}`,
        user: l.performedBy ? `${l.performedBy.firstName} ${l.performedBy.lastName}` : 'Unknown',
        timestamp: l.createdAt
      }))
    ];

    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      data: activities.slice(0, parseInt(limit))
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get refund statistics
// @route   GET /api/dashboard/refund-stats
// @access  Private (Admin/Super Admin)
const getRefundStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      start = new Date();
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    const stats = await Refund.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalRefundAmount' }
        }
      }
    ]);

    const formattedStats = {
      pending: { count: 0, totalAmount: 0 },
      approved: { count: 0, totalAmount: 0 },
      rejected: { count: 0, totalAmount: 0 }
    };

    stats.forEach(s => {
      formattedStats[s._id] = { count: s.count, totalAmount: s.totalAmount };
    });

    const totalRefunds = stats.reduce((acc, s) => acc + s.count, 0);
    const totalRefundAmount = stats.reduce((acc, s) => s._id === 'approved' ? acc + s.totalAmount : acc, 0);

    res.json({
      success: true,
      data: {
        dateRange: { start, end },
        byStatus: formattedStats,
        totals: {
          totalRefunds,
          totalRefundAmount,
          approvalRate: totalRefunds > 0
            ? ((formattedStats.approved.count / totalRefunds) * 100).toFixed(1)
            : 0
        }
      }
    });
  } catch (error) {
    console.error('Get refund stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getDashboardSummary,
  getSalesReport,
  getStaffPerformance,
  getLowStockAlerts,
  getRecentActivity,
  getRefundStats
};
