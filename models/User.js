// models/User.js

const mongoose = require('mongoose');

// User schema with webhook info
const userSchema = new mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  createdAt: {
    type: Date,
    default: Date.now
  },
  calendarWebhooks: [{
    channelId: String,
    resourceId: String,
    calendarId: String,
    expiration: Date
  }]
});

// Export the model
try {
  module.exports = mongoose.model('User', userSchema);
  console.log('User model exported successfully');
} catch (error) {
  console.error('Error creating User model:', error.message);
  // Export a dummy object to prevent crashes
  module.exports = { dummy: true };
}
