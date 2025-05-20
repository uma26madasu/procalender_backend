// routes/windows.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getWindows,
  createWindow,
  updateWindow,
  deleteWindow
} = require('../controllers/windowController');

// All routes require authentication
router.use(protect);

// Routes
router.route('/')
  .get(getWindows)
  .post(createWindow);

router.route('/:id')
  .put(updateWindow)
  .delete(deleteWindow);

module.exports = router;