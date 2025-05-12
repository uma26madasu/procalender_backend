// models/Window.js
const mongoose = require('mongoose');

/**
 * Availability window schema - represents a recurring time slot when
 * an advisor is available for meetings (e.g., Mondays 9 AM - 5 PM)
 */
const windowSchema = new mongoose.Schema({
  // The user who owns this availability window
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Day of the week (Monday, Tuesday, etc.)
  dayOfWeek: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true
  },
  
  // Start time in 24-hour format (HH:MM)
  startHour: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format (HH:MM)`
    }
  },
  
  // End time in 24-hour format (HH:MM)
  endHour: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format (HH:MM)`
    }
  },
  
  // Optional window name (e.g., "Morning Hours", "Afternoon Consultations")
  name: {
    type: String
  },
  
  // Whether this window is active
  active: {
    type: Boolean,
    default: true
  },
  
  // Creation and update timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure that startHour is before endHour
windowSchema.pre('validate', function(next) {
  const startParts = this.startHour.split(':').map(Number);
  const endParts = this.endHour.split(':').map(Number);
  
  const startMinutes = startParts[0] * 60 + startParts[1];
  const endMinutes = endParts[0] * 60 + endParts[1];
  
  if (startMinutes >= endMinutes) {
    this.invalidate('endHour', 'End time must be after start time');
  }
  
  next();
});

// Update the updatedAt field on save
windowSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Window', windowSchema);