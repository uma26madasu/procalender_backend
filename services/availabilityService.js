const moment = require('moment-timezone');
const { google } = require('googleapis');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Window = require('../models/Window');

// Configure OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Get available time slots for a user
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {number} durationMinutes - Duration in minutes
 * @param {string} timezone - Timezone
 * @returns {Array} Available time slots
 */
exports.getAvailableTimeSlots = async (
  userId,
  startDate,
  endDate,
  durationMinutes,
  timezone = 'UTC'
) => {
  try {
    // 1. Get user's availability settings
    const user = await User.findById(userId).lean();
    if (!user) {
      throw new Error('User not found');
    }

    // Use custom windows if available, otherwise fall back to default working hours
    const windows = await Window.find({ ownerId: userId, active: true });
    const availabilitySettings = user.availabilitySettings || {
      workingHours: [
        { day: 0, start: '09:00', end: '17:00', isWorking: false }, // Sunday
        { day: 1, start: '09:00', end: '17:00', isWorking: true },  // Monday
        { day: 2, start: '09:00', end: '17:00', isWorking: true },  // Tuesday
        { day: 3, start: '09:00', end: '17:00', isWorking: true },  // Wednesday
        { day: 4, start: '09:00', end: '17:00', isWorking: true },  // Thursday
        { day: 5, start: '09:00', end: '17:00', isWorking: true },  // Friday
        { day: 6, start: '09:00', end: '17:00', isWorking: false }  // Saturday
      ],
      bufferTime: 15, // Buffer time in minutes
      minimumNotice: 60 // Minimum notice in minutes
    };

    // 2. Get existing bookings
    const existingBookings = await Booking.find({
      ownerId: userId,
      status: { $ne: 'cancelled' },
      startTime: { $gte: startDate, $lte: endDate }
    }).lean();

    // 3. Get Google Calendar events if connected
    let busyPeriods = [];
    if (user.googleTokens) {
      busyPeriods = await getGoogleCalendarBusyPeriods(user, startDate, endDate);
    }

    // 4. Generate all possible time slots
    const allTimeSlots = windows.length > 0 
      ? generateTimeSlotsFromWindows(windows, startDate, endDate, durationMinutes, timezone)
      : generateAllPossibleTimeSlots(
          startDate,
          endDate,
          durationMinutes,
          availabilitySettings,
          timezone
        );

    // 5. Filter out unavailable time slots
    const availableTimeSlots = filterAvailableTimeSlots(
      allTimeSlots,
      existingBookings,
      busyPeriods,
      durationMinutes,
      availabilitySettings,
      timezone
    );

    return availableTimeSlots;
  } catch (error) {
    console.error('Error generating available time slots:', error);
    throw error;
  }
};

/**
 * Get busy periods from Google Calendar
 * @private
 */
async function getGoogleCalendarBusyPeriods(user, startDate, endDate) {
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
 * Generate time slots from custom availability windows
 * @private
 */
function generateTimeSlotsFromWindows(windows, startDate, endDate, durationMinutes, timezone) {
  const slots = [];
  const interval = durationMinutes * 60 * 1000; // convert to milliseconds
  const currentDate = new Date(startDate);
  
  // For each day in the date range
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    const dayWindows = windows.filter(window => window.dayOfWeek === ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]);
    
    // For each window on this day
    for (const window of dayWindows) {
      // Parse window hours
      const [startHour, startMinute] = window.startHour.split(':').map(Number);
      const [endHour, endMinute] = window.endHour.split(':').map(Number);
      
      // Set window start and end times for this specific date
      const windowStart = moment(currentDate).tz(timezone)
        .set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
      
      const windowEnd = moment(currentDate).tz(timezone)
        .set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });
      
      // Generate slots within this window
      let slotStart = windowStart.clone();
      
      while (slotStart.isBefore(windowEnd)) {
        const slotEnd = slotStart.clone().add(durationMinutes, 'minutes');
        
        // Ensure slot doesn't go beyond window end
        if (slotEnd.isAfter(windowEnd)) {
          break;
        }
        
        slots.push({
          startTime: slotStart.toDate(),
          endTime: slotEnd.toDate()
        });
        
        // Move to next slot
        slotStart.add(durationMinutes, 'minutes');
      }
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return slots;
}

/**
 * Generate all possible time slots within working hours
 * @private
 */
function generateAllPossibleTimeSlots(
  startDate,
  endDate,
  duration,
  availabilitySettings,
  timezone
) {
  const { workingHours, bufferTime, minimumNotice } = availabilitySettings;
  const timeSlots = [];
  const slotInterval = Math.min(duration, 30); // Use smaller value for better granularity
  const nowPlusNotice = moment().tz(timezone).add(minimumNotice, 'minutes');
  
  let currentDate = moment(startDate).tz(timezone).startOf('day');
  
  while (currentDate.isSameOrBefore(moment(endDate).tz(timezone))) {
    const dayOfWeek = currentDate.day();
    const daySettings = workingHours.find(day => day.day === dayOfWeek);
    
    if (daySettings?.isWorking) {
      const startTime = moment(currentDate)
        .set({
          hour: parseInt(daySettings.start.split(':')[0], 10),
          minute: parseInt(daySettings.start.split(':')[1], 10)
        });
      
      const endTime = moment(currentDate)
        .set({
          hour: parseInt(daySettings.end.split(':')[0], 10),
          minute: parseInt(daySettings.end.split(':')[1], 10)
        });
      
      // Adjust start time if it's today and already past minimum notice
      if (currentDate.isSame(moment(), 'day')) {
        startTime.max(nowPlusNotice);
      }
      
      let slotStart = startTime.clone();
      
      while (slotStart.add(slotInterval, 'minutes').isSameOrBefore(endTime.subtract(duration, 'minutes'))) {
        timeSlots.push({
          startTime: slotStart.clone().toDate(),
          endTime: slotStart.clone().add(duration, 'minutes').toDate()
        });
      }
    }
    
    currentDate.add(1, 'day');
  }
  
  return timeSlots;
}

/**
 * Filter available time slots
 * @private
 */
function filterAvailableTimeSlots(
  allTimeSlots,
  existingBookings,
  busyPeriods,
  duration,
  availabilitySettings,
  timezone
) {
  const { bufferTime } = availabilitySettings;
  
  const bookings = existingBookings.map(booking => ({
    start: moment(booking.startTime).tz(timezone),
    end: moment(booking.endTime).tz(timezone)
  }));
  
  return allTimeSlots.filter(slot => {
    const slotStart = moment(slot.startTime).tz(timezone);
    const slotEnd = moment(slot.endTime).tz(timezone);
    const bufferedStart = slotStart.clone().subtract(bufferTime, 'minutes');
    const bufferedEnd = slotEnd.clone().add(bufferTime, 'minutes');
    
    // Check booking conflicts
    const hasBookingConflict = bookings.some(booking => 
      bufferedStart.isBefore(booking.end) && bufferedEnd.isAfter(booking.start)
    );
    
    if (hasBookingConflict) return false;
    
    // Check Google Calendar conflicts
    const hasGoogleConflict = busyPeriods.some(period => {
      const periodStart = moment(period.start).tz(timezone);
      const periodEnd = moment(period.end).tz(timezone);
      return bufferedStart.isBefore(periodEnd) && bufferedEnd.isAfter(periodStart);
    });
    
    return !hasGoogleConflict;
  });
}