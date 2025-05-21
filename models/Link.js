const mongoose = require('mongoose');
const validator = require('validator');

/**
 * Custom question schema with comprehensive validation
 */
const questionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Question ID is required'],
    trim: true,
    match: [/^[a-z0-9-]+$/, 'Question ID can only contain lowercase letters, numbers, and hyphens']
  },
  label: {
    type: String,
    required: [true, 'Question label is required'],
    trim: true,
    minlength: [3, 'Question label must be at least 3 characters'],
    maxlength: [100, 'Question label cannot exceed 100 characters']
  },
  type: {
    type: String,
    required: [true, 'Question type is required'],
    enum: {
      values: ['text', 'textarea', 'select', 'radio', 'checkbox'],
      message: 'Question type must be one of: text, textarea, select, radio, checkbox'
    },
    default: 'text'
  },
  required: {
    type: Boolean,
    default: false
  },
  options: {
    type: [String],
    validate: {
      validator: function(options) {
        // Options are required for select, radio, and checkbox types
        if (['select', 'radio', 'checkbox'].includes(this.type)) {
          return options && options.length > 0;
        }
        return true;
      },
      message: 'Options are required for select, radio, and checkbox question types'
    },
    default: []
  }
}, { _id: false });

/**
 * Scheduling link schema with comprehensive validation
 */
const linkSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required'],
    validate: {
      validator: async function(value) {
        // Check if the referenced user exists
        const user = await mongoose.model('User').findById(value);
        return user !== null;
      },
      message: 'Referenced user does not exist'
    }
  },
  
  linkId: {
    type: String,
    required: [true, 'Link ID is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[a-z0-9-]+$/, 'Link ID can only contain lowercase letters, numbers, and hyphens'],
    minlength: [4, 'Link ID must be at least 4 characters'],
    maxlength: [50, 'Link ID cannot exceed 50 characters']
  },
  
  meetingName: {
    type: String,
    required: [true, 'Meeting name is required'],
    trim: true,
    minlength: [3, 'Meeting name must be at least 3 characters'],
    maxlength: [100, 'Meeting name cannot exceed 100 characters']
  },
  
  meetingLength: {
    type: Number,
    required: [true, 'Meeting length is required'],
    min: [5, 'Meeting length must be at least 5 minutes'],
    max: [240, 'Meeting length cannot exceed 240 minutes']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  location: {
    type: String,
    default: 'Virtual',
    validate: {
      validator: function(value) {
        // Basic validation for common location formats
        return /^[a-zA-Z0-9\s,.-]+$/.test(value) || 
               validator.isURL(value, { require_protocol: true });
      },
      message: 'Location must be a valid address or URL'
    }
  },
  
  questions: {
    type: [questionSchema],
    validate: {
      validator: function(questions) {
        // Limit the number of custom questions
        return questions.length <= 10;
      },
      message: 'Maximum of 10 custom questions allowed'
    },
    default: []
  },
  
  expirationDate: {
    type: Date,
    validate: {
      validator: function(value) {
        if (!value) return true;
        return value > new Date();
      },
      message: 'Expiration date must be in the future'
    }
  },
  
  usageLimit: {
    type: Number,
    default: 0,
    min: [0, 'Usage limit cannot be negative']
  },
  
  usageCount: {
    type: Number,
    default: 0,
    min: [0, 'Usage count cannot be negative']
  },
  
  active: {
    type: Boolean,
    default: true
  },
  
  bufferBefore: {
    type: Number,
    default: 0,
    min: [0, 'Buffer time cannot be negative'],
    max: [120, 'Buffer time cannot exceed 120 minutes']
  },
  
  bufferAfter: {
    type: Number,
    default: 0,
    min: [0, 'Buffer time cannot be negative'],
    max: [120, 'Buffer time cannot exceed 120 minutes']
  },
  
  maxAdvanceDays: {
    type: Number,
    default: 14,
    min: [1, 'Maximum advance days must be at least 1'],
    max: [365, 'Maximum advance days cannot exceed 365']
  },

  requiresApproval: {
    type: Boolean,
    default: false
  },
  
  approvers: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      validate: {
        validator: async function(value) {
          // Check if the referenced approver exists
          const user = await mongoose.model('User').findById(value);
          return user !== null;
        },
        message: 'Referenced approver does not exist'
      }
    }],
    validate: {
      validator: function(approvers) {
        // If approval is required, there should be at least one approver
        if (this.requiresApproval && approvers.length === 0) {
          return false;
        }
        return true;
      },
      message: 'At least one approver is required when approval is needed'
    }
  },

  notificationEmail: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(value) {
        if (!value) return true;
        return validator.isEmail(value);
      },
      message: 'Please provide a valid notification email'
    }
  },

  color: {
    type: String,
    default: '#3498db',
    validate: {
      validator: function(val) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val);
      },
      message: 'Please provide a valid hex color code'
    }
  },

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

// Pre-save hooks
linkSchema.pre('save', function(next) {
  // Generate linkId if not provided
  if (!this.linkId) {
    this.linkId = Math.random().toString(36).substring(2, 10);
  }

  // Ensure notification email is lowercase and trimmed
  if (this.notificationEmail) {
    this.notificationEmail = this.notificationEmail.toLowerCase().trim();
  }

  // Update the timestamp
  this.updatedAt = Date.now();
  next();
});

// Error handling for duplicate linkId
linkSchema.post('save', function(error, doc, next) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    next(new Error('This link ID is already in use. Please choose a different one.'));
  } else {
    next(error);
  }
});

// Indexes for better query performance
linkSchema.index({ ownerId: 1 });
linkSchema.index({ linkId: 1 }, { unique: true });
linkSchema.index({ active: 1, expirationDate: 1 });
linkSchema.index({ meetingName: 'text', description: 'text' });

// Virtual for checking if link is expired
linkSchema.virtual('isExpired').get(function() {
  return this.expirationDate && this.expirationDate < new Date();
});

// Virtual for checking if link has reached usage limit
linkSchema.virtual('hasReachedLimit').get(function() {
  return this.usageLimit > 0 && this.usageCount >= this.usageLimit;
});

// Method to check if link is available for booking
linkSchema.methods.isAvailable = function() {
  return this.active && 
         !this.isExpired && 
         !this.hasReachedLimit;
};

module.exports = mongoose.model('Link', linkSchema);