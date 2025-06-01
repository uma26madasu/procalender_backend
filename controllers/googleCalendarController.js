const { google } = require('googleapis');
const User = require('../models/User');

console.log('📝 Loading googleCalendarController...');

// Create authenticated OAuth2 client
const createAuthenticatedClient = async (user) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://procalender-frontend-uma26madasus-projects.vercel.app/auth/google/callback'
  );

  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    expiry_date: user.tokenExpiry
  });

  // Check if token needs refresh
  const now = new Date();
  const tokenExpiry = new Date(user.tokenExpiry);
  
  if (now >= tokenExpiry && user.refreshToken) {
    console.log('🔄 Refreshing expired access token...');
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      user.accessToken = credentials.access_token;
      if (credentials.refresh_token) {
        user.refreshToken = credentials.refresh_token;
      }
      user.tokenExpiry = credentials.expiry_date;
      await user.save();
      
      console.log('✅ Access token refreshed');
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      throw new Error('Token refresh failed');
    }
  }

  return oauth2Client;
};

// Get calendar events
const getCalendarEvents = async (req, res) => {
  try {
    console.log('🔄 Fetching calendar events...');
    console.log('   Method:', req.method);
    console.log('   Query:', req.query);
    console.log('   Headers Auth:', req.headers.authorization ? 'Present' : 'Missing');

    const email = req.query.email || 
                  req.body.email || 
                  (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required',
        debug: {
          queryEmail: req.query.email,
          bodyEmail: req.body.email,
          authHeader: req.headers.authorization
        }
      });
    }

    console.log('🔍 Looking for user:', email);

    const user = await User.findOne({ email: email });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found. Please connect your Google Calendar first.',
        email: email
      });
    }

    if (!user.accessToken) {
      return res.status(401).json({
        success: false,
        message: 'No valid access token. Please reconnect your Google Calendar.',
        email: email
      });
    }

    console.log('✅ User found:', user.email);

    const oauth2Client = await createAuthenticatedClient(user);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    console.log('🔄 Fetching events from Google Calendar...');
    
    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setMonth(timeMax.getMonth() + 1);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    console.log(`✅ Found ${events.length} events for ${user.email}`);

    const formattedEvents = events.map(event => ({
      id: event.id,
      summary: event.summary || 'No Title',
      description: event.description || '',
      start: event.start,
      end: event.end,
      location: event.location || '',
      attendees: event.attendees || [],
      creator: event.creator,
      organizer: event.organizer,
      status: event.status,
      htmlLink: event.htmlLink
    }));

    res.json({
      success: true,
      message: `Found ${events.length} events`,
      events: formattedEvents,
      user: {
        email: user.email,
        name: user.name
      },
      debug: {
        totalEvents: events.length,
        timeRange: {
          from: timeMin.toISOString(),
          to: timeMax.toISOString()
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching calendar events:', error);
    
    let errorMessage = 'Failed to fetch calendar events';
    let statusCode = 500;
    
    if (error.message.includes('invalid_grant')) {
      errorMessage = 'Authentication expired. Please reconnect your Google Calendar.';
      statusCode = 401;
    } else if (error.message.includes('insufficient permissions')) {
      errorMessage = 'Insufficient permissions to access calendar.';
      statusCode = 403;
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
      debug: {
        errorType: error.constructor.name,
        errorCode: error.code
      }
    });
  }
};

// Get available calendars
const getCalendars = async (req, res) => {
  try {
    console.log('🔄 Fetching available calendars...');
    
    const email = req.query.email || 
                  req.body.email || 
                  (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required'
      });
    }

    const user = await User.findOne({ email: email });
    
    if (!user || !user.accessToken) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const oauth2Client = await createAuthenticatedClient(user);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.calendarList.list();
    const calendars = response.data.items || [];

    console.log(`✅ Found ${calendars.length} calendars for ${user.email}`);

    res.json({
      success: true,
      calendars: calendars.map(cal => ({
        id: cal.id,
        summary: cal.summary,
        description: cal.description,
        primary: cal.primary,
        accessRole: cal.accessRole
      })),
      user: {
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('❌ Error fetching calendars:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calendars',
      error: error.message
    });
  }
};

// Check for calendar conflicts
const checkConflicts = async (req, res) => {
  try {
    console.log('🔄 Checking calendar conflicts...');
    
    const { email, startTime, endTime, excludeEventId } = req.body;

    if (!email || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Email, startTime, and endTime are required'
      });
    }

    const user = await User.findOne({ email: email });
    
    if (!user || !user.accessToken) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const oauth2Client = await createAuthenticatedClient(user);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startTime,
      timeMax: endTime,
      singleEvents: true,
      orderBy: 'startTime',
    });

    let conflicts = response.data.items || [];
    
    if (excludeEventId) {
      conflicts = conflicts.filter(event => event.id !== excludeEventId);
    }

    console.log(`✅ Found ${conflicts.length} potential conflicts`);

    res.json({
      success: true,
      hasConflicts: conflicts.length > 0,
      conflicts: conflicts.map(event => ({
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end,
        status: event.status
      })),
      timeRange: {
        start: startTime,
        end: endTime
      }
    });

  } catch (error) {
    console.error('❌ Error checking conflicts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check conflicts',
      error: error.message
    });
  }
};

console.log('✅ googleCalendarController functions defined');

// Export all functions
module.exports = {
  getCalendarEvents,
  getCalendars,
  checkConflicts
};

console.log('✅ googleCalendarController exported successfully');