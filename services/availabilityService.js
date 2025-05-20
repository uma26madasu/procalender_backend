// services/availabilityService.js
const Window = require('../models/Window');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { google } = require('googleapis');

// Configure OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Get available time slots for a user
 */
exports.getAvailableTimeSlots = async (userId, startDate, endDate, durationMinutes) => {
  try {
    // 1. Get user's availability windows
    const windows = await Window.find({ ownerId: userId, active: true });
    
    // 2. Get existing bookings
    const bookings = await Booking.find({
      ownerId: userId,
      startTime: { $gte: startDate },
      endTime: { $lte: endDate },
      status: { $ne: 'canceled' }
    });
    
    // 3. Check Google Calendar for busy periods
    const user = await User.findById(userId);
    const busyPeriods = await getGoogleCalendarBusyPeriods(user, startDate, endDate);
    
    // 4. Generate available slots
    const availableSlots = generateTimeSlots(windows, bookings, busyPeriods, startDate, endDate, durationMinutes);
    
    return availableSlots;
  } catch (error) {
    console.error('Error getting available time slots:', error);
    throw error;
  }
};

/**
 * Get busy periods from Google Calendar
 * @private
 */
async function getGoogleCalendarBusyPeriods(user, startDate, endDate) {
  if (!user || !user.googleTokens) {
    return [];
  }
  
  try {
    // Set credentials
    oauth2Client.setCredentials(user.googleTokens);
    
    // Initialize calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Get list of calendars
    const calendarList = await calendar.calendarList.list();
    const calendarIds = calendarList.data.items.map(cal => cal.id);
    
    // Call freebusy API
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: calendarIds.map(id => ({ id }))
      }
    });
    
    // Extract busy periods
    const busyPeriods = [];
    const calendarsResponse = response.data.calendars;
    
    Object.keys(calendarsResponse).forEach(calId => {
      const calendarBusy = calendarsResponse[calId].busy || [];
      calendarBusy.forEach(period => {
        busyPeriods.push({
          start: new Date(period.start),
          end: new Date(period.end)
        });
      });
    });
    
    return busyPeriods;
  } catch (error) {
    console.error('Error getting Google Calendar busy periods:', error);
    return [];
  }
}

/**
 * Generate available time slots
 * @private
 */
function generateTimeSlots(windows, bookings, busyPeriods, startDate, endDate, durationMinutes) {
  const slots = [];
  const interval = durationMinutes * 60 * 1000; // convert to milliseconds
  
  // Clone startDate to avoid modifying the original
  const currentDate = new Date(startDate);
  
  // Set time to midnight
  currentDate.setHours(0, 0, 0, 0);
  
  // For each day in the date range
  while (currentDate <= endDate) {
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentDate.getDay()];
    
    // Find windows for this day of week
    const dayWindows = windows.filter(window => window.dayOfWeek === dayOfWeek);
    
    // For each window on this day
    for (const window of dayWindows) {
      // Parse window hours
      const [startHour, startMinute] = window.startHour.split(':').map(Number);
      const [endHour, endMinute] = window.endHour.split(':').map(Number);
      
      // Set window start and end times for this specific date
      const windowStart = new Date(currentDate);
      windowStart.setHours(startHour, startMinute, 0, 0);
      
      const windowEnd = new Date(currentDate);
      windowEnd.setHours(endHour, endMinute, 0, 0);
      
      // Generate slots within this window
      let slotStart = new Date(windowStart);
      
      while (slotStart < windowEnd) {
        const slotEnd = new Date(slotStart.getTime() + interval);
        
        // Ensure slot doesn't go beyond window end
        if (slotEnd > windowEnd) {
          break;
        }
        
        // Check if slot conflicts with any booking
        const hasBookingConflict = bookings.some(booking => {
          const bookingStart = new Date(booking.startTime);
          const bookingEnd = new Date(booking.endTime);
          
          return (
            (slotStart >= bookingStart && slotStart < bookingEnd) ||
            (slotEnd > bookingStart && slotEnd <= bookingEnd) ||
            (slotStart <= bookingStart && slotEnd >= bookingEnd)
          );
        });
        
        // Check if slot conflicts with any Google Calendar event
        const hasGoogleConflict = busyPeriods.some(period => {
          return (
            (slotStart >= period.start && slotStart < period.end) ||
            (slotEnd > period.start && slotEnd <= period.end) ||
            (slotStart <= period.start && slotEnd >= period.end)
          );
        });
        
        // If no conflicts, add slot
        if (!hasBookingConflict && !hasGoogleConflict) {
          slots.push({
            start: new Date(slotStart),
            end: new Date(slotEnd)
          });
        }
        
        // Move to next slot
        slotStart = new Date(slotStart.getTime() + interval);
      }
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return slots;
}