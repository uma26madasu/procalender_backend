// src/routes/googleCalendarRoutes.js
const express = require('express');
const router = express.Router();
const googleCalendarController = require('../controllers/googleCalendarController');
const { authenticateToken } = require('../middleware/auth'); // Assuming your auth middleware is named authenticateToken

// Public webhook endpoint (does not require authentication middleware)
router.post('/webhook', googleCalendarController.handleWebhook);

// All other routes require authentication via `authenticateToken` middleware
// Make sure `authenticateToken` correctly populates `req.user.uid` for controller access
router.use(authenticateToken);

// Calendar listing (if you have this in your controller)
// router.get('/calendars', googleCalendarController.listCalendars);

// Get calendar events for the authenticated user
router.get('/events', googleCalendarController.getCalendarEvents);

// Conflict checking (if you have this in your controller)
// router.post('/check-conflicts', googleCalendarController.checkConflicts);

// Event management
router.post('/create-event', googleCalendarController.createEvent);
router.patch('/events/:eventId/confirm', googleCalendarController.confirmEvent); // Changed from updateEvent to confirmEvent
router.delete('/events/:eventId', googleCalendarController.deleteEvent);

// Webhook management (if you have these in your controller)
// router.post('/register-webhook', googleCalendarController.registerWebhook);
// router.post('/unregister-webhook', googleCalendarController.unregisterWebhook);


module.exports = router;