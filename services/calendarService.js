// services/calendarService.js
const axios = require('axios');
const { google } = require('googleapis');
const User = require('../models/User');
const { refreshGoogleToken } = require('../utils/tokenManager');

// Create an axios instance with auth token handling
const createAxiosWithAuth = (accessToken) => {
  return axios.create({
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
};

/**
 * Create a calendar event (supports both confirmed and tentative events)
 * @param {String} calendarId - Calendar ID (typically 'primary')
 * @param {Object} eventData - Calendar event details
 * @param {Boolean} isTentative - Whether this is a tentative event
 */
exports.createEvent = async (userId, calendarId, eventData, isTentative = false) => {
  try {
    // Get user with Google tokens
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
      throw new Error('Google Calendar not connected');
    }
    
    // Check if token needs refresh
    const tokens = await refreshGoogleToken(user);
    
    // Create authorized axios instance
    const axiosWithAuth = createAxiosWithAuth(tokens.access_token);
    
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

/**
 * Update a tentative event to confirmed
 * @param {String} userId - User ID
 * @param {String} calendarId - Calendar ID
 * @param {String} eventId - Event ID to confirm
 */
exports.confirmEvent = async (userId, calendarId, eventId) => {
  try {
    // Get user with Google tokens
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
      throw new Error('Google Calendar not connected');
    }
    
    // Check if token needs refresh
    const tokens = await refreshGoogleToken(user);
    
    // Create authorized axios instance
    const axiosWithAuth = createAxiosWithAuth(tokens.access_token);
    
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

/**
 * Delete an event (used when rejecting a booking)
 * @param {String} userId - User ID
 * @param {String} calendarId - Calendar ID
 * @param {String} eventId - Event ID to delete
 */
exports.deleteEvent = async (userId, calendarId, eventId) => {
  try {
    // Get user with Google tokens
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
      throw new Error('Google Calendar not connected');
    }
    
    // Check if token needs refresh
    const tokens = await refreshGoogleToken(user);
    
    // Create authorized axios instance
    const axiosWithAuth = createAxiosWithAuth(tokens.access_token);
    
    const response = await axiosWithAuth.delete(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`
    );
    
    return response.status === 204; // Returns true if successfully deleted
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
};