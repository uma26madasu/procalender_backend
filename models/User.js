const mongoose = require('mongoose');
const validator = require('validator');

// User schema with comprehensive validation
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: validator.isEmail,
      message: 'Please provide a valid email address'
    }
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters'],
    match: [/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes']
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
    validate: {
      validator: function(value) {
        return value <= new Date();
      },
      message: 'Creation date cannot be in the future'
    }
  },
  calendarWebhooks: {
    type: [{
      channelId: {
        type: String,
        required: [true, 'Channel ID is required for webhook'],
        trim: true
      },
      resourceId: {
        type: String,
        required: [true, 'Resource ID is required for webhook'],
        trim: true
      },
      calendarId: {
        type: String,
        required: [true, 'Calendar ID is required for webhook'],
        trim: true,
        validate: {
          validator: function(value) {
            // Basic validation for common calendar ID formats
            return /^[a-zA-Z0-9._-]+(@[a-zA-Z0-9-]+)?$/.test(value);
          },
          message: 'Invalid calendar ID format'
        }
      },
      expiration: {
        type: Date,
        required: [true, 'Expiration date is required for webhook'],
        validate: {
          validator: function(value) {
            return value > new Date();
          },
          message: 'Expiration date must be in the future'
        }
      },
      created: {
        type: Date,
        default: Date.now
      }
    }],
    validate: {
      validator: function(webhooks) {
        // Limit the number of webhooks per user
        return webhooks.length <= 10;
      },
      message: 'Maximum of 10 webhooks allowed per user'
    }
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
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ 'calendarWebhooks.calendarId': 1 });
userSchema.index({ 'calendarWebhooks.expiration': 1 });
userSchema.index({ createdAt: -1 });

// Middleware to handle duplicate key errors (especially for email)
userSchema.post('save', function(error, doc, next) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    next(new Error('Email address is already registered'));
  } else {
    next(error);
  }
});

// Virtual for formatted creation date
userSchema.virtual('createdAtFormatted').get(function() {
  return this.createdAt.toISOString();
});

// Method to check if a webhook exists for a calendar
userSchema.methods.hasWebhookForCalendar = function(calendarId) {
  return this.calendarWebhooks.some(
    webhook => webhook.calendarId === calendarId && webhook.expiration > new Date()
  );
};

// Export the model with error handling
try {
  module.exports = mongoose.model('User', userSchema);
  console.log('User model exported successfully');
} catch (error) {
  console.error('Error creating User model:', error.message);
  // Export a dummy object to prevent application crashes
  module.exports = { dummy: true };
}