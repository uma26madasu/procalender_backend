// src/models/User.js
const mongoose = require('mongoose');
const validator = require('validator');

// Define the schema for Google tokens
const googleTokensSchema = new mongoose.Schema({
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiryDate: { type: Date, required: true }, // The time when the access token expires
  scope: { type: String },
  tokenType: { type: String },
  idToken: { type: String }, // Google OAuth can sometimes provide an id_token
}, { _id: false }); // Do not create a separate _id for this sub-document

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
  firebaseUid: { // Unique ID from Firebase Authentication
    type: String,
    required: true,
    unique: true,
    index: true // Add an index for faster lookups
  },
  googleTokens: { // Embedded document for Google Calendar OAuth tokens
    type: googleTokensSchema,
    required: false, // Not all users will connect Google Calendar
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
      expiration: {
        type: Date,
        required: [true, 'Expiration date is required for webhook'],
      },
      calendarId: {
        type: String,
        required: [true, 'Calendar ID is required for webhook'],
        trim: true
      },
    }],
    default: [],
    validate: {
      validator: function(v) {
        return Array.isArray(v);
      },
      message: props => `${props.value} is not a valid array for calendarWebhooks!`
    }
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
    message: '{VALUE} is not a valid role. Must be "user" or "admin"'
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
userSchema.index({ firebaseUid: 1 }, { unique: true }); // New index for firebaseUid
userSchema.index({ 'calendarWebhooks.calendarId': 1 });
userSchema.index({ 'calendarWebhooks.expiration': 1 });
userSchema.index({ createdAt: -1 });

// Middleware to handle duplicate key errors (especially for email and firebaseUid)
userSchema.post('save', function(error, doc, next) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    if (error.message.includes('email')) {
      next(new Error('Email address is already registered'));
    } else if (error.message.includes('firebaseUid')) {
      next(new Error('User with this Firebase ID is already registered'));
    } else {
      next(error);
    }
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
module.exports = mongoose.models.User || mongoose.model('User', userSchema);