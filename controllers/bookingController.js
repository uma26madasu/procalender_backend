const { asyncHandler, successResponse, errorResponse } = require('../utils/errorHandler');
const availabilityService = require('../services/availabilityService');
const { Link, User, Booking } = require('../models');
//const BookingLink = Link; // If BookingLink is actually the same model as Link
const calendarService = require('../services/calendarService');
const notificationService = require('../services/notificationService');

// Get available time slots for a booking link
exports.getAvailableSlots = asyncHandler(async (req, res) => {
  const { linkId } = req.params;
  const { startDate, endDate } = req.query;
  
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
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return errorResponse(res, 400, 'Invalid date format');
  }
  
  // Get available slots
  const availableSlots = await availabilityService.getAvailableTimeSlots(
    link.ownerId,
    start,
    end,
    link.meetingLength
  );
  
  return successResponse(res, 200, 'Available slots retrieved successfully', availableSlots);
});

// Create a booking with approval workflow
exports.createBooking = asyncHandler(async (req, res) => {
  const {
    linkId,
    clientName,
    clientEmail,
    startTime,
    endTime,
    responses
  } = req.body;
  
  // Find the booking link to check if approval is required
  const bookingLink = await Link.findById(linkId);
  
  if (!bookingLink) {
    return errorResponse(res, 404, 'Booking link not found');
  }
  
  // Determine if approval is required
  const approvalStatus = bookingLink.requiresApproval ? 'pending' : 'confirmed';
  
  // Create the booking
  const booking = await Booking.create({
    linkId,
    clientName,
    clientEmail,
    startTime,
    endTime,
    responses,
    approvalStatus,
    createdAt: new Date()
  });
  
  // If calendar integration is enabled, create a tentative event
  if (bookingLink.calendarIntegration) {
    // Format event data for calendar API
    const eventData = {
      summary: `${bookingLink.name} with ${clientName}`,
      description: `Booking from ${clientName} (${clientEmail})`,
      start: {
        dateTime: startTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: endTime,
        timeZone: 'UTC'
      },
      attendees: [
        { email: clientEmail },
        { email: bookingLink.ownerEmail }
      ],
      // If approval is needed, mark as tentative
      status: approvalStatus === 'pending' ? 'tentative' : 'confirmed'
    };
    
    // Create event in calendar
    const calendarEvent = await calendarService.createEvent(
      bookingLink.calendarId,
      eventData,
      approvalStatus === 'pending' // Flag for tentative events
    );
    
    // Save event ID for later approval/rejection
    booking.tentativeEventId = calendarEvent.id;
    await booking.save();
  }
  
  // If approval is required, send notifications to approvers
  if (approvalStatus === 'pending') {
    await notificationService.sendApprovalRequest(booking, bookingLink.approvers);
  }
  
  return successResponse(res, 201, 'Booking created successfully', booking, {
    requiresApproval: approvalStatus === 'pending'
  });
});