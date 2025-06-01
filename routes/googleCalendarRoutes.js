// routes/googleCalendarRoutes.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const googleCalendarController = require('../controllers/googleCalendarController');
const { verifyAuth } = require('../controllers/authController'); // Use the fixed auth from authController

console.log('📝 Loading Google Calendar routes...');

// Public webhook endpoint (no authentication)
router.post('/webhook', googleCalendarController.handleWebhook);

// Test endpoint to check if routes are loaded
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Google Calendar routes are working',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /api/calendar/test',
      'GET /api/calendar/calendars',
      'GET /api/calendar/events',
      'POST /api/calendar/events',
      'PUT /api/calendar/events/:eventId',
      'DELETE /api/calendar/events/:eventId',
      'POST /api/calendar/check-conflicts',
      'POST /api/calendar/webhook'
    ]
  });
});

// All other routes require authentication
router.use(verifyAuth);

// Calendar listing and events
router.get('/calendars', googleCalendarController.listCalendars);
router.get('/events', googleCalendarController.getEvents);

// Conflict checking
router.post('/check-conflicts', googleCalendarController.checkConflicts);

// Event management
router.post('/events', googleCalendarController.createEvent);
router.put('/events/:eventId', googleCalendarController.updateEvent);
router.delete('/events/:eventId', googleCalendarController.deleteEvent);

console.log('✅ Google Calendar routes configured successfully');

module.exports = router;