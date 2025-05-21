const { asyncHandler, successResponse, errorResponse } = require('../utils/errorHandler');
const availabilityService = require('../services/availabilityService');
const { Link, User, Booking } = require('../models');
const calendarService = require('../services/calendarService');
const notificationService = require('../services/notificationService');

// Helper function to build pagination metadata
const buildPagination = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null
  };
};

// Get all bookings with advanced pagination and filtering
exports.getBookings = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10,
    status,
    startDate,
    endDate,
    sortBy = 'startTime',
    sortOrder = 'desc',
    search
  } = req.query;

  // Convert to numbers
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Build filter
  const filter = { userId: req.user.id };
  if (status) filter.status = status;
  if (startDate && endDate) {
    filter.startTime = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  if (search) {
    filter.$or = [
      { clientName: { $regex: search, $options: 'i' } },
      { clientEmail: { $regex: search, $options: 'i' } },
      { meetingName: { $regex: search, $options: 'i' } }
    ];
  }

  // Build sort
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  // Execute queries in parallel
  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('linkId', 'meetingName meetingLength')
      .populate('ownerId', 'name email')
      .lean(),
    Booking.countDocuments(filter)
  ]);

  return successResponse(res, 200, 'Bookings retrieved successfully', {
    data: bookings,
    pagination: buildPagination(total, pageNum, limitNum)
  });
});

// Get bookings for a specific link with pagination
exports.getLinkBookings = asyncHandler(async (req, res) => {
  const { linkId } = req.params;
  const { 
    page = 1, 
    limit = 10,
    status,
    upcoming
  } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Verify link ownership
  const link = await Link.findOne({ _id: linkId, ownerId: req.user.id });
  if (!link) {
    return errorResponse(res, 404, 'Booking link not found or not authorized');
  }

  // Build filter
  const filter = { linkId };
  if (status) filter.status = status;
  if (upcoming === 'true') {
    filter.startTime = { $gte: new Date() };
    filter.status = 'confirmed';
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('userId', 'name email')
      .lean(),
    Booking.countDocuments(filter)
  ]);

  return successResponse(res, 200, 'Link bookings retrieved successfully', {
    data: bookings,
    pagination: buildPagination(total, pageNum, limitNum)
  });
});

// Get booking by ID
exports.getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('linkId', 'meetingName meetingLength')
    .populate('ownerId', 'name email')
    .lean();

  if (!booking) {
    return errorResponse(res, 404, 'Booking not found');
  }

  // Verify ownership (either as client or advisor)
  if (booking.userId.toString() !== req.user.id && booking.ownerId._id.toString() !== req.user.id) {
    return errorResponse(res, 403, 'Not authorized to access this booking');
  }

  return successResponse(res, 200, 'Booking retrieved successfully', booking);
});

// Get available time slots for a booking link
exports.getAvailableSlots = asyncHandler(async (req, res) => {
  const { linkId } = req.params;
  const { startDate, endDate, timezone = 'UTC' } = req.query;

  if (!startDate || !endDate) {
    return errorResponse(res, 400, 'Please provide start and end dates');
  }

  // Find the booking link
  const link = await Link.findOne({ linkId });
  if (!link) {
    return errorResponse(res, 404, 'Booking link not found');
  }

  // Validate dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime())) {
    return errorResponse(res, 400, 'Invalid start date format');
  }
  if (isNaN(end.getTime())) {
    return errorResponse(res, 400, 'Invalid end date format');
  }

  // Get available slots with pagination
  const slots = await availabilityService.getAvailableTimeSlots(
    link.ownerId,
    start,
    end,
    link.meetingLength,
    timezone
  );

  return successResponse(res, 200, 'Available slots retrieved successfully', slots);
});

// Create a booking with approval workflow (with pagination for approvers)
exports.createBooking = asyncHandler(async (req, res) => {
  const {
    linkId,
    clientName,
    clientEmail,
    startTime,
    endTime,
    timezone,
    responses
  } = req.body;

  // Validate email
  if (!validator.isEmail(clientEmail)) {
    return errorResponse(res, 400, 'Please provide a valid client email');
  }

  // Find the booking link
  const bookingLink = await Link.findById(linkId);
  if (!bookingLink) {
    return errorResponse(res, 404, 'Booking link not found');
  }

  // Validate time slot
  const isAvailable = await availabilityService.isTimeSlotAvailable(
    bookingLink.ownerId,
    new Date(startTime),
    new Date(endTime)
  );
  if (!isAvailable) {
    return errorResponse(res, 400, 'The selected time slot is no longer available');
  }

  // Determine approval status
  const approvalStatus = bookingLink.requiresApproval ? 'pending' : 'confirmed';

  // Create the booking
  const booking = await Booking.create({
    linkId,
    ownerId: bookingLink.ownerId,
    userId: req.user.id,
    clientName,
    clientEmail,
    meetingName: bookingLink.meetingName,
    startTime,
    endTime,
    timezone,
    responses,
    approvalStatus,
    status: approvalStatus === 'pending' ? 'pending' : 'confirmed'
  });

  // Calendar integration
  if (bookingLink.calendarIntegration) {
    try {
      const eventData = {
        summary: `${bookingLink.meetingName} with ${clientName}`,
        description: `Booking from ${clientName} (${clientEmail})`,
        start: { dateTime: startTime, timeZone: timezone },
        end: { dateTime: endTime, timeZone: timezone },
        attendees: [{ email: clientEmail }, { email: req.user.email }],
        status: approvalStatus === 'pending' ? 'tentative' : 'confirmed'
      };

      const calendarEvent = await calendarService.createEvent(
        bookingLink.calendarId,
        eventData
      );

      if (approvalStatus === 'pending') {
        booking.tentativeEventId = calendarEvent.id;
      } else {
        booking.googleEventId = calendarEvent.id;
      }
      await booking.save();
    } catch (error) {
      console.error('Calendar integration error:', error);
      // Continue without failing the booking
    }
  }

  // Notifications
  if (approvalStatus === 'pending') {
    try {
      // Get first page of approvers if there are many
      const approvers = await User.find({ _id: { $in: bookingLink.approvers } })
        .limit(10)
        .select('email name');
      
      await notificationService.sendApprovalRequest(booking, approvers);
    } catch (error) {
      console.error('Notification error:', error);
    }
  }

  return successResponse(res, 201, 
    approvalStatus === 'pending' 
      ? 'Booking created pending approval' 
      : 'Booking confirmed successfully',
    booking
  );
});

// Get bookings requiring approval with pagination
exports.getPendingApprovals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const filter = { 
    ownerId: req.user.id,
    approvalStatus: 'pending'
  };

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('linkId', 'meetingName')
      .populate('userId', 'name email')
      .lean(),
    Booking.countDocuments(filter)
  ]);

  return successResponse(res, 200, 'Pending approvals retrieved', {
    data: bookings,
    pagination: buildPagination(total, pageNum, limitNum)
  });
});