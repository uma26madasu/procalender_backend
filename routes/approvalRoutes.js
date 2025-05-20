const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getPendingApprovals,
  getAllApprovals,
  approveBooking,
  rejectBooking
} = require('../controllers/approvalController');

// All approval routes require authentication
router.use(protect);

// Get routes
router.get('/pending', getPendingApprovals);
router.get('/', getAllApprovals);

// Action routes
router.put('/:id/approve', approveBooking);
router.put('/:id/reject', rejectBooking);

module.exports = router;