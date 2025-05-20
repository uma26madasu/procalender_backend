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
  
  // Approval flow fields
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  approvedAt: {
    type: Date
  },
  
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  rejectedAt: {
    type: Date
  },
  
  rejectionReason: {
    type: String
  },
  
  // For tentative calendar events
  tentativeEventId: {
    type: String
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
  
  // Set default approval status based on link requirements
  if (this.isNew) {
    mongoose.model('Link').findById(this.linkId)
      .then(link => {
        if (link && link.requiresApproval) {
          this.approvalStatus = 'pending';
        } else {
          this.approvalStatus = 'approved';
          this.status = 'confirmed';
        }
        next();
      })
      .catch(err => next(err));
  } else {
    next();
  }
});

// Indexes for better query performance
bookingSchema.index({ ownerId: 1 });
bookingSchema.index({ linkId: 1 });
bookingSchema.index({ clientEmail: 1 });
bookingSchema.index({ startTime: 1 });
bookingSchema.index({ status: 1, approvalStatus: 1 });

module.exports = mongoose.model('Booking', bookingSchema);