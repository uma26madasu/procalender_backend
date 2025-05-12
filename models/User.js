// models/User.js - Minimal version for testing
const mongoose = require('mongoose');

// Simple schema for testing
const userSchema = new mongoose.Schema({
  email: String,
  name: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Export the model only if mongoose is available
try {
  module.exports = mongoose.model('User', userSchema);
  console.log('User model exported successfully');
} catch (error) {
  console.error('Error creating User model:', error.message);
  // Export a dummy model to prevent crashes
  module.exports = { dummy: true };
}