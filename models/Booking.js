const mongoose = require('mongoose');
const validator = require('validator');

const BookingSchema = new mongoose.Schema({
  // Reference fields
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    validate: {
      validator: async function(value) {
        const user = await mongoose.model('User').findById(value);
        return user !== null;
      },
      message: 'Referenced user does not exist'
    }
  },
  linkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Link',
    required: [true, 'Link ID is required'],
    validate: {
      validator: async function(value) {
        const link = await mongoose.model('Link').findById(value);
        return link !== null;
      },
      message: 'Referenced link does not exist'
    }
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required'],
    validate: {
      validator: async function(value) {
        const user = await mongoose.model('User').findById(value);
        return user !== null;
      },
      message: 'Referenced owner does not exist'
    }
  },

  // Client information
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  clientName: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true,
    minlength: [2, 'Client name must be at least 2 characters'],
    maxlength: [100, 'Client name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    validate: {
      validator: validator.isEmail,
      message: 'Please provide a valid email'
    }
  },
  clientEmail: {
    type: String,
    required: [true, 'Client email is required'],
    trim: true,
    lowercase: true,
    validate: {
      validator: validator.isEmail,
      message: 'Please provide a valid client email'
    }
  },
  linkedinUrl: {
    type: String,
    validate: {
      validator: validator.isURL,
      message: 'Please provide a valid LinkedIn URL',
      protocols: ['http', 'https'],
      require_protocol: true
    }
  },

  // Meeting details
  meetingName: {
    type: String,
    required: [true, 'Meeting name is required'],
    trim: true,
    minlength: [3, 'Meeting name must be at least 3 characters'],
    maxlength: [100, 'Meeting name cannot exceed 100 characters']
  },
  startTime: {
    type: Date,
    required: [true, 'Start time is required'],
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'Start time must be in the future'
    }
  },
  endTime: {
    type: Date,
    required: [true, 'End time is required'],
    validate: {
      validator: function(value) {
        return value > this.startTime;
      },
      message: 'End time must be after start time'
    }
  },
  timezone: {
    type: String,
    required: [true, 'Timezone is required'],
    validate: {
      validator: function(val) {
        return /^[A-Za-z]+\/[A-Za-z_]+$/.test(val);
      },
      message: 'Please provide a valid timezone (e.g., America/New_York)'
    }
  },

  // Status fields
  status: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'cancelled', 'completed'],
      message: 'Status must be pending, confirmed, cancelled, or completed'
    },
    default: 'pending'
  },
  approvalStatus: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'rejected'],
      message: 'Approval status must be pending, approved, or rejected'
    },
    default: 'pending'
  },

  // Approval/rejection details
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    validate: {
      validator: async function(value) {
        if (!value) return true;
        const user = await mongoose.model('User').findById(value);
        return user !== null;
      },
      message: 'Approver user does not exist'
    }
  },
  approvedAt: {
    type: Date,
    validate: {
      validator: function(value) {
        if (!value) return true;
        return value <= new Date();
      },
      message: 'Approval date cannot be in the future'
    }
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    validate: {
      validator: async function(value) {
        if (!value) return true;
        const user = await mongoose.model('User').findById(value);
        return user !== null;
      },
      message: 'Rejector user does not exist'
    }
  },
  rejectedAt: {
    type: Date,
    validate: {
      validator: function(value) {
        if (!value) return true;
        return value <= new Date();
      },
      message: 'Rejection date cannot be in the future'
    }
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Rejection reason cannot exceed 500 characters']
  },
  cancellationReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Cancellation reason cannot exceed 500 characters']
  },

  // Calendar integration
  googleEventId: {
    type: String,
    sparse: true
  },
  tentativeEventId: {
    type: String,
    sparse: true
  },
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

  // Additional information
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  questions: [{
    question: String,
    answer: String
  }],
  aiContext: {
    type: String,
    trim: true
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

// Indexes for better query performance
BookingSchema.index({ userId: 1, status: 1 });
BookingSchema.index({ userId: 1, startTime: -1 });
BookingSchema.index({ linkId: 1, startTime: -1 });
BookingSchema.index({ startTime: 1, endTime: 1 });
BookingSchema.index({ ownerId: 1 });
BookingSchema.index({ clientEmail: 1 });
BookingSchema.index({ status: 1, approvalStatus: 1 });

// Pre-save hooks with comprehensive error handling
BookingSchema.pre('save', async function(next) {
  try {
    // Update timestamp
    this.updatedAt = Date.now();

    // For new bookings
    if (this.isNew) {
      // Check if link requires approval
      const link = await mongoose.model('Link').findById(this.linkId);
      if (!link) {
        throw new Error('Referenced link not found');
      }

      if (link.requiresApproval) {
        this.approvalStatus = 'pending';
        this.status = 'pending';
      } else {
        this.approvalStatus = 'approved';
        this.status = 'confirmed';
      }

      // Check for booking conflicts
      await checkBookingConflicts.call(this);
    }

    // For existing bookings being modified
    if (this.isModified('startTime') || this.isModified('endTime')) {
      await checkBookingConflicts.call(this);
    }

    // Validate approval/rejection consistency
    if (this.isModified('approvalStatus')) {
      validateApprovalStatus.call(this);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Helper function to check for booking conflicts
async function checkBookingConflicts() {
  const conflictingBooking = await this.constructor.findOne({
    _id: { $ne: this._id },
    $or: [
      { ownerId: this.ownerId },
      { userId: this.userId }
    ],
    status: { $nin: ['cancelled', 'rejected'] },
    $or: [
      { startTime: { $lt: this.endTime, $gte: this.startTime } },
      { endTime: { $gt: this.startTime, $lte: this.endTime } },
      { startTime: { $lte: this.startTime }, endTime: { $gte: this.endTime } }
    ]
  });

  if (conflictingBooking) {
    throw new Error('This time slot conflicts with an existing booking');
  }
}

// Helper function to validate approval status changes
function validateApprovalStatus() {
  if (this.approvalStatus === 'approved') {
    this.approvedAt = new Date();
    this.status = 'confirmed';
    if (this.rejectedBy || this.rejectedAt || this.rejectionReason) {
      this.rejectedBy = undefined;
      this.rejectedAt = undefined;
      this.rejectionReason = undefined;
    }
  } else if (this.approvalStatus === 'rejected') {
    if (!this.rejectionReason) {
      throw new Error('Rejection reason is required when rejecting a booking');
    }
    this.rejectedAt = new Date();
    this.status = 'cancelled';
    if (this.approvedBy || this.approvedAt) {
      this.approvedBy = undefined;
      this.approvedAt = undefined;
    }
  }
}

// Error handling middleware
BookingSchema.post('save', function(error, doc, next) {
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(val => val.message);
    next(new Error(messages.join('. ')));
  } else if (error.name === 'MongoServerError' && error.code === 11000) {
    next(new Error('Duplicate booking detected'));
  } else {
    next(error);
  }
});

// Virtual properties
BookingSchema.virtual('duration').get(function() {
  return (this.endTime - this.startTime) / (1000 * 60); // Duration in minutes
});

BookingSchema.virtual('isUpcoming').get(function() {
  return this.startTime > new Date() && 
         this.status === 'confirmed' && 
         this.approvalStatus === 'approved';
});

module.exports = mongoose.model('Booking', BookingSchema);