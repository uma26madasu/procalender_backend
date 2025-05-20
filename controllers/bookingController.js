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