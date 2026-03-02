// Role hierarchy: super_admin > admin > sales_rep
const roleHierarchy = {
  super_admin: 3,
  admin: 2,
  sales_rep: 1
};

// Check if user has required role(s)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role ${req.user.role} is not authorized to access this route`
      });
    }

    next();
  };
};

// Check if user has at least the minimum role level
const authorizeMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const userRoleLevel = roleHierarchy[req.user.role];
    const requiredRoleLevel = roleHierarchy[minRole];

    if (userRoleLevel < requiredRoleLevel) {
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Minimum role required: ${minRole}`
      });
    }

    next();
  };
};

// Check if user can manage target user based on role hierarchy
const canManageUser = (req, res, next) => {
  const { targetRole } = req.body;

  if (!targetRole) {
    return next();
  }

  const userRoleLevel = roleHierarchy[req.user.role];
  const targetRoleLevel = roleHierarchy[targetRole];

  // Can only manage users with lower role level
  if (targetRoleLevel >= userRoleLevel) {
    return res.status(403).json({
      success: false,
      message: 'You cannot manage users with equal or higher role'
    });
  }

  next();
};

module.exports = { authorize, authorizeMinRole, canManageUser, roleHierarchy };
