const { google } = require('googleapis');
const { User, Booking } = require('../models');
const asyncHandler = require('../middleware/asyncHandler');

// Configure Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Helper function to get authenticated calendar client
 * @param {string} userId - User ID
 * @returns {Promise<google.calendar_v3.Calendar>} Authenticated calendar client
 */
const getCalendarClient = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.googleTokens) {
    throw new Error('Google Calendar not connected');
  }

  oauth2Client.setCredentials(user.googleTokens);
  return google.calendar({ version: 'v3', auth: oauth2Client });
};

/**
 * @route GET /api/google-calendar/calendars
 * @desc Get list of user's Google Calendars
 */
exports.listCalendars = asyncHandler(async (req, res) => {
  const calendar = await getCalendarClient(req.user.id);
  const response = await calendar.calendarList.list();
  
  res.status(200).json({
    success: true,
    data: response.data.items
  });
});

/**
 * @route GET /api/google-calendar/events
 * @desc Get calendar events with pagination
 */
exports.getEvents = asyncHandler(async (req, res) => {
  const { calendarId = 'primary', startDate, endDate, limit = 10, pageToken } = req.query;
  const calendar = await getCalendarClient(req.user.id);

  const params = {
    calendarId,
    timeMin: startDate || new Date().toISOString(),
    timeMax: endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: parseInt(limit, 10)
  };

  if (pageToken) params.pageToken = pageToken;

  const response = await calendar.events.list(params);

  res.status(200).json({
    success: true,
    data: response.data.items,
    pagination: {
      nextPageToken: response.data.nextPageToken,
      hasMore: !!response.data.nextPageToken
    }
  });
});

/**
 * @route POST /api/google-calendar/check-conflicts
 * @desc Check for scheduling conflicts
 */
exports.checkConflicts = asyncHandler(async (req, res) => {
  const { startTime, endTime, calendarIds = ['primary'] } = req.body;
  const calendar = await getCalendarClient(req.user.id);

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: startTime,
      timeMax: endTime,
      items: calendarIds.map(id => ({ id }))
    }
  });

  const conflicts = Object.entries(response.data.calendars)
    .flatMap(([calId, { busy }]) => 
      (busy || []).map(period => ({
        calendarId: calId,
        start: period.start,
        end: period.end
      }))
    );

  res.status(200).json({
    success: true,
    hasConflicts: conflicts.length > 0,
    conflicts
  });
});

/**
 * @route POST /api/google-calendar/events
 * @desc Create a calendar event
 */
exports.createEvent = asyncHandler(async (req, res) => {
  const { calendarId = 'primary', event, bookingId } = req.body;
  const calendar = await getCalendarClient(req.user.id);

  const response = await calendar.events.insert({
    calendarId,
    requestBody: event
  });

  if (bookingId) {
    await Booking.findByIdAndUpdate(bookingId, {
      googleEventId: response.data.id,
      status: 'confirmed'
    });
  }

  res.status(201).json({
    success: true,
    data: response.data
  });
});

/**
 * @route PUT /api/google-calendar/events/:eventId
 * @desc Update a calendar event
 */
exports.updateEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { calendarId = 'primary', event } = req.body;
  const calendar = await getCalendarClient(req.user.id);

  const response = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: event
  });

  res.status(200).json({
    success: true,
    data: response.data
  });
});

/**
 * @route DELETE /api/google-calendar/events/:eventId
 * @desc Delete a calendar event
 */
exports.deleteEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { calendarId = 'primary' } = req.query;
  const calendar = await getCalendarClient(req.user.id);

  await calendar.events.delete({ calendarId, eventId });

  res.status(200).json({
    success: true,
    message: 'Event deleted successfully'
  });
});

/**
 * @route POST /api/google-calendar/webhook
 * @desc Handle Google Calendar push notifications
 */
exports.handleWebhook = async (req, res) => {
  // Immediate response required by Google
  res.status(200).end();

  const token = req.headers['x-goog-channel-token'];
  if (token !== process.env.WEBHOOK_SECRET) return;

  const channelId = req.headers['x-goog-channel-id'];
  const resourceState = req.headers['x-goog-resource-state'];

  if (resourceState === 'exists') {
    await processCalendarUpdate(channelId);
  }
};

// Helper function to process calendar updates
async function processCalendarUpdate(channelId) {
  try {
    const user = await User.findOne({ 'calendarWebhooks.channelId': channelId });
    if (!user) return;

    const webhook = user.calendarWebhooks.find(wh => wh.channelId === channelId);
    if (!webhook) return;

    const calendar = await getCalendarClient(user._id);
    const response = await calendar.events.list({
      calendarId: webhook.calendarId,
      updatedMin: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      singleEvents: true
    });

    await checkBookingConflicts(user, response.data.items);
  } catch (error) {
    console.error('Error processing calendar update:', error);
  }
}

// Helper function to check for booking conflicts
async function checkBookingConflicts(user, events) {
  const bookings = await Booking.find({
    ownerId: user._id,
    startTime: { $gt: new Date() }
  });

  for (const booking of bookings) {
    const conflicts = events.filter(event => {
      if (!event.start || !event.end || !booking.startTime || !booking.endTime) return false;
      
      const eventStart = new Date(event.start.dateTime || `${event.start.date}T00:00:00`);
      const eventEnd = new Date(event.end.dateTime || `${event.end.date}T23:59:59`);
      const bookingStart = new Date(booking.startTime);
      const bookingEnd = new Date(booking.endTime);

      return (
        (eventStart <= bookingStart && eventEnd > bookingStart) ||
        (eventStart < bookingEnd && eventEnd >= bookingEnd) ||
        (eventStart >= bookingStart && eventEnd <= bookingEnd)
      );
    });

    if (conflicts.length > 0) {
      booking.hasCalendarConflict = true;
      booking.conflictDetails = conflicts.map(event => ({
        eventId: event.id,
        summary: event.summary,
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date
      }));
      await booking.save();
    }
  }
}