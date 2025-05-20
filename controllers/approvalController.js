const Booking = require('../models/bookingModel');
const User = require('../models/userModel');
const BookingLink = require('../models/linkModel');
const notificationService = require('../services/notificationService');
const calendarService = require('../services/calendarService');

// Get pending approvals for a user
exports.getPendingApprovals = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Find all booking links where this user is an approver
    const links = await BookingLink.find({
      approvers: userId
    });
    
    // Get link IDs
    const linkIds = links.map(link => link._id);
    
    // Find all pending bookings for these links
    const pendingApprovals = await Booking.find({
      linkId: { $in: linkIds },
      approvalStatus: 'pending'
    }).populate('linkId', 'name');
    
    res.status(200).json({
      success: true,
      count: pendingApprovals.length,
      data: pendingApprovals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
};

// Get all approvals (pending, approved, rejected) for a user
exports.getAllApprovals = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query; // Optional query param to filter by status
    
    // Find all booking links where this user is an approver
    const links = await BookingLink.find({
      approvers: userId
    });
    
    // Get link IDs
    const linkIds = links.map(link => link._id);
    
    // Build query
    const query = {
      linkId: { $in: linkIds }
    };
    
    // Add status filter if provided
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query.approvalStatus = status;
    }
    
    // Find all bookings for these links with optional status filter
    const approvals = await Booking.find(query)
      .populate('linkId', 'name')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: approvals.length,
      data: approvals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
};

// Approve a booking request
exports.approveBooking = async (req, res) => {
  try {
    const { id } = req.params; // Booking ID
    const userId = req.user.id; // Approver ID
    
    // Find the booking
    const booking = await Booking.findById(id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Check if booking is already processed
    if (booking.approvalStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Booking is already ${booking.approvalStatus}`
      });
    }
    
    // Verify user is authorized to approve
    const bookingLink = await BookingLink.findById(booking.linkId);
    if (!bookingLink.approvers.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to approve this booking'
      });
    }
    
    // Update booking status
    booking.approvalStatus = 'approved';
    booking.approvedBy = userId;
    booking.approvedAt = new Date();
    
    await booking.save();
    
    // If there's a tentative calendar event, update it to confirmed
    if (booking.tentativeEventId && bookingLink.calendarIntegration) {
      await calendarService.confirmEvent(
        bookingLink.calendarId,
        booking.tentativeEventId
      );
    }
    
    // Send notification to client
    await notificationService.sendApprovalConfirmation(booking);
    
    res.status(200).json({
      success: true,
      data: booking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
};

// Reject a booking request
exports.rejectBooking = async (req, res) => {
  try {
    const { id } = req.params; // Booking ID
    const userId = req.user.id; // Approver ID
    const { reason } = req.body; // Rejection reason
    
    // Find the booking
    const booking = await Booking.findById(id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Check if booking is already processed
    if (booking.approvalStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Booking is already ${booking.approvalStatus}`
      });
    }
    
    // Verify user is authorized to reject
    const bookingLink = await BookingLink.findById(booking.linkId);
    if (!bookingLink.approvers.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to reject this booking'
      });
    }
    
    // Update booking status
    booking.approvalStatus = 'rejected';
    booking.rejectedBy = userId;
    booking.rejectedAt = new Date();
    booking.rejectionReason = reason || 'No reason provided';
    
    await booking.save();
    
    // If there's a tentative calendar event, delete it
    if (booking.tentativeEventId && bookingLink.calendarIntegration) {
      await calendarService.deleteEvent(
        bookingLink.calendarId,
        booking.tentativeEventId
      );
    }
    
    // Send notification to client
    await notificationService.sendRejectionNotification(
      booking,
      booking.rejectionReason
    );
    
    res.status(200).json({
      success: true,
      data: booking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
};