const availabilityService = require('../services/availabilityService');
const Link = require('../models/Link');
const User = require('../models/User');
const BookingLink = require('../models/BookingLink');
const Booking = require('../models/Booking');
const calendarService = require('../services/calendarService');
const notificationService = require('../services/notificationService');

// Get available time slots for a booking link
exports.getAvailableSlots = async (req, res) => {
  try {
    const { linkId } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Please provide start and end dates'
      });
    }
    
    // Find the booking link
    const link = await Link.findOne({ linkId });
    
    if (!link) {
      return res.status(404).json({
        success: false,
        error: 'Booking link not found'
      });
    }
    
    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }
    
    // Get available slots
    const availableSlots = await availabilityService.getAvailableTimeSlots(
      link.ownerId,
      start,
      end,
      link.meetingLength
    );
    
    res.status(200).json({
      success: true,
      count: availableSlots.length,
      data: availableSlots
    });
  } catch (error) {
    console.error('Error getting available slots:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
};

// Add a method to create bookings with approval workflow
exports.createBooking = async (req, res) => {
  try {
    const {
      linkId,
      clientName,
      clientEmail,
      startTime,
      endTime,
      responses   // Answers to booking questions
    } = req.body;
    
    // Find the booking link to check if approval is required
    const bookingLink = await BookingLink.findById(linkId);
    
    if (!bookingLink) {
      return res.status(404).json({
        success: false,
        error: 'Booking link not found'
      });
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
      // Send notification to all approvers
      await notificationService.sendApprovalRequest(booking, bookingLink.approvers);
    }
    
    res.status(201).json({
      success: true,
      data: booking,
      requiresApproval: approvalStatus === 'pending'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
};