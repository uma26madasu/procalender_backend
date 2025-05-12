const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose'); // Add this for MongoDB connection
const { google } = require('googleapis'); // Add this for Google API
require('dotenv').config(); // Add this for environment variables

// Import models
const User = require('./models/User');
const Window = require('./models/Window');
const Link = require('./models/Link');
const Booking = require('./models/Booking');

// Import utilities
const emailService = require('./utils/emailService');

const app = express();

// Configure Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Enable CORS for all routes
app.use(cors({
  origin: [
    'https://procalender-frontend.vercel.app',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Essential middleware
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Health check endpoint (required for Render)
app.get('/', (req, res) => {
  res.json({ 
    status: 'Backend running',
    endpoints: {
      auth: {
        googleAuthUrl: 'GET /api/auth/google/url',
        googleCallback: 'POST /api/auth/google/callback',
        googleRevoke: 'POST /api/auth/google/revoke'
      },
      scheduling: {
        createWindow: 'POST /api/create-window',
        createLink: 'POST /api/create-link',
        availableTimes: 'GET /api/available-times/:linkId',
        schedule: 'POST /api/schedule/:linkId'
      },
      meetings: {
        getMeetings: 'GET /api/meetings',
        updateMeeting: 'PUT /api/meetings/:meetingId',
        deleteMeeting: 'DELETE /api/meetings/:meetingId'
      }
    }
  });
});

// Google OAuth routes
app.get('/api/auth/google/url', (req, res) => {
  // Generate a URL for OAuth consent
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    prompt: 'consent'  // Force to always show consent screen to get refresh_token
  });
  
  res.json({ success: true, url: authUrl });
});

app.post('/api/auth/google/callback', async (req, res) => {
  try {
    const { code, userId } = req.body;
    
    if (!code || !userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing code or userId' 
      });
    }
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Set credentials to get user info
    oauth2Client.setCredentials(tokens);
    
    // Get user info to confirm email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    // Find and update user with tokens
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Store tokens securely
    user.googleTokens = tokens;
    user.googleEmail = userInfo.data.email;
    
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Google Calendar connected successfully',
      email: userInfo.data.email
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to connect Google Calendar',
      error: error.message
    });
  }
});

app.post('/api/auth/google/revoke', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing userId' 
      });
    }
    
    // Find user
    const user = await User.findById(userId);
    
    if (!user || !user.googleTokens) {
      return res.status(404).json({ 
        success: false, 
        message: 'User or tokens not found' 
      });
    }
    
    // Revoke access
    const tokens = user.googleTokens;
    if (tokens.access_token) {
      try {
        await oauth2Client.revokeToken(tokens.access_token);
      } catch (revokeError) {
        console.error('Token revocation error:', revokeError);
        // Continue even if revocation fails
      }
    }
    
    // Remove tokens from user
    user.googleTokens = undefined;
    user.googleEmail = undefined;
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Google Calendar disconnected successfully' 
    });
  } catch (error) {
    console.error('Revoke access error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to disconnect Google Calendar' 
    });
  }
});

// Your existing routes - replace the placeholder comments with actual implementations
app.post('/api/create-window', async (req, res) => {
  try {
    const { userId, dayOfWeek, startHour, endHour } = req.body;
    
    if (!userId || !dayOfWeek || !startHour || !endHour) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    // Create new window
    const window = new Window({
      ownerId: userId,
      dayOfWeek,
      startHour,
      endHour
    });
    
    await window.save();
    
    res.status(201).json({ 
      success: true, 
      window: {
        id: window._id,
        dayOfWeek: window.dayOfWeek,
        startHour: window.startHour,
        endHour: window.endHour
      },
      message: 'Availability window created successfully'
    });
  } catch (error) {
    console.error('Error creating window:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error creating window' 
    });
  }
});

app.post('/api/create-link', async (req, res) => {
  try {
    const { 
      userId, 
      meetingName, 
      meetingLength, 
      description,
      questions
    } = req.body;
    
    if (!userId || !meetingName || !meetingLength) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    // Generate unique link ID
    const linkId = Math.random().toString(36).substring(2, 10);
    
    // Create new link
    const link = new Link({
      ownerId: userId,
      linkId,
      meetingName,
      meetingLength,
      description: description || '',
      questions: questions || [],
      usageCount: 0,
      active: true
    });
    
    await link.save();
    
    res.status(201).json({ 
      success: true, 
      link: {
        id: link._id,
        linkId: link.linkId,
        meetingName: link.meetingName,
        meetingLength: link.meetingLength,
        url: `https://procalender-frontend.vercel.app/schedule/${link.linkId}`
      },
      message: 'Scheduling link created successfully'
    });
  } catch (error) {
    console.error('Error creating link:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error creating link' 
    });
  }
});

app.get('/api/available-times/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;
    
    // Find the link
    const link = await Link.findOne({ linkId });
    
    if (!link) {
      return res.status(404).json({ 
        success: false, 
        message: 'Scheduling link not found' 
      });
    }
    
    // Find owner's availability windows
    const windows = await Window.find({ ownerId: link.ownerId });
    
    if (!windows || windows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No availability windows found for this advisor' 
      });
    }
    
    // Find existing bookings
    const existingBookings = await Booking.find({
      ownerId: link.ownerId,
      status: 'confirmed',
      startTime: { $gte: new Date() }
    });
    
    // Generate available times
    // This is a simplified implementation - in a real app, you'd:
    // 1. Check Google Calendar for existing events if connected
    // 2. Apply more sophisticated availability calculations
    
    const availableTimes = {};
    const now = new Date();
    
    // Generate times for the next 14 days
    for (let i = 0; i < 14; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);
      
      // Get day of week (0 = Sunday, 1 = Monday, etc.)
      const dayOfWeek = date.getDay();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      // Find window for this day
      const window = windows.find(w => w.dayOfWeek === dayNames[dayOfWeek]);
      
      if (window) {
        const dateStr = date.toISOString().split('T')[0];
        availableTimes[dateStr] = [];
        
        // Parse start and end hours
        const [startHour, startMinute] = window.startHour.split(':').map(Number);
        const [endHour, endMinute] = window.endHour.split(':').map(Number);
        
        // Generate time slots
        const startTime = new Date(date);
        startTime.setHours(startHour, startMinute, 0, 0);
        
        const endTime = new Date(date);
        endTime.setHours(endHour, endMinute, 0, 0);
        
        // Generate slots at 30-minute intervals
        const slotInterval = 30; // minutes
        
        for (
          let slotTime = new Date(startTime); 
          slotTime < endTime; 
          slotTime.setMinutes(slotTime.getMinutes() + slotInterval)
        ) {
          // Skip times in the past
          if (slotTime <= now) continue;
          
          // Check if the slot + meeting length fits within the window
          const slotEndTime = new Date(slotTime);
          slotEndTime.setMinutes(slotEndTime.getMinutes() + link.meetingLength);
          
          if (slotEndTime > endTime) continue;
          
          // Check for conflicts with existing bookings
          const hasConflict = existingBookings.some(booking => {
            const bookingStart = new Date(booking.startTime);
            const bookingEnd = new Date(booking.endTime);
            
            return (
              (slotTime >= bookingStart && slotTime < bookingEnd) ||
              (slotEndTime > bookingStart && slotEndTime <= bookingEnd) ||
              (slotTime <= bookingStart && slotEndTime >= bookingEnd)
            );
          });
          
          if (!hasConflict) {
            availableTimes[dateStr].push(slotTime.toISOString());
          }
        }
        
        // Remove date if no times available
        if (availableTimes[dateStr].length === 0) {
          delete availableTimes[dateStr];
        }
      }
    }
    
    res.json({ 
      success: true, 
      meetingName: link.meetingName,
      meetingLength: link.meetingLength,
      availableTimes
    });
  } catch (error) {
    console.error('Error getting available times:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error getting available times' 
    });
  }
});

app.post('/api/schedule/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;
    const { 
      name, 
      email, 
      linkedinUrl, 
      selectedTime,
      questionAnswers // Object containing answers to custom questions
    } = req.body;
    
    // Validate input
    if (!name || !email || !selectedTime) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    // Find the link
    const link = await Link.findOne({ linkId });
    
    if (!link) {
      return res.status(404).json({ 
        success: false, 
        message: 'Scheduling link not found' 
      });
    }
    
    // Calculate end time based on meeting length
    const startTime = new Date(selectedTime);
    const endTime = new Date(startTime.getTime() + link.meetingLength * 60000);
    
    // Find the owner to get their Google calendar tokens
    const owner = await User.findById(link.ownerId);
    
    if (!owner) {
      return res.status(400).json({ 
        success: false, 
        message: 'Advisor account not found' 
      });
    }
    
    // Prepare questions and answers array
    const questions = [];
    
    if (link.questions && link.questions.length > 0 && questionAnswers) {
      link.questions.forEach(question => {
        if (questionAnswers[question.id]) {
          questions.push({
            question: question.label,
            answer: questionAnswers[question.id]
          });
        }
      });
    }
    
    // Create the booking
    const booking = new Booking({
      linkId: link._id,
      ownerId: link.ownerId,
      clientName: name,
      clientEmail: email,
      linkedinUrl: linkedinUrl || '',
      meetingName: link.meetingName,
      startTime,
      endTime,
      status: 'confirmed',
      questions
    });
    
    await booking.save();
    
    // Increment link usage count
    link.usageCount = (link.usageCount || 0) + 1;
    await link.save();
    
    // If Google Calendar integration is enabled and tokens exist
    let googleEventId = null;
    
    if (owner.googleTokens) {
      try {
        // Set up Google Calendar API
        oauth2Client.setCredentials(owner.googleTokens);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        
        // Create calendar event
        const event = {
          summary: `${link.meetingName} with ${name}`,
          description: `Meeting with ${name} (${email})`,
          start: {
            dateTime: startTime.toISOString(),
            timeZone: 'UTC'
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: 'UTC'
          },
          attendees: [
            { email: owner.email },
            { email: email }
          ]
        };
        
        const createdEvent = await calendar.events.insert({
          calendarId: 'primary',
          resource: event,
          sendUpdates: 'all'
        });
        
        googleEventId = createdEvent.data.id;
        
        // Update booking with Google event ID
        booking.googleEventId = googleEventId;
        await booking.save();
      } catch (calendarError) {
        console.error('Error creating calendar event:', calendarError);
        // We'll continue even if calendar creation fails
      }
    }
    
    // Send email notifications
    try {
      await emailService.sendAdvisorNotification(booking, owner, link);
      await emailService.sendClientConfirmation(booking);
    } catch (emailError) {
      console.error('Error sending email notifications:', emailError);
      // Continue even if email sending fails
    }
    
    res.status(201).json({ 
      success: true, 
      booking: {
        id: booking._id,
        startTime: booking.startTime,
        endTime: booking.endTime,
        googleEventId
      },
      message: 'Meeting scheduled successfully'
    });
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error scheduling meeting' 
    });
  }
});

// Get meetings for a user
app.get('/api/meetings', async (req, res) => {
  try {
    const { userId, status, startDate, endDate } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing userId parameter' 
      });
    }
    
    // Build query
    const query = { ownerId: userId };
    
    // Add status filter if provided
    if (status) {
      query.status = status;
    }
    
    // Add date range filter if provided
    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) {
        query.startTime.$gte = new Date(startDate);
      }
      if (endDate) {
        query.startTime.$lte = new Date(endDate);
      }
    }
    
    // Find meetings
    const meetings = await Booking.find(query)
      .sort({ startTime: 1 }) // Sort by start time
      .populate('linkId', 'meetingName meetingLength'); // Get link details
    
    res.json({ 
      success: true, 
      meetings: meetings.map(meeting => ({
        id: meeting._id,
        clientName: meeting.clientName,
        clientEmail: meeting.clientEmail,
        linkedinUrl: meeting.linkedinUrl,
        meetingName: meeting.meetingName || (meeting.linkId ? meeting.linkId.meetingName : 'Unnamed Meeting'),
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        status: meeting.status,
        questions: meeting.questions,
        googleEventId: meeting.googleEventId
      }))
    });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching meetings' 
    });
  }
});

// Update meeting status
app.put('/api/meetings/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing status parameter' 
      });
    }
    
    // Validate status
    if (!['confirmed', 'canceled', 'completed'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status value' 
      });
    }
    
    // Find and update meeting
    const meeting = await Booking.findById(meetingId);
    
    if (!meeting) {
      return res.status(404).json({ 
        success: false, 
        message: 'Meeting not found' 
      });
    }
    
    // Update status
    meeting.status = status;
    await meeting.save();
    
    // If canceling and Google Calendar integration is enabled
    if (status === 'canceled' && meeting.googleEventId) {
      try {
        // Find owner to get Google tokens
        const owner = await User.findById(meeting.ownerId);
        
        if (owner && owner.googleTokens) {
          // Set up Google Calendar API
          oauth2Client.setCredentials(owner.googleTokens);
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          
          // Delete or update the event
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: meeting.googleEventId,
            sendUpdates: 'all'
          });
        }
      } catch (calendarError) {
        console.error('Error updating calendar event:', calendarError);
        // Continue even if calendar update fails
      }
    }
    
    res.json({ 
      success: true, 
      meeting: {
        id: meeting._id,
        status: meeting.status
      },
      message: `Meeting ${status === 'canceled' ? 'canceled' : 'updated'} successfully`
    });
  } catch (error) {
    console.error('Error updating meeting:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error updating meeting' 
    });
  }
});

// Delete meeting
app.delete('/api/meetings/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    // Find the meeting
    const meeting = await Booking.findById(meetingId);
    
    if (!meeting) {
      return res.status(404).json({ 
        success: false, 
        message: 'Meeting not found' 
      });
    }
    
    // If Google Calendar integration is enabled
    if (meeting.googleEventId) {
      try {
        // Find owner to get Google tokens
        const owner = await User.findById(meeting.ownerId);
        
        if (owner && owner.googleTokens) {
          // Set up Google Calendar API
          oauth2Client.setCredentials(owner.googleTokens);
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          
          // Delete the event
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: meeting.googleEventId,
            sendUpdates: 'all'
          });
        }
      } catch (calendarError) {
        console.error('Error deleting calendar event:', calendarError);
        // Continue even if calendar deletion fails
      }
    }
    
    // Delete the meeting
    await Booking.findByIdAndDelete(meetingId);
    
    res.json({ 
      success: true, 
      message: 'Meeting deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting meeting:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error deleting meeting' 
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));