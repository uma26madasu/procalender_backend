// controllers/googleCalendarController.js
const { User, Booking } = require('../models');
const calendarService = require('../services/calendarService');
const { google } = require('googleapis');

// Configure Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Get list of user's Google Calendars
 * @route GET /api/google-calendar/calendars
 */
exports.listCalendars = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user with Google tokens
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }
    
    // Set credentials
    oauth2Client.setCredentials(user.googleTokens);
    
    // Initialize calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Get list of calendars
    const response = await calendar.calendarList.list();
    
    res.status(200).json({
      success: true,
      data: response.data.items
    });
  } catch (error) {
    // Handle token expiration
    if (error.response && error.response.status === 401) {
      try {
        // Try to refresh token
        const user = await User.findById(req.user.id);
        if (user && user.googleTokens && user.googleTokens.refresh_token) {
          oauth2Client.setCredentials({
            refresh_token: user.googleTokens.refresh_token
          });
          
          const { credentials } = await oauth2Client.refreshAccessToken();
          
          // Update user's tokens
          user.googleTokens = credentials;
          await user.save();
          
          // Retry the operation
          return this.listCalendars(req, res);
        }
      } catch (refreshError) {
        console.error('Error refreshing token:', refreshError);
      }
    }
    
    console.error('Error listing calendars:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list calendars',
      error: error.message
    });
  }
};

/**
 * Get calendar events for a specific time range
 * @route GET /api/google-calendar/events
 */
exports.getEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const { calendarId = 'primary', timeMin, timeMax } = req.query;
    
    // Get user with Google tokens
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }
    
    // Set credentials
    oauth2Client.setCredentials(user.googleTokens);
    
    // Initialize calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Get events
    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    res.status(200).json({
      success: true,
      data: response.data.items
    });
  } catch (error) {
    console.error('Error getting events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get calendar events',
      error: error.message
    });
  }
};

/**
 * Check for conflicts with existing calendar events
 * @route POST /api/google-calendar/check-conflicts
 */
exports.checkConflicts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startTime, endTime, calendarIds } = req.body;
    
    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Start time and end time are required'
      });
    }
    
    // Get user with Google tokens
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }
    
    // Set credentials
    oauth2Client.setCredentials(user.googleTokens);
    
    // Call freeBusy API to check for conflicts
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // If calendarIds not provided, get primary calendar
    const calendarsToCheck = calendarIds || ['primary'];
    
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime,
        timeMax: endTime,
        items: calendarsToCheck.map(id => ({ id }))
      }
    });
    
    // Check for busy times
    const calendarsResponse = response.data.calendars;
    const conflicts = [];
    
    Object.keys(calendarsResponse).forEach(calId => {
      const busyPeriods = calendarsResponse[calId].busy || [];
      busyPeriods.forEach(period => {
        conflicts.push({
          calendarId: calId,
          start: period.start,
          end: period.end
        });
      });
    });
    
    res.status(200).json({
      success: true,
      hasConflicts: conflicts.length > 0,
      conflicts
    });
  } catch (error) {
    console.error('Error checking conflicts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check calendar conflicts',
      error: error.message
    });
  }
};

/**
 * Create a calendar event
 * @route POST /api/google-calendar/events
 */
exports.createEvent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { calendarId = 'primary', event, bookingId } = req.body;
    
    if (!event) {
      return res.status(400).json({
        success: false,
        message: 'Event details are required'
      });
    }
    
    // Get user with Google tokens
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }
    
    // Set credentials
    oauth2Client.setCredentials(user.googleTokens);
    
    // Initialize calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Create event
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event
    });
    
    // If bookingId is provided, update the booking with the event ID
    if (bookingId) {
      await Booking.findByIdAndUpdate(bookingId, {
        googleEventId: response.data.id
      });
    }
    
    res.status(201).json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create calendar event',
      error: error.message
    });
  }
};

/**
 * Update a calendar event
 * @route PUT /api/google-calendar/events/:eventId
 */
exports.updateEvent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;
    const { calendarId = 'primary', event } = req.body;
    
    if (!event) {
      return res.status(400).json({
        success: false,
        message: 'Event details are required'
      });
    }
    
    // Get user with Google tokens
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }
    
    // Set credentials
    oauth2Client.setCredentials(user.googleTokens);
    
    // Initialize calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Update event
    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: event
    });
    
    res.status(200).json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update calendar event',
      error: error.message
    });
  }
};

/**
 * Delete a calendar event
 * @route DELETE /api/google-calendar/events/:eventId
 */
exports.deleteEvent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;
    const { calendarId = 'primary' } = req.query;
    
    // Get user with Google tokens
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }
    
    // Set credentials
    oauth2Client.setCredentials(user.googleTokens);
    
    // Initialize calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Delete event
    await calendar.events.delete({
      calendarId,
      eventId
    });
    
    res.status(200).json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete calendar event',
      error: error.message
    });
  }
};

/**
 * Register webhook for calendar updates
 * @route POST /api/google-calendar/register-webhook
 */
exports.registerWebhook = async (req, res) => {
  try {
    const userId = req.user.id;
    const { calendarId = 'primary' } = req.body;
    
    // Get user with Google tokens
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }
    
    // Set credentials
    oauth2Client.setCredentials(user.googleTokens);
    
    // Initialize calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Create a unique channel ID
    const channelId = `calendar-${userId}-${Date.now()}`;
    
    // Register webhook
    const response = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: `${process.env.API_URL}/api/google-calendar/webhook`,
        token: process.env.WEBHOOK_SECRET || 'your-webhook-secret'
      }
    });
    
    // Store webhook information in user record
    user.calendarWebhooks = user.calendarWebhooks || [];
    user.calendarWebhooks.push({
      channelId,
      resourceId: response.data.resourceId,
      calendarId,
      expiration: response.data.expiration
    });
    
    await user.save();
    
    res.status(200).json({
      success: true,
      data: {
        channelId,
        expiration: response.data.expiration
      }
    });
  } catch (error) {
    console.error('Error registering webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register calendar webhook',
      error: error.message
    });
  }
};

/**
 * Unregister webhook
 * @route POST /api/google-calendar/unregister-webhook
 */
exports.unregisterWebhook = async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId, resourceId } = req.body;
    
    if (!channelId || !resourceId) {
      return res.status(400).json({
        success: false,
        message: 'Channel ID and Resource ID are required'
      });
    }
    
    // Get user with Google tokens
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }
    
    // Set credentials
    oauth2Client.setCredentials(user.googleTokens);
    
    // Initialize calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Stop the webhook
    await calendar.channels.stop({
      requestBody: {
        id: channelId,
        resourceId
      }
    });
    
    // Remove webhook from user record
    if (user.calendarWebhooks) {
      user.calendarWebhooks = user.calendarWebhooks.filter(
        webhook => webhook.channelId !== channelId
      );
      await user.save();
    }
    
    res.status(200).json({
      success: true,
      message: 'Webhook unregistered successfully'
    });
  } catch (error) {
    console.error('Error unregistering webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unregister webhook',
      error: error.message
    });
  }
};

/**
 * Handle webhook notifications
 * @route POST /api/google-calendar/webhook
 * Note: This route does not require authentication as it's called by Google
 */
exports.handleWebhook = async (req, res) => {
  try {
    // Quickly acknowledge receipt to Google (required)
    res.status(200).end();
    
    // Verify webhook token
    const token = req.headers['x-goog-channel-token'];
    if (token !== (process.env.WEBHOOK_SECRET || 'your-webhook-secret')) {
      console.error('Invalid webhook token');
      return;
    }
    
    // Get channel ID and state
    const channelId = req.headers['x-goog-channel-id'];
    const resourceState = req.headers['x-goog-resource-state'];
    
    // Find the user associated with this webhook
    const user = await User.findOne({
      'calendarWebhooks.channelId': channelId
    });
    
    if (!user) {
      console.error('No user found for channel ID:', channelId);
      return;
    }
    
    // Find the webhook details
    const webhook = user.calendarWebhooks.find(wh => wh.channelId === channelId);
    
    if (!webhook) {
      console.error('Webhook details not found for channel ID:', channelId);
      return;
    }
    
    // Handle different notification types
    if (resourceState === 'sync') {
      // This is the initial sync message
      console.log('Webhook synchronized for channel:', channelId);
    } else if (resourceState === 'exists') {
      // Calendar was updated, process the updates
      await processCalendarUpdate(user, webhook.calendarId);
    } else if (resourceState === 'not_exists') {
      console.log('Resource no longer exists for channel:', channelId);
      
      // Remove this webhook from the user
      user.calendarWebhooks = user.calendarWebhooks.filter(
        wh => wh.channelId !== channelId
      );
      await user.save();
    }
  } catch (error) {
    console.error('Error handling webhook notification:', error);
  }
};

/**
 * Process calendar updates from webhook
 * @private
 */
async function processCalendarUpdate(user, calendarId) {
  try {
    // Set credentials
    oauth2Client.setCredentials(user.googleTokens);
    
    // Initialize calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Get events that changed recently
    const response = await calendar.events.list({
      calendarId,
      updatedMin: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // Last 5 minutes
      singleEvents: true
    });
    
    const events = response.data.items;
    
    // Get all future bookings for this user
    const bookings = await Booking.find({
      ownerId: user._id,
      startTime: { $gt: new Date() }
    });
    
    // Check for conflicts
    for (const booking of bookings) {
      // Skip bookings that don't have a time range yet
      if (!booking.startTime || !booking.endTime) continue;
      
      const bookingStart = new Date(booking.startTime);
      const bookingEnd = new Date(booking.endTime);
      
      // Find conflicting events
      const conflicts = events.filter(event => {
        // Skip events that don't have a date/time
        if (!event.start || !event.end) return false;
        
        const eventStart = new Date(event.start.dateTime || `${event.start.date}T00:00:00`);
        const eventEnd = new Date(event.end.dateTime || `${event.end.date}T23:59:59`);
        
        // Check for overlap
        return (
          (eventStart <= bookingStart && eventEnd > bookingStart) ||
          (eventStart < bookingEnd && eventEnd >= bookingEnd) ||
          (eventStart >= bookingStart && eventEnd <= bookingEnd)
        );
      });
      
      if (conflicts.length > 0) {
        // Mark booking as having conflicts
        booking.hasCalendarConflict = true;
        booking.conflictDetails = conflicts.map(event => ({
          eventId: event.id,
          summary: event.summary,
          start: event.start.dateTime || event.start.date,
          end: event.end.dateTime || event.end.date
        }));
        
        await booking.save();
        
        // TODO: Send notification about conflict
        // This could be implemented with your notification service
      }
    }
  } catch (error) {
    console.error('Error processing calendar update:', error);
  }
}