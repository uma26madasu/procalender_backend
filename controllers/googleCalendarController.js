// controllers/googleCalendarController.js - FIXED VERSION
const { google } = require('googleapis');
const User = require('../models/User');

// Configure Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Helper function to get authenticated calendar client
 */
const getCalendarClient = async (tokens) => {
  try {
    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate
    });
    
    return google.calendar({ version: 'v3', auth: oauth2Client });
  } catch (error) {
    console.error('Error creating calendar client:', error);
    throw new Error('Failed to create Google Calendar client');
  }
};

/**
 * @route GET /api/calendar/events
 * @desc Get calendar events for the authenticated user
 */
exports.getEvents = async (req, res) => {
  try {
    console.log('🔄 Fetching calendar events...');
    
    // Check if user has valid tokens
    if (!req.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected. Please authenticate first.',
        needsAuth: true
      });
    }

    const { startDate, endDate, calendarId = 'primary' } = req.query;

    // Get calendar client
    const calendar = await getCalendarClient(req.googleTokens);

    // Set date range (default to next 30 days)
    const timeMin = startDate ? new Date(startDate).toISOString() : new Date().toISOString();
    const timeMax = endDate ? new Date(endDate).toISOString() : 
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    console.log(`📅 Fetching events from ${timeMin} to ${timeMax}`);

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250
    });

    console.log(`✅ Retrieved ${response.data.items.length} events`);

    res.json({ 
      success: true, 
      events: response.data.items,
      count: response.data.items.length,
      dateRange: { timeMin, timeMax }
    });

  } catch (error) {
    console.error('❌ Error fetching Google Calendar events:', error);
    
    if (error.code === 401 || error.message.includes('invalid_grant')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar authentication expired. Please reconnect.',
        needsAuth: true
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch calendar events.',
      error: error.message
    });
  }
};

/**
 * @route GET /api/calendar/calendars
 * @desc Get list of calendars for the authenticated user
 */
exports.listCalendars = async (req, res) => {
  try {
    console.log('🔄 Fetching calendar list...');
    
    if (!req.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected. Please authenticate first.',
        needsAuth: true
      });
    }

    const calendar = await getCalendarClient(req.googleTokens);
    const response = await calendar.calendarList.list();

    console.log(`✅ Retrieved ${response.data.items.length} calendars`);

    res.json({ 
      success: true, 
      calendars: response.data.items,
      count: response.data.items.length
    });

  } catch (error) {
    console.error('❌ Error listing calendars:', error);
    
    if (error.code === 401 || error.message.includes('invalid_grant')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar authentication expired. Please reconnect.',
        needsAuth: true
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to list calendars.',
      error: error.message
    });
  }
};

/**
 * @route POST /api/calendar/events
 * @desc Create a new calendar event
 */
exports.createEvent = async (req, res) => {
  try {
    console.log('🔄 Creating calendar event...');
    
    if (!req.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected. Please authenticate first.',
        needsAuth: true
      });
    }

    const { eventDetails, calendarId = 'primary' } = req.body;

    if (!eventDetails) {
      return res.status(400).json({
        success: false,
        message: 'Event details are required'
      });
    }

    const calendar = await getCalendarClient(req.googleTokens);
    const response = await calendar.events.insert({
      calendarId: calendarId,
      resource: eventDetails
    });

    console.log('✅ Event created successfully:', response.data.id);

    res.status(201).json({ 
      success: true, 
      event: response.data,
      message: 'Event created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating calendar event:', error);
    
    if (error.code === 401 || error.message.includes('invalid_grant')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar authentication expired. Please reconnect.',
        needsAuth: true
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create event.',
      error: error.message
    });
  }
};

/**
 * @route POST /api/calendar/check-conflicts
 * @desc Check for conflicts in the user's calendar for a given time range
 */
exports.checkConflicts = async (req, res) => {
  try {
    console.log('🔄 Checking calendar conflicts...');
    
    if (!req.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected. Please authenticate first.',
        needsAuth: true
      });
    }

    const { startTime, endTime, calendarId = 'primary' } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({ 
        success: false, 
        message: 'startTime and endTime are required.' 
      });
    }

    const calendar = await getCalendarClient(req.googleTokens);

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: new Date(startTime).toISOString(),
      timeMax: new Date(endTime).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      fields: 'items(id,summary,start,end,status)'
    });

    const conflicts = response.data.items.filter(event =>
      event.status !== 'cancelled' && event.status !== 'declined'
    );

    console.log(`✅ Found ${conflicts.length} potential conflicts`);

    res.json({
      success: true,
      hasConflicts: conflicts.length > 0,
      conflicts: conflicts,
      conflictCount: conflicts.length
    });

  } catch (error) {
    console.error('❌ Error checking conflicts:', error);
    
    if (error.code === 401 || error.message.includes('invalid_grant')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar authentication expired. Please reconnect.',
        needsAuth: true
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check conflicts.',
      error: error.message
    });
  }
};

/**
 * @route PUT /api/calendar/events/:eventId
 * @desc Update an existing calendar event
 */
exports.updateEvent = async (req, res) => {
  try {
    if (!req.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected. Please authenticate first.',
        needsAuth: true
      });
    }

    const { eventId } = req.params;
    const { updates, calendarId = 'primary' } = req.body;

    const calendar = await getCalendarClient(req.googleTokens);
    const response = await calendar.events.patch({
      calendarId: calendarId,
      eventId: eventId,
      resource: updates
    });

    res.json({ 
      success: true, 
      event: response.data,
      message: 'Event updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating calendar event:', error);
    
    if (error.code === 401 || error.message.includes('invalid_grant')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar authentication expired. Please reconnect.',
        needsAuth: true
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update event.',
      error: error.message
    });
  }
};

/**
 * @route DELETE /api/calendar/events/:eventId
 * @desc Delete a calendar event
 */
exports.deleteEvent = async (req, res) => {
  try {
    if (!req.googleTokens) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar not connected. Please authenticate first.',
        needsAuth: true
      });
    }

    const { eventId } = req.params;
    const { calendarId = 'primary' } = req.body;

    const calendar = await getCalendarClient(req.googleTokens);
    await calendar.events.delete({
      calendarId: calendarId,
      eventId: eventId
    });

    res.json({ 
      success: true, 
      message: 'Event deleted successfully.' 
    });

  } catch (error) {
    console.error('❌ Error deleting calendar event:', error);
    
    if (error.code === 401 || error.message.includes('invalid_grant')) {
      return res.status(401).json({
        success: false,
        message: 'Google Calendar authentication expired. Please reconnect.',
        needsAuth: true
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete event.',
      error: error.message
    });
  }
};

// Basic webhook handler (placeholder)
exports.handleWebhook = async (req, res) => {
  console.log('📧 Webhook received from Google Calendar');
  res.status(200).send('OK');
};