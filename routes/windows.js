const express = require('express');
const router = express.Router();

// Basic routes for windows (can be expanded later)
router.get('/', (req, res) => {
  res.json({ message: 'Windows API endpoint' });
});

module.exports = router;