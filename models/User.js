// models/User.js - Complete Fixed User Schema

const mongoose = require('mongoose');

console.log('📝 Loading User model...');

const userSchema = new mongoose.Schema({
  // Google OAuth fields
  googleId: {
    type: String,
    required: false,
    unique: true,
    sparse: true // Allows multiple null values
  },
  
  // Basic user info
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  picture: {
    type: String,
    required: false
  },
  
  // Google Calendar OAuth tokens
  accessToken: {
    type: String,
    required: false
  },
  
  refreshToken: {
    type: String,
    required: false
  },
  
  tokenExpiry: {
    type: Date,
    required: false
  },
  
  // User preferences and settings
  preferences: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    notifications: {
      type: Boolean,
      default: true
    },
    defaultCalendar: {
      type: String,
      default: 'primary'
    }
  },
  
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  
  lastLogin: {
    type: Date,
    default: Date.now
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  // Schema options
  timestamps: true, // Automatically manages createdAt and updatedAt
  strict: true, // Enforce schema structure
  
  // Transform output
  toJSON: {
    transform: function(doc, ret) {
      // Don't expose sensitive data in JSON responses
      delete ret.accessToken;
      delete ret.refreshToken;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware to update the updatedAt field
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance methods
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

userSchema.methods.hasValidTokens = function() {
  if (!this.accessToken) return false;
  if (!this.tokenExpiry) return true; // Assume valid if no expiry set
  return new Date() < new Date(this.tokenExpiry);
};

userSchema.methods.clearTokens = function() {
  this.accessToken = undefined;
  this.refreshToken = undefined;
  this.tokenExpiry = undefined;
  return this.save();
};

// Static methods
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByGoogleId = function(googleId) {
  return this.findOne({ googleId: googleId });
};

userSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true });
};

console.log('✅ User schema defined with OAuth fields');

const User = mongoose.model('User', userSchema);

console.log('✅ User model created successfully');

module.exports = User;