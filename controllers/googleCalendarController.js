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
 * Helper function to get authenticated calendar client
 */
const getCalendarClient = async (userId) => {
  const user = await User.findById(userId);
  if (!user?.googleTokens) {
    throw new Error('Google Calendar not connected');
  }

  // IMPORTANT: Refresh tokens before setting credentials
  // This will check if the token is expired and refresh it if needed,
  // and update the user document in the database.
  const refreshedTokens = await refreshGoogleToken(user); // <--- ADDED/MODIFIED THIS LINE

  oauth2Client.setCredentials(refreshedTokens); // <--- Use the refreshed tokens
  return google.calendar({ version: 'v3', auth: oauth2Client });
};

/**
 * @route GET /api/google-calendar/events
 * @desc Get calendar events for the authenticated user
 */
exports.getEvents = asyncHandler(async (req, res) => {
  const firebaseUid = req.user.uid; // From your auth middleware
  const { startDate, endDate, calendarId = 'primary' } = req.query;

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      throw new Error('User not found.');
    }

    // Ensure tokens are refreshed and client is ready
    const calendar = await getCalendarClient(user._id); // Pass MongoDB _id for user lookup

    const timeMin = startDate ? new Date(startDate).toISOString() : new Date().toISOString();
    const timeMax = endDate ? new Date(endDate).toISOString() : new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(); // Default to 1 year ahead

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true, // Expand recurring events
      orderBy: 'startTime',
      maxResults: 250 // Fetch up to 250 events
    });

    res.json({ success: true, events: response.data.items });
  } catch (error) {
    console.error('Error fetching Google Calendar events:', error.message, error.stack);
    if (error.message.includes('Google Calendar not connected') || error.response?.status === 401 || error.message.includes('Failed to refresh Google token')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar connection expired or invalid. Please reconnect.',
        reconnect: true
      });
    }
    res.status(500).json({ success: false, message: 'Failed to fetch events.' });
  }
});

/**
 * @route GET /api/google-calendar/calendars
 * @desc Get list of calendars for the authenticated user
 */
exports.listCalendars = asyncHandler(async (req, res) => {
  const firebaseUid = req.user.uid;
  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      throw new Error('User not found.');
    }
    const calendar = await getCalendarClient(user._id);

    const response = await calendar.calendarList.list();
    res.json({ success: true, calendars: response.data.items });
  } catch (error) {
    console.error('Error listing Google Calendars:', error.message, error.stack);
    if (error.message.includes('Google Calendar not connected') || error.response?.status === 401 || error.message.includes('Failed to refresh Google token')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar connection expired or invalid. Please reconnect.',
        reconnect: true
      });
    }
    res.status(500).json({ success: false, message: 'Failed to list calendars.' });
  }
});

/**
 * @route POST /api/google-calendar/events
 * @desc Create a new calendar event
 */
exports.createEvent = asyncHandler(async (req, res) => {
  const firebaseUid = req.user.uid;
  const { eventDetails, calendarId = 'primary' } = req.body;

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      throw new Error('User not found.');
    }
    const calendar = await getCalendarClient(user._id);

    const response = await calendar.events.insert({
      calendarId: calendarId,
      resource: eventDetails
    });

    res.status(201).json({ success: true, event: response.data });
  } catch (error) {
    console.error('Error creating Google Calendar event:', error.message, error.stack);
    if (error.message.includes('Google Calendar not connected') || error.response?.status === 401 || error.message.includes('Failed to refresh Google token')) {
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
 * @route PUT /api/google-calendar/events/:eventId
 * @desc Update an existing calendar event
 */
exports.updateEvent = asyncHandler(async (req, res) => {
  const firebaseUid = req.user.uid;
  const { eventId } = req.params;
  const { updates, calendarId = 'primary' } = req.body;

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      throw new Error('User not found.');
    }
    const calendar = await getCalendarClient(user._id);

    const response = await calendar.events.patch({
      calendarId: calendarId,
      eventId: eventId,
      resource: updates
    });

    res.json({ success: true, event: response.data });
  } catch (error) {
    console.error('Error updating Google Calendar event:', error.message, error.stack);
    if (error.message.includes('Google Calendar not connected') || error.response?.status === 401 || error.message.includes('Failed to refresh Google token')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar connection expired or invalid. Please reconnect.',
        reconnect: true
      });
    }
    res.status(500).json({ success: false, message: 'Failed to update event.' });
  }
});

/**
 * @route DELETE /api/google-calendar/events/:eventId
 * @desc Delete a calendar event
 */
exports.deleteEvent = asyncHandler(async (req, res) => {
  const firebaseUid = req.user.uid;
  const { eventId } = req.params;
  const { calendarId = 'primary' } = req.body; // Allow calendarId in body for deletion

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      throw new Error('User not found.');
    }
    const calendar = await getCalendarClient(user._id);

    await calendar.events.delete({
      calendarId: calendarId,
      eventId: eventId
    });

    res.json({ success: true, message: 'Event deleted successfully.' });
  } catch (error) {
    console.error('Error deleting Google Calendar event:', error.message, error.stack);
    if (error.message.includes('Google Calendar not connected') || error.response?.status === 401 || error.message.includes('Failed to refresh Google token')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar connection expired or invalid. Please reconnect.',
        reconnect: true
      });
    }
    res.status(500).json({ success: false, message: 'Failed to delete event.' });
  }
});

/**
 * @route POST /api/google-calendar/register-webhook
 * @desc Register webhook for Google Calendar notifications
 */
exports.registerWebhook = asyncHandler(async (req, res) => {
  const firebaseUid = req.user.uid;
  const { calendarId = 'primary' } = req.body;

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      throw new Error('User not found.');
    }
    const calendar = await getCalendarClient(user._id);

    // Check if a valid webhook already exists for this calendar
    if (user.hasWebhookForCalendar(calendarId)) {
      return res.status(200).json({ success: true, message: 'Webhook already active for this calendar.' });
    }

    const channelId = generateChannelId();
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/google-calendar/webhook`; // Ensure WEBHOOK_BASE_URL is set in your env

    const response = await calendar.events.watch({
      calendarId: calendarId,
      resource: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        expiration: Date.now() + 3.6e6 * 24 * 7 // 7 days from now (Google max is 7 days)
      }
    });

    // Save channel info to user document
    user.calendarWebhooks.push({
      calendarId: calendarId,
      channelId: channelId,
      resourceId: response.data.resourceId,
      expiration: new Date(parseInt(response.data.expiration))
    });
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Webhook registered successfully',
      channelId: channelId,
      expiration: response.data.expiration
    });
  } catch (error) {
    console.error('Error registering webhook:', error.message, error.stack);
    if (error.message.includes('Google Calendar not connected') || error.response?.status === 401 || error.message.includes('Failed to refresh Google token')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar connection expired or invalid. Please reconnect.',
        reconnect: true
      });
    }
    res.status(500).json({ success: false, message: 'Failed to register webhook.' });
  }
});

/**
 * @route POST /api/google-calendar/unregister-webhook
 * @desc Unregister webhook for Google Calendar notifications
 */
exports.unregisterWebhook = asyncHandler(async (req, res) => {
  const firebaseUid = req.user.uid;
  const { calendarId = 'primary' } = req.body;

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      throw new Error('User not found.');
    }
    const calendar = await getCalendarClient(user._id);

    const webhook = user.calendarWebhooks.find(w => w.calendarId === calendarId);

    if (!webhook) {
      return res.status(404).json({ success: false, message: 'No active webhook found for this calendar.' });
    }

    await calendar.channels.stop({
      resource: {
        id: webhook.channelId,
        resourceId: webhook.resourceId
      }
    });

    // Remove webhook from user document
    user.calendarWebhooks = user.calendarWebhooks.filter(w => w.calendarId !== calendarId);
    await user.save();

    res.status(200).json({ success: true, message: 'Webhook unregistered successfully.' });
  } catch (error) {
    console.error('Error unregistering webhook:', error.message, error.stack);
    if (error.message.includes('Google Calendar not connected') || error.response?.status === 401 || error.message.includes('Failed to refresh Google token')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar connection expired or invalid. Please reconnect.',
        reconnect: true
      });
    }
    res.status(500).json({ success: false, message: 'Failed to unregister webhook.' });
  }
});

/**
 * @route POST /api/google-calendar/webhook
 * @desc Handle incoming webhook notifications from Google Calendar
 * This endpoint should be publicly accessible and NOT protected by auth middleware.
 */
exports.handleWebhook = asyncHandler(async (req, res) => {
  const channelId = req.headers['x-goog-channel-id'];
  const resourceId = req.headers['x-goog-resource-id'];
  const state = req.headers['x-goog-resource-state']; // 'sync', 'exists', 'not_exists'

  console.log(`Webhook received: Channel ID: ${channelId}, Resource ID: ${resourceId}, State: ${state}`);

  // It's good practice to verify the webhook request if you stored secrets
  // For now, we'll assume it's valid if we receive it.
  // const verified = verifyWebhook(req); // Implement verifyWebhook in utils if needed

  if (state === 'sync' || state === 'exists') {
    // A change occurred, trigger a refresh for the relevant user
    // Find the user associated with this channelId
    const user = await User.findOne({
      'calendarWebhooks.channelId': channelId,
      'calendarWebhooks.resourceId': resourceId
    });

    if (user) {
      console.log(`Change detected for user: ${user.email}. Triggering event refresh.`);
      // You might want to trigger a frontend refresh or re-fetch events for this user
      // This is often done via WebSockets or by setting a flag in the DB
      // For now, just log and acknowledge.
      // In a real app, you'd likely update data in your DB or push a notification.
    } else {
      console.warn(`Webhook received for unknown channel/resource: ${channelId}/${resourceId}`);
    }
  }

  // Always return 200 OK to Google to acknowledge receipt
  res.status(200).send('OK');
});

/**
 * @route POST /api/google-calendar/check-conflicts
 * @desc Check for conflicts in the user's primary calendar for a given time range.
 */
exports.checkConflicts = asyncHandler(async (req, res) => {
  const firebaseUid = req.user.uid;
  const { startTime, endTime, calendarId = 'primary' } = req.body;

  if (!startTime || !endTime) {
    return res.status(400).json({ success: false, message: 'startTime and endTime are required.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      throw new Error('User not found.');
    }
    const calendar = await getCalendarClient(user._id);

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: new Date(startTime).toISOString(),
      timeMax: new Date(endTime).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      // only fetch busy status (free/busy query would be better for complex conflict checks)
      // but this is simpler for checking against existing events.
      fields: 'items(id,summary,start,end,status)'
    });

    const conflicts = response.data.items.filter(event =>
      event.status !== 'cancelled' && event.status !== 'declined' // Consider only events that are not cancelled or declined
    );

    res.json({
      success: true,
      hasConflicts: conflicts.length > 0,
      conflicts: conflicts
    });
  } catch (error) {
    console.error('Error checking conflicts:', error.message, error.stack);
    if (error.message.includes('Google Calendar not connected') || error.response?.status === 401 || error.message.includes('Failed to refresh Google token')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar connection expired or invalid. Please reconnect.',
        reconnect: true
      });
    }
    res.status(500).json({ success: false, message: 'Failed to check conflicts.' });
  }
});


// Helper function to update booking conflict status (if you use a Booking model)
// This function would typically be called from your booking creation/update logic
async function updateBookingConflictStatus(bookingId, startTime, endTime, userId) {
  const booking = await Booking.findById(bookingId);
  if (!booking) return;

  try {
    const calendar = await getCalendarClient(userId); // Use user's ID
    const response = await calendar.events.list({
      calendarId: 'primary', // Or the relevant calendar for bookings
      timeMin: new Date(startTime).toISOString(),
      timeMax: new Date(endTime).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      fields: 'items(id,summary,start,end,status)'
    });

    const conflicts = response.data.items.filter(event =>
      event.status !== 'cancelled' && event.status !== 'declined'
    );

    if (conflicts.length > 0) {
      await Booking.findByIdAndUpdate(booking._id, {
        hasCalendarConflict: true,
        conflictDetails: conflicts.map(event => ({
          eventId: event.id,
          summary: event.summary,
          start: event.start.dateTime || event.start.date,
          end: event.end.dateTime || event.end.date
        }))
      });
    } else if (booking.hasCalendarConflict) {
      // If there were conflicts before but no longer are
      await Booking.findByIdAndUpdate(booking._id, {
        $unset: { hasCalendarConflict: "", conflictDetails: "" }
      });
    }
  } catch (error) {
    console.error(`Error updating booking conflict status for booking ${bookingId}:`, error.message);
    // You might want to log this error or handle it more robustly
  }
}

// Helper function to calculate free slots between conflicts
function calculateFreeSlots(startTime, endTime, conflicts) {
  const slots = [];
  let currentStart = new Date(startTime);
  const end = new Date(endTime);

  // Sort conflicts by start time
  const sortedConflicts = [...conflicts].sort((a, b) =>
    new Date(a.start) - new Date(b.start)
  );

  for (const conflict of sortedConflicts) {
    const conflictStart = new Date(conflict.start);
    const conflictEnd = new Date(conflict.end);

    if (conflictStart > currentStart) {
      slots.push({
        start: currentStart.toISOString(),
        end: conflictStart.toISOString()
      });
    }

    currentStart = new Date(Math.max(currentStart, conflictEnd));
  }

  if (currentStart < end) {
    slots.push({
      start: currentStart.toISOString(),
      end: end.toISOString()
    });
  }

  return slots;
}

// You can add more controller functions here as needed (e.g., get availability)