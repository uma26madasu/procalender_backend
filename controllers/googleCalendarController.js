// src/controllers/googleCalendarController.js
const { google } = require('googleapis');
const { User, Booking } = require('../models'); // Assuming you have Booking model as well
const asyncHandler = require('../middleware/asyncHandler');
const crypto = require('crypto');
const { verifyWebhook } = require('../utils/webhookVerifier'); // Keep if you use webhooks
const calendarService = require('../services/calendarService'); // Your existing service
const { refreshGoogleToken } = require('../utils/tokenManager'); // <--- Import your token manager
const axios = require('axios'); // <--- Import axios for direct API calls

// Configure Google OAuth client (ensure consistency across files)
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate a unique channel ID for webhooks (if you implement them)
const generateChannelId = () => crypto.randomBytes(16).toString('hex');

/**
 * Helper function to create an authenticated axios instance
 * This mirrors the createAxiosWithAuth in your calendarService.js
 */
const createAxiosWithAuth = (accessToken) => {
  return axios.create({
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
};

/**
 * @route GET /api/google-calendar/events
 * @desc Get calendar events for the authenticated user
 */
exports.getCalendarEvents = asyncHandler(async (req, res) => {
  const firebaseUid = req.user ? req.user.uid : null; // Get Firebase UID from auth middleware
  const { startDate, endDate, maxResults = 100 } = req.query; // Query parameters for date range and limit

  if (!firebaseUid) {
    return res.status(401).json({ message: 'Authentication required to fetch events.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user || !user.googleTokens) {
      throw new Error('Google Calendar not connected for this user.');
    }

    // Refresh token if necessary (uses your tokenManager). This also saves updated tokens to DB.
    const refreshedTokens = await refreshGoogleToken(user);
    const axiosWithAuth = createAxiosWithAuth(refreshedTokens.accessToken);

    // Set default date range for fetching events if not provided
    const timeMin = startDate ? new Date(startDate).toISOString() : new Date().toISOString();
    const timeMax = endDate ? new Date(endDate).toISOString() : new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(); // Default to 1 year ahead

    // Make direct API call to Google Calendar using axios
    const response = await axiosWithAuth.get(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`, // Using 'primary' calendarId
      {
        params: {
          timeMin: timeMin,
          timeMax: timeMax,
          maxResults: parseInt(maxResults),
          singleEvents: true, // Expand recurring events into individual instances
          orderBy: 'startTime', // Order by start time
        }
      }
    );

    const events = response.data.items || [];
    res.json({ success: true, events });
  } catch (error) {
    console.error('Error fetching calendar events:', error.message, error.stack);
    // If unauthorized/expired, prompt user to reconnect
    if (error.message.includes('re-authenticate') || error.message.includes('not connected') || error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar connection expired or invalid. Please reconnect.',
        reconnect: true // Custom flag for frontend to handle reconnection
      });
    }
    res.status(500).json({ success: false, message: 'Failed to fetch calendar events.' });
  }
});

/**
 * @route POST /api/google-calendar/create-event
 * @desc Create a calendar event (uses calendarService.createEvent)
 */
exports.createEvent = asyncHandler(async (req, res) => {
  const firebaseUid = req.user ? req.user.uid : null;
  const eventData = req.body;
  // calendarId and isTentative can be passed in req.body or defaulted here
  const { isTentative = false, calendarId = 'primary' } = req.body;

  if (!firebaseUid) {
    return res.status(401).json({ message: 'Authentication required to create event.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      throw new Error('User not found.');
    }

    // Call your existing calendarService function, passing user's MongoDB _id
    const createdEvent = await calendarService.createEvent(user._id, calendarId, eventData, isTentative);
    res.status(201).json({ success: true, event: createdEvent });
  } catch (error) {
    console.error('Error in createEvent controller:', error.message, error.stack);
    if (error.message.includes('re-authenticate') || error.message.includes('not connected') || error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar connection expired or invalid. Please reconnect.',
        reconnect: true
      });
    }
    res.status(500).json({ success: false, message: 'Failed to create event.' });
  }
});

/**
 * @route PATCH /api/google-calendar/events/:eventId/confirm
 * @desc Update a tentative event to confirmed (uses calendarService.confirmEvent)
 */
exports.confirmEvent = asyncHandler(async (req, res) => {
  const firebaseUid = req.user ? req.user.uid : null;
  const { eventId } = req.params;
  const { calendarId = 'primary' } = req.body; // Calendar ID for the event

  if (!firebaseUid) {
    return res.status(401).json({ message: 'Authentication required to confirm event.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      throw new Error('User not found.');
    }

    // Call your existing calendarService function, passing user's MongoDB _id
    const confirmedEvent = await calendarService.confirmEvent(user._id, calendarId, eventId);
    res.json({ success: true, event: confirmedEvent });
  } catch (error) {
    console.error('Error in confirmEvent controller:', error.message, error.stack);
    if (error.message.includes('re-authenticate') || error.message.includes('not connected') || error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar connection expired or invalid. Please reconnect.',
        reconnect: true
      });
    }
    res.status(500).json({ success: false, message: 'Failed to confirm event.' });
  }
});

/**
 * @route DELETE /api/google-calendar/events/:eventId
 * @desc Delete an event (uses calendarService.deleteEvent)
 */
exports.deleteEvent = asyncHandler(async (req, res) => {
  const firebaseUid = req.user ? req.user.uid : null;
  const { eventId } = req.params;
  const { calendarId = 'primary' } = req.body; // Calendar ID for the event

  if (!firebaseUid) {
    return res.status(401).json({ message: 'Authentication required to delete event.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      throw new Error('User not found.');
    }

    // Call your existing calendarService function, passing user's MongoDB _id
    const success = await calendarService.deleteEvent(user._id, calendarId, eventId);
    res.json({ success: true, message: 'Event deleted successfully.' });
  } catch (error) {
    console.error('Error in deleteEvent controller:', error.message, error.stack);
    if (error.message.includes('re-authenticate') || error.message.includes('not connected') || error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar connection expired or invalid. Please reconnect.',
        reconnect: true
      });
    }
    res.status(500).json({ success: false, message: 'Failed to delete event.' });
  }
});

// You can keep your existing webhook-related functions here if you use them:
// exports.registerWebhook = asyncHandler(async (req, res) => { /* ... */ });
// exports.handleWebhook = asyncHandler(async (req, res) => { /* ... */ });
// exports.checkConflicts = asyncHandler(async (req, res) => { /* ... */ });
// exports.getCalendarClient = async (userId) => { /* ... */ } // If you still use googleapis for other operations
// function updateBookingConflictStatus(bookingId, conflicts) { /* ... */ }
// function calculateFreeSlots(startTime, endTime, conflicts) { /* ... */ }