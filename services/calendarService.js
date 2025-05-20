// Add these methods to your existing calendarService.js

// Create a calendar event (supports both confirmed and tentative events)
exports.createEvent = async (calendarId, eventData, isTentative = false) => {
  try {
    // If tentative, adjust the event properties
    if (isTentative) {
      eventData.status = 'tentative';
      eventData.transparency = 'transparent'; // Doesn't block time
      eventData.colorId = '5'; // Light yellow for tentative
    } else {
      eventData.status = 'confirmed';
      eventData.transparency = 'opaque'; // Blocks time
      eventData.colorId = '1'; // Blue for confirmed
    }
    
    const response = await axiosWithAuth.post(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
      eventData
    );
    
    return response.data;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
};

// Update a tentative event to confirmed
exports.confirmEvent = async (calendarId, eventId) => {
  try {
    const response = await axiosWithAuth.patch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
      {
        status: 'confirmed',
        transparency: 'opaque', // Now blocks time
        colorId: '1' // Blue for confirmed
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error confirming event:', error);
    throw error;
  }
};

// Delete an event (used when rejecting a booking)
exports.deleteEvent = async (calendarId, eventId) => {
  try {
    const response = await axiosWithAuth.delete(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`
    );
    
    return response.status === 204; // Returns true if successfully deleted
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
};