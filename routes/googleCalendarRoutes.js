// routes/googleCalendarRoutes.js
const express = require('express');
const router = express.Router();
const googleCalendarController = require('../controllers/googleCalendarController');
const { protect } = require('../middleware/auth'); // Assuming you have auth middleware

// Public webhook endpoint (no authentication)
router.post('/webhook', googleCalendarController.handleWebhook);

// All other routes require authentication
router.use(protect);

// Calendar listing and events
router.get('/calendars', googleCalendarController.listCalendars);
router.get('/events', googleCalendarController.getEvents);

// Conflict checking
router.post('/check-conflicts', googleCalendarController.checkConflicts);

// Event management
router.post('/events', googleCalendarController.createEvent);
router.put('/events/:eventId', googleCalendarController.updateEvent);
router.delete('/events/:eventId', googleCalendarController.deleteEvent);

// Webhook management
router.post('/register-webhook', googleCalendarController.registerWebhook);
router.post('/unregister-webhook', googleCalendarController.unregisterWebhook);

module.exports = router;