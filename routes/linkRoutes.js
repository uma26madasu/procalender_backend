const express = require('express');
const router = express.Router();

// Basic routes for links (can be expanded later)
router.get('/', (req, res) => {
  res.json({ message: 'Links API endpoint' });
});

module.exports = router;