const express = require('express');
const router = express.Router();

// Basic routes for bookings (can be expanded later)
router.get('/', (req, res) => {
  res.json({ message: 'Bookings API endpoint' });
});
router.get('/available-slots/:linkId', bookingController.getAvailableSlots);

module.exports = router;