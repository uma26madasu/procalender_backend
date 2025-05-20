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
  clientName: { type: String, required: true },
  clientEmail: { type: String, required: true },
  linkedinUrl: { type: String },

  // Meeting details
  meetingName: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },

  // Meeting status
  status: {
    type: String,
    enum: ['confirmed', 'canceled', 'completed'],
    default: 'confirmed'
  },

  // Approval flow
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },

  // Calendar events
  tentativeEventId: { type: String },
  googleEventId: { type: String },

  // Calendar conflict tracking
  hasCalendarConflict: {
    type: Boolean,
    default: false
  },
  conflictDetails: [{
    eventId: String,
    summary: String,
    start: String,
    end: String
  }],

  // Custom questions and answers
  questions: [{
    question: String,
    answer: String
  }],
  aiContext: { type: String },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save hook
bookingSchema.pre('save', function (next) {
  this.updatedAt = Date.now();

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

// Indexes
bookingSchema.index({ ownerId: 1 });
bookingSchema.index({ linkId: 1 });
bookingSchema.index({ clientEmail: 1 });
bookingSchema.index({ startTime: 1 });
bookingSchema.index({ status: 1, approvalStatus: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
