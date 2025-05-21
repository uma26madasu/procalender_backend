const { google } = require('googleapis');
const { User, Booking } = require('../models');
const asyncHandler = require('../middleware/asyncHandler');
const crypto = require('crypto');
const { verifyWebhook } = require('../utils/webhookVerifier');
const calendarService = require('../services/calendarService');

// Configure Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate a unique channel ID
const generateChannelId = () => crypto.randomBytes(16).toString('hex');

/**
 * Helper function to get authenticated calendar client
 */
const getCalendarClient = async (userId) => {
  const user = await User.findById(userId);
  if (!user?.googleTokens) {
    throw new Error('Google Calendar not connected');
  }
  oauth2Client.setCredentials(user.googleTokens);
  return google.calendar({ version: 'v3', auth: oauth2Client });
};

/**
 * @route POST /api/google-calendar/register-webhook
 * @desc Register webhook for Google Calendar notifications
 */
exports.registerWebhook = asyncHandler(async (req, res) => {
  const { calendarId = 'primary' } = req.body;
  const calendar = await getCalendarClient(req.user.id);
  
  // Generate unique channel ID and webhook URL
  const channelId = generateChannelId();
  const webhookUrl = `${process.env.APP_URL}/api/google-calendar/webhook`;
  
  // Register the webhook with Google Calendar
  const response = await calendar.events.watch({
    calendarId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token: process.env.WEBHOOK_SECRET,
      params: {
        ttl: '604800' // 7 days in seconds
      }
    }
  });

  // Save webhook details to user
  await User.findByIdAndUpdate(req.user.id, {
    $push: {
      calendarWebhooks: {
        channelId,
        resourceId: response.data.resourceId,
        calendarId,
        expiration: new Date(parseInt(response.data.expiration, 10))
      }
    }
  });

  res.status(200).json({ 
    success: true, 
    message: 'Webhook registered successfully',
    data: {
      channelId,
      resourceId: response.data.resourceId,
      expiration: response.data.expiration
    }
  });
});

/**
 * @route POST /api/google-calendar/unregister-webhook
 * @desc Unregister webhook for Google Calendar notifications
 */
exports.unregisterWebhook = asyncHandler(async (req, res) => {
  const { channelId, resourceId } = req.body;
  const calendar = await getCalendarClient(req.user.id);
  
  try {
    // Stop the notification channel
    await calendar.channels.stop({
      requestBody: {
        id: channelId,
        resourceId
      }
    });
  } catch (error) {
    console.error('Error stopping channel:', error);
    // Channel may have already expired, continue with cleanup
  }

  // Remove webhook from user's record
  await User.findByIdAndUpdate(req.user.id, {
    $pull: {
      calendarWebhooks: { channelId }
    }
  });

  res.status(200).json({ 
    success: true, 
    message: 'Webhook unregistered successfully'
  });
});

/**
 * @route GET /api/google-calendar/calendars
 * @desc Get list of user's Google Calendars
 */
exports.listCalendars = asyncHandler(async (req, res) => {
  const calendar = await getCalendarClient(req.user.id);
  const response = await calendar.calendarList.list();
  res.status(200).json({ success: true, data: response.data.items });
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
    maxResults: Math.min(parseInt(limit, 10), 250) // Cap at 250 events
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
    conflicts,
    freeSlots: calculateFreeSlots(startTime, endTime, conflicts)
  });
});

/**
 * @route POST /api/google-calendar/events
 * @desc Create a calendar event
 */
exports.createEvent = asyncHandler(async (req, res) => {
  const { calendarId = 'primary', event, bookingId } = req.body;
  const calendar = await getCalendarClient(req.user.id);

  // Validate event times
  if (!event.start || !event.end) {
    throw new Error('Start and end times are required');
  }

  const response = await calendar.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: 'all'
  });

  if (bookingId) {
    await Booking.findByIdAndUpdate(bookingId, {
      googleEventId: response.data.id,
      status: 'confirmed',
      $unset: { hasCalendarConflict: "", conflictDetails: "" }
    });
  }

  res.status(201).json({ success: true, data: response.data });
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
    requestBody: event,
    sendUpdates: 'all'
  });

  res.status(200).json({ success: true, data: response.data });
});

/**
 * @route DELETE /api/google-calendar/events/:eventId
 * @desc Delete a calendar event
 */
exports.deleteEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { calendarId = 'primary', bookingId } = req.query;
  const calendar = await getCalendarClient(req.user.id);

  await calendar.events.delete({ 
    calendarId, 
    eventId,
    sendUpdates: 'all'
  });

  if (bookingId) {
    await Booking.findByIdAndUpdate(bookingId, {
      $unset: { googleEventId: "", hasCalendarConflict: "", conflictDetails: "" }
    });
  }

  res.status(200).json({ success: true, message: 'Event deleted successfully' });
});

/**
 * @route POST /api/google-calendar/webhook
 * @desc Handle Google Calendar push notifications
 */
exports.handleWebhook = async (req, res) => {
  // Immediate response required by Google
  res.status(200).end();
  
  // Validate webhook request
  if (!verifyWebhook(req.headers, req.body)) {
    console.error('Invalid webhook request');
    return;
  }
  
  const channelId = req.headers['x-goog-channel-id'];
  const resourceState = req.headers['x-goog-resource-state'];
  const resourceId = req.headers['x-goog-resource-id'];
  
  // Process different notification types
  try {
    // Find the user associated with this webhook
    const user = await User.findOne({ 'calendarWebhooks.channelId': channelId });
    if (!user) {
      console.error(`No user found for webhook channel ${channelId}`);
      return;
    }
    
    const webhook = user.calendarWebhooks.find(wh => wh.channelId === channelId);
    if (!webhook) return;
    
    switch (resourceState) {
      case 'sync':
        // Initial sync message
        console.log(`Webhook sync initiated for channel ${channelId}`);
        break;
        
      case 'exists':
        // Calendar updated - process changes
        await processCalendarUpdate(user._id, webhook.calendarId);
        break;
        
      case 'not_exists':
        // Resource deleted or expired
        console.log(`Resource no longer exists for channel ${channelId}`);
        // Clean up expired webhook
        await User.findByIdAndUpdate(user._id, {
          $pull: { calendarWebhooks: { channelId } }
        });
        break;
        
      default:
        console.log(`Unknown resource state: ${resourceState}`);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
  }
};

// Updated helper function to process calendar updates
async function processCalendarUpdate(userId, calendarId) {
  try {
    const calendar = await getCalendarClient(userId);
    const response = await calendar.events.list({
      calendarId,
      updatedMin: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      singleEvents: true,
      timeMin: new Date().toISOString() // Only check future events
    });

    await checkBookingConflicts(userId, response.data.items);
  } catch (error) {
    console.error('Error processing calendar update:', error);
    // Consider adding retry logic for transient errors
  }
}

// Updated helper function to check for booking conflicts
async function checkBookingConflicts(userId, events) {
  const bookings = await Booking.find({
    ownerId: userId,
    startTime: { $gt: new Date() },
    status: { $in: ['confirmed', 'pending'] }
  });

  for (const booking of bookings) {
    const conflicts = events.filter(event => {
      if (!event.start || !event.end || !booking.startTime || !booking.endTime) return false;
      
      const eventStart = new Date(event.start.dateTime || `${event.start.date}T00:00:00`);
      const eventEnd = new Date(event.end.dateTime || `${event.end.date}T23:59:59`);
      const bookingStart = new Date(booking.startTime);
      const bookingEnd = new Date(booking.endTime);

      return (
        (eventStart < bookingEnd && eventEnd > bookingStart) ||
        (event.start.date && bookingStart.toDateString() === eventStart.toDateString())
      );
    });

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
      await Booking.findByIdAndUpdate(booking._id, {
        $unset: { hasCalendarConflict: "", conflictDetails: "" }
      });
    }
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

  // Add remaining time after last conflict
  if (currentStart < end) {
    slots.push({
      start: currentStart.toISOString(),
      end: end.toISOString()
    });
  }

  return slots;
}