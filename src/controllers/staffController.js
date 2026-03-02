const { validationResult } = require('express-validator');
const User = require('../models/User');
const { roleHierarchy } = require('../middleware/roleCheck');

// @desc    Get all staff
// @route   GET /api/staff
// @access  Private (Admin/Super Admin)
const getAllStaff = async (req, res) => {
  try {
    const { department, role, isActive, search } = req.query;

    const query = {};

    // Filter by department
    if (department) {
      query.department = department;
    }

    // Filter by role
    if (role) {
      query.role = role;
    }

    // Filter by active status
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Search by name or email
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Admins can only see sales reps
    if (req.user.role === 'admin') {
      query.role = 'sales_rep';
    }

    const staff = await User.find(query)
      .select('-refreshToken')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: staff.length,
      data: staff
    });
  } catch (error) {
    console.error('Get all staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single staff member
// @route   GET /api/staff/:id
// @access  Private (Admin/Super Admin)
const getStaff = async (req, res) => {
  try {
    const staff = await User.findById(req.params.id)
      .select('-refreshToken')
      .populate('createdBy', 'firstName lastName');

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Admins can only view sales reps
    if (req.user.role === 'admin' && staff.role !== 'sales_rep') {
      return res.status(403).json({
        success: false,
        message: 'You can only view sales representatives'
      });
    }

    res.json({
      success: true,
      data: staff
    });
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create new staff member
// @route   POST /api/staff
// @access  Private (Admin/Super Admin)
const createStaff = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, password, role, department } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Check role permissions
    const creatorRoleLevel = roleHierarchy[req.user.role];
    const newRoleLevel = roleHierarchy[role];

    if (newRoleLevel >= creatorRoleLevel) {
      return res.status(403).json({
        success: false,
        message: 'You cannot create a user with equal or higher role'
      });
    }

    // Admins can only create sales_rep
    if (req.user.role === 'admin' && role !== 'sales_rep') {
      return res.status(403).json({
        success: false,
        message: 'You can only create sales representatives'
      });
    }

    const staff = await User.create({
      firstName,
      lastName,
      email,
      password,
      role,
      department,
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      data: {
        id: staff._id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        role: staff.role,
        department: staff.department,
        isActive: staff.isActive
      }
    });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update staff member
// @route   PUT /api/staff/:id
// @access  Private (Admin/Super Admin)
const updateStaff = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const staff = await User.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Check if trying to update self
    if (staff._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update your own profile through this endpoint. Use profile settings.'
      });
    }

    // Check role permissions
    const updaterRoleLevel = roleHierarchy[req.user.role];
    const targetRoleLevel = roleHierarchy[staff.role];

    if (targetRoleLevel >= updaterRoleLevel) {
      return res.status(403).json({
        success: false,
        message: 'You cannot update a user with equal or higher role'
      });
    }

    // If changing role, check new role permissions
    if (req.body.role) {
      const newRoleLevel = roleHierarchy[req.body.role];
      if (newRoleLevel >= updaterRoleLevel) {
        return res.status(403).json({
          success: false,
          message: 'You cannot assign a role equal or higher than yours'
        });
      }

      // Admins can only set role to sales_rep
      if (req.user.role === 'admin' && req.body.role !== 'sales_rep') {
        return res.status(403).json({
          success: false,
          message: 'You can only assign sales representative role'
        });
      }
    }

    const { firstName, lastName, email, role, department, isActive } = req.body;

    // Check if email is being changed and is unique
    if (email && email !== staff.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }

    // Update fields
    if (firstName) staff.firstName = firstName;
    if (lastName) staff.lastName = lastName;
    if (email) staff.email = email;
    if (role) staff.role = role;
    if (department) staff.department = department;
    if (isActive !== undefined) staff.isActive = isActive;

    await staff.save();

    res.json({
      success: true,
      data: {
        id: staff._id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        role: staff.role,
        department: staff.department,
        isActive: staff.isActive
      }
    });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Transfer staff to different department
// @route   PUT /api/staff/:id/transfer
// @access  Private (Admin/Super Admin)
const transferStaff = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { department } = req.body;

    const staff = await User.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Check role permissions
    const updaterRoleLevel = roleHierarchy[req.user.role];
    const targetRoleLevel = roleHierarchy[staff.role];

    if (targetRoleLevel >= updaterRoleLevel) {
      return res.status(403).json({
        success: false,
        message: 'You cannot transfer a user with equal or higher role'
      });
    }

    const previousDepartment = staff.department;
    staff.department = department;
    await staff.save();

    res.json({
      success: true,
      message: `Staff transferred from ${previousDepartment} to ${department}`,
      data: {
        id: staff._id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        previousDepartment,
        newDepartment: staff.department
      }
    });
  } catch (error) {
    console.error('Transfer staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Deactivate staff member (soft delete)
// @route   DELETE /api/staff/:id
// @access  Private (Admin/Super Admin)
const deactivateStaff = async (req, res) => {
  try {
    const staff = await User.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Prevent self-deactivation
    if (staff._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }

    // Check role permissions
    const deactivatorRoleLevel = roleHierarchy[req.user.role];
    const targetRoleLevel = roleHierarchy[staff.role];

    if (targetRoleLevel >= deactivatorRoleLevel) {
      return res.status(403).json({
        success: false,
        message: 'You cannot deactivate a user with equal or higher role'
      });
    }

    staff.isActive = false;
    staff.refreshToken = null; // Invalidate sessions
    await staff.save();

    res.json({
      success: true,
      message: 'Staff member deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Reactivate staff member
// @route   PUT /api/staff/:id/reactivate
// @access  Private (Admin/Super Admin)
const reactivateStaff = async (req, res) => {
  try {
    const staff = await User.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Check role permissions
    const reactivatorRoleLevel = roleHierarchy[req.user.role];
    const targetRoleLevel = roleHierarchy[staff.role];

    if (targetRoleLevel >= reactivatorRoleLevel) {
      return res.status(403).json({
        success: false,
        message: 'You cannot reactivate a user with equal or higher role'
      });
    }

    staff.isActive = true;
    await staff.save();

    res.json({
      success: true,
      message: 'Staff member reactivated successfully',
      data: {
        id: staff._id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        isActive: staff.isActive
      }
    });
  } catch (error) {
    console.error('Reactivate staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getAllStaff,
  getStaff,
  createStaff,
  updateStaff,
  transferStaff,
  deactivateStaff,
  reactivateStaff
};
