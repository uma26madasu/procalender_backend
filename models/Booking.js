const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  // Link this booking is associated with
  linkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Link',
    required: true
  },
  
  // Owner of the meeting (advisor)
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Client information
  clientName: {
    type: String,
    required: true
  },
  
  clientEmail: {
    type: String,
    required: true
  },
  
  linkedinUrl: {
    type: String
  },
  
  // Meeting details
  meetingName: {
    type: String,
    required: true
  },
  
  startTime: {
    type: Date,
    required: true
  },
  
  endTime: {
    type: Date,
    required: true
  },
  
  // Meeting status (confirmed, canceled, completed)
  status: {
    type: String,
    enum: ['confirmed', 'canceled', 'completed'],
    default: 'confirmed'
  },
  
  // Google Calendar event ID (if calendar integration is enabled)
  googleEventId: {
    type: String
  },
  
  // Custom questions and answers
  questions: [{
    question: String,
    answer: String
  }],
  
  // AI-generated context/insights (if applicable)
  aiContext: {
    type: String
  },
  
  // Created and updated timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the 'updatedAt' field on save
bookingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);