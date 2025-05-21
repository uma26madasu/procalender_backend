/**
 * Middleware for handling async errors in routes
 * @param {Function} fn - Async route handler
 * @returns {Function} Express middleware with error handling
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = asyncHandler;