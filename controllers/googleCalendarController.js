// src/controllers/googleCalendarController.js
const { google } = require('googleapis');
const { User, Booking } = require('../models'); // Assuming your models are here
const asyncHandler = require('../middleware/asyncHandler');
const crypto = require('crypto');
const { refreshGoogleToken } = require('../utils/tokenManager'); // Ensure this is imported
const { verifyWebhook } = require('../utils/webhookVerifier'); // If you have a webhook verifier

// Configure Google OAuth client (this might be better managed by a service/utility)
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate a unique channel ID for webhooks
const generateChannelId = () => crypto.randomBytes(16).toString('hex');

/**
 * Helper function to get authenticated calendar client
 * This function will ensure tokens are refreshed if needed
 */
const getCalendarClient = async (firebaseUid) => {
  const user = await User.findOne({ firebaseUid: firebaseUid });
  if (!user || !user.googleTokens) {
    throw Object.assign(new Error('Google Calendar not connected or tokens missing.'), { reconnect: true });
  }

  // Attempt to refresh tokens
  try {
    const refreshedTokens = await refreshGoogleToken(user);
    oauth2Client.setCredentials(refreshedTokens);
  } catch (error) {
    console.error("Failed to refresh Google token for user:", firebaseUid, error.message);
    throw Object.assign(new Error('Failed to refresh Google token, please reconnect.'), { reconnect: true });
  }

  return google.calendar({ version: 'v3', auth: oauth2Client });
};

/**
 * @route GET /api/google-calendar/calendars
 * @desc List all calendars for the authenticated user
 */
exports.listCalendars = asyncHandler(async (req, res) => {
  const calendar = await getCalendarClient(req.user.uid);
  const response = await calendar.calendarList.list();
  res.json({ success: true, calendars: response.data.items });
});

/**
 * @route GET /api/google-calendar/events
 * @desc Get events from primary calendar
 */
exports.getEvents = asyncHandler(async (req, res) => {
  const { startDate, endDate, maxResults = 100 } = req.query;
  const calendar = await getCalendarClient(req.user.uid);

  const eventsRes = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startDate || new Date().toISOString(),
    timeMax: endDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
    maxResults: parseInt(maxResults),
    singleEvents: true,
    orderBy: 'startTime',
  });

  res.json({ success: true, events: eventsRes.data.items || [] });
});

/**
 * @route POST /api/google-calendar/check-conflicts
 * @desc Check for conflicts for a given time range
 */
exports.checkConflicts = asyncHandler(async (req, res) => {
  const { startTime, endTime } = req.body;
  if (!startTime || !endTime) {
    return res.status(400).json({ success: false, message: 'Start time and end time are required.' });
  }

  const calendar = await getCalendarClient(req.user.uid);

  const response = await calendar.freebusy.query({
    requestBody: {
      items: [{ id: 'primary' }],
      timeMin: new Date(startTime).toISOString(),
      timeMax: new Date(endTime).toISOString(),
    },
  });

  const busyTimes = response.data.calendars.primary ? response.data.calendars.primary.busy : [];
  const hasConflicts = busyTimes.length > 0;

  res.json({ success: true, hasConflicts, conflicts: busyTimes });
});

/**
 * @route POST /api/google-calendar/events
 * @desc Create a new event
 */
exports.createEvent = asyncHandler(async (req, res) => {
  const { summary, description, start, end, attendees, location } = req.body;
  const calendar = await getCalendarClient(req.user.uid);

  const event = {
    summary: summary,
    description: description,
    start: {
      dateTime: start,
      timeZone: 'UTC', // Consider making this dynamic based on user or frontend
    },
    end: {
      dateTime: end,
      timeZone: 'UTC',
    },
    attendees: attendees ? attendees.map(email => ({ email })) : [],
    location: location,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 10 },
      ],
    },
    // Add conferenceData for Google Meet integration if desired
    conferenceData: {
      createRequest: { requestId: `${Date.now()}` },
    },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
    sendNotifications: true, // Send invites to attendees
    conferenceDataVersion: 1, // Required for conferenceData
  });

  res.status(201).json({ success: true, event: response.data });
});

/**
 * @route PUT /api/google-calendar/events/:eventId
 * @desc Update an existing event
 */
exports.updateEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { summary, description, start, end, attendees, location, status } = req.body; // Added status for confirming
  const calendar = await getCalendarClient(req.user.uid);

  const existingEvent = await calendar.events.get({
    calendarId: 'primary',
    eventId: eventId,
  });

  const updatedEvent = {
    ...existingEvent.data,
    summary: summary || existingEvent.data.summary,
    description: description || existingEvent.data.description,
    start: start ? { dateTime: start, timeZone: existingEvent.data.start.timeZone } : existingEvent.data.start,
    end: end ? { dateTime: end, timeZone: existingEvent.data.end.timeZone } : existingEvent.data.end,
    attendees: attendees ? attendees.map(email => ({ email })) : existingEvent.data.attendees,
    location: location || existingEvent.data.location,
    status: status || existingEvent.data.status, // Update status (e.g., 'confirmed')
  };

  const response = await calendar.events.update({
    calendarId: 'primary',
    eventId: eventId,
    resource: updatedEvent,
    sendNotifications: true,
    conferenceDataVersion: 1,
  });

  res.json({ success: true, event: response.data });
});


/**
 * @route DELETE /api/google-calendar/events/:eventId
 * @desc Delete an event
 */
exports.deleteEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const calendar = await getCalendarClient(req.user.uid);

  await calendar.events.delete({
    calendarId: 'primary',
    eventId: eventId,
    sendNotifications: true,
  });

  res.json({ success: true, message: 'Event deleted successfully.' });
});

/**
 * @route POST /api/google-calendar/register-webhook
 * @desc Register webhook for Google Calendar notifications
 */
exports.registerWebhook = asyncHandler(async (req, res) => {
  const { calendarId = 'primary' } = req.body;
  const firebaseUid = req.user.uid;
  const user = await User.findOne({ firebaseUid: firebaseUid });

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  // Check if a valid webhook already exists for this calendar and user
  if (user.hasWebhookForCalendar(calendarId)) {
    return res.status(200).json({ success: true, message: 'Webhook already registered and active.' });
  }

  const calendar = await getCalendarClient(firebaseUid);
  const channelId = generateChannelId();
  const webhookUrl = `${process.env.BACKEND_URL}/api/google-calendar/webhook`; // Ensure this is your public backend URL

  const response = await calendar.events.watch({
    calendarId: calendarId,
    resource: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      // expiration: (Date.now() + 86400000 * 7).toString(), // 7 days (optional, Google default is 7 days anyway)
    },
  });

  // Store webhook details in user document
  user.calendarWebhooks.push({
    calendarId: calendarId,
    channelId: channelId,
    resourceId: response.data.resourceId,
    expiration: new Date(parseInt(response.data.expiration)), // Convert from string to Date
    // Add other relevant details
  });
  await user.save();

  res.json({ success: true, message: 'Webhook registered successfully.', channelId: channelId });
});

/**
 * @route POST /api/google-calendar/unregister-webhook
 * @desc Unregister webhook for Google Calendar notifications
 */
exports.unregisterWebhook = asyncHandler(async (req, res) => {
  const { calendarId = 'primary', channelId, resourceId } = req.body;
  const firebaseUid = req.user.uid;
  const user = await User.findOne({ firebaseUid: firebaseUid });

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  if (!channelId || !resourceId) {
    return res.status(400).json({ success: false, message: 'Channel ID and Resource ID are required.' });
  }

  const calendar = await getCalendarClient(firebaseUid);

  try {
    await calendar.channels.stop({
      resource: {
        id: channelId,
        resourceId: resourceId,
      },
    });

    // Remove webhook details from user document
    user.calendarWebhooks = user.calendarWebhooks.filter(
      (webhook) => !(webhook.channelId === channelId && webhook.resourceId === resourceId)
    );
    await user.save();

    res.json({ success: true, message: 'Webhook unregistered successfully.' });
  } catch (error) {
    console.error('Error unregistering webhook:', error.message);
    if (error.code === 404) { // Google API returns 404 if channel/resource not found
      // If not found on Google, just remove from DB
      user.calendarWebhooks = user.calendarWebhooks.filter(
        (webhook) => !(webhook.channelId === channelId && webhook.resourceId === resourceId)
      );
      await user.save();
      return res.json({ success: true, message: 'Webhook already unregistered or not found in Google, removed from DB.' });
    }
    res.status(500).json({ success: false, message: 'Failed to unregister webhook.' });
  }
});

/**
 * @route POST /api/google-calendar/webhook
 * @desc Handle incoming webhook notifications from Google Calendar
 * NOTE: This endpoint typically does not require authentication and is called by Google.
 */
exports.handleWebhook = asyncHandler(async (req, res) => {
  console.log('Incoming Google Calendar Webhook Notification:', req.headers);

  const channelId = req.headers['x-goog-channel-id'];
  const resourceId = req.headers['x-goog-resource-id'];
  const state = req.headers['x-goog-channel-token']; // This is your 'clientToken' if you set it
  const messageNumber = req.headers['x-goog-message-number'];
  const eventType = req.headers['x-goog-event-type']; // 'sync' or 'change'

  // Validate the webhook if you implemented a `webhookVerifier`
  // const isValid = verifyWebhook(req.headers, req.body); // You'd need to adapt verifyWebhook
  // if (!isValid) {
  //   console.warn('Invalid webhook notification received.');
  //   return res.status(403).send('Forbidden');
  // }

  if (!channelId || !resourceId) {
    console.warn('Missing channel or resource ID in webhook headers.');
    return res.status(400).send('Bad Request');
  }

  // Find the user associated with this channelId/resourceId
  const user = await User.findOne({
    'calendarWebhooks.channelId': channelId,
    'calendarWebhooks.resourceId': resourceId
  });

  if (!user) {
    console.warn(`User not found for channelId: ${channelId}`);
    return res.status(404).send('Not Found');
  }

  console.log(`Webhook for user ${user.email} (UID: ${user.firebaseUid}) received event type: ${eventType}`);

  // If it's a 'sync' event, you might just acknowledge it.
  // If it's a 'change' event, fetch the latest events for this user
  if (eventType === 'sync' || eventType === 'change') {
    // In a real application, you might use a queue/worker to process this
    // to avoid blocking the webhook response.
    console.log(`Processing calendar changes for user ${user.email}...`);
    try {
      // You would fetch events for this user and potentially update your database
      // For example, trigger a refresh of their calendar data on your backend
      const calendar = await getCalendarClient(user.firebaseUid);
      const eventsRes = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: 10, // Fetch a few recent events to see changes
        singleEvents: true,
        orderBy: 'updated',
      });
      console.log(`Fetched ${eventsRes.data.items ? eventsRes.data.items.length : 0} events after webhook.`);

      // Here you would integrate with your booking logic, e.g.,
      // re-check conflicts for existing bookings or update relevant data.
      // await updateBookingConflictsForUser(user.firebaseUid); // You'd need to implement this
    } catch (error) {
      console.error('Error processing webhook event:', error);
      // If tokens are expired, try to refresh and re-register webhook
      if (error.reconnect && user.googleTokens && user.googleTokens.refresh_token) {
         try {
           console.log("Attempting to re-register webhook after token issue.");
           // This re-registers the webhook. Make sure registerWebhook handles existing webhook removal.
           await exports.registerWebhook({ user: user, body: { calendarId: 'primary' } }, { status: () => ({ json: () => {} }) });
         } catch(reRegisterErr) {
           console.error("Failed to re-register webhook:", reRegisterErr.message);
         }
      }
    }
  }

  // Google expects a 200 OK response quickly
  res.status(200).send('OK');
});

// Helper function to calculate free slots (from previous responses)
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

// Function to update booking conflicts (moved from bookingController if it was there)
exports.updateBookingConflicts = asyncHandler(async (req, res) => {
    // This is just a placeholder to ensure the export exists if used by other parts
    // The actual logic would involve iterating through bookings and checking conflicts
    res.status(200).json({ message: "Update booking conflicts endpoint hit." });
});

// A more robust helper to update conflicts for all bookings of a user
async function updateBookingConflictsForUser(firebaseUid) {
  const user = await User.findOne({ firebaseUid: firebaseUid });
  if (!user || !user.googleTokens) {
    console.log(`User ${firebaseUid} not found or no Google tokens for conflict update.`);
    return;
  }

  const calendar = await getCalendarClient(firebaseUid); // Use getCalendarClient to get authenticated client

  const bookings = await Booking.find({ userId: user._id }); // Find bookings by MongoDB user ID

  for (const booking of bookings) {
    if (!booking.slotStart || !booking.slotEnd) {
      console.warn(`Booking ${booking._id} missing start/end times.`);
      continue;
    }

    try {
      const response = await calendar.freebusy.query({
        requestBody: {
          items: [{ id: 'primary' }],
          timeMin: new Date(booking.slotStart).toISOString(),
          timeMax: new Date(booking.slotEnd).toISOString(),
        },
      });

      const busyTimes = response.data.calendars.primary ? response.data.calendars.primary.busy : [];
      const hasConflicts = busyTimes.length > 0;

      if (hasConflicts && !booking.hasCalendarConflict) {
        await Booking.findByIdAndUpdate(booking._id, {
          hasCalendarConflict: true,
          conflictDetails: busyTimes.map(item => ({
            start: item.start,
            end: item.end
          }))
        });
        console.log(`Updated booking ${booking._id}: CONFLICT detected.`);
      } else if (!hasConflicts && booking.hasCalendarConflict) {
        await Booking.findByIdAndUpdate(booking._id, {
          $unset: { hasCalendarConflict: "", conflictDetails: "" }
        });
        console.log(`Updated booking ${booking._id}: Conflict CLEARED.`);
      }
    } catch (error) {
      console.error(`Error checking conflict for booking ${booking._id}:`, error.message);
      // Handle token expiration if necessary
      if (error.reconnect) {
          console.error("Token expired during conflict check, attempt to refresh/reconnect user.");
          // This would ideally trigger a user-facing notification to re-auth
          // Or trigger an automatic re-registration of webhooks if the refresh was successful.
      }
    }
  }
}