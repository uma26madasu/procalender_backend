const { validationResult } = require('express-validator');

/**
 * Middleware for validating request data
 * @param {Array} validations - Array of express-validator validation rules
 * @returns {Function} Express middleware function
 */
exports.validate = (validations) => {
  return async (req, res, next) => {
    // Execute all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Format validation errors
    const formattedErrors = errors.array().reduce((acc, error) => {
      const field = error.param;
      if (!acc[field]) {
        acc[field] = [];
      }
      acc[field].push(error.msg);
      return acc;
    }, {});

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: formattedErrors
    });
  };
};

/**
 * Middleware for handling async errors in routes
 * @param {Function} fn - Async route handler
 * @returns {Function} Express middleware with error handling
 */
exports.asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Global error handler middleware
 */
exports.errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Custom error responses based on error type
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      error: err.message
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
      error: `Invalid ${err.path}: ${err.value}`
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      message: 'Duplicate Error',
      error: `${field} already exists`
    });
  }

  // Default error response
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server Error',
    error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.stack
  });
};