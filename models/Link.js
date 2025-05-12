// models/Link.js
const mongoose = require('mongoose');

/**
 * Custom question schema for additional information
 * collected during booking
 */
const questionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'textarea', 'select', 'radio', 'checkbox'],
    default: 'text'
  },
  required: {
    type: Boolean,
    default: false
  },
  options: {
    type: [String],
    default: []
  }
}, { _id: false });

/**
 * Scheduling link schema - represents a shareable link that
 * allows clients to book specific types of meetings
 */
const linkSchema = new mongoose.Schema({
  // The user who owns this scheduling link
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Unique identifier for this link (used in the URL)
  linkId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Name of the meeting type (e.g., "Initial Consultation")
  meetingName: {
    type: String,
    required: true
  },
  
  // Length of the meeting in minutes
  meetingLength: {
    type: Number,
    required: true,
    min: 15,
    max: 240
  },
  
  // Description of the meeting
  description: {
    type: String,
    default: ''
  },
  
  // Location info (virtual, in-person, etc.)
  location: {
    type: String,
    default: 'Virtual'
  },
  
  // Custom questions to ask during booking
  questions: {
    type: [questionSchema],
    default: []
  },
  
  // Optional expiration date
  expirationDate: {
    type: Date
  },
  
  // Maximum number of bookings allowed (0 = unlimited)
  usageLimit: {
    type: Number,
    default: 0
  },
  
  // Number of times this link has been used
  usageCount: {
    type: Number,
    default: 0
  },
  
  // Whether this link is active
  active: {
    type: Boolean,
    default: true
  },
  
  // Buffer time before meeting in minutes
  bufferBefore: {
    type: Number,
    default: 0
  },
  
  // Buffer time after meeting in minutes
  bufferAfter: {
    type: Number,
    default: 0
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

// Generate a unique link ID if not provided
linkSchema.pre('save', function(next) {
  if (!this.linkId) {
    this.linkId = Math.random().toString(36).substring(2, 10);
  }
  
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Link', linkSchema);