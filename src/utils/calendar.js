const { createClient } = require('@supabase/supabase-js');
const moment = require('moment-timezone');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/**
 * Get a user's calendar by ID
 * @param {string} calendarId - Calendar ID
 * @returns {Promise<Object|null>} Calendar object or null if not found
 */
async function getCalendar(calendarId) {
  const { data, error } = await supabase
    .from('calendars')
    .select('*, users(*)')
    .eq('id', calendarId)
    .single();
  
  if (error) {
    console.error('Error fetching calendar:', error);
    return null;
  }
  
  return data;
}

/**
 * Get all meetings for a calendar
 * @param {string} calendarId - Calendar ID
 * @param {Object} options - Query options
 * @param {string} options.startDate - Start date (ISO string)
 * @param {string} options.endDate - End date (ISO string)
 * @param {string} options.status - Meeting status filter
 * @returns {Promise<Array>} Array of meeting objects
 */
async function getCalendarMeetings(calendarId, options = {}) {
  let query = supabase
    .from('meetings')
    .select('*')
    .eq('calendar_id', calendarId);
  
  if (options.startDate) {
    query = query.gte('start_time', options.startDate);
  }
  
  if (options.endDate) {
    query = query.lte('end_time', options.endDate);
  }
  
  if (options.status) {
    query = query.eq('status', options.status);
  }
  
  query = query.order('start_time', { ascending: true });
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching calendar meetings:', error);
    return [];
  }
  
  return data;
}

/**
 * Check if a time slot is available for a calendar
 * @param {string} calendarId - Calendar ID
 * @param {string} startTime - Start time (ISO string)
 * @param {string} endTime - End time (ISO string)
 * @returns {Promise<boolean>} True if the time slot is available
 */
async function isTimeSlotAvailable(calendarId, startTime, endTime) {
  // Get the calendar
  const calendar = await getCalendar(calendarId);
  
  if (!calendar) {
    return false;
  }
  
  // Check if the time is within the user's availability
  const isWithinAvailability = checkTimeAgainstAvailability(
    startTime,
    endTime,
    calendar.availability,
    calendar.users.timezone
  );
  
  if (!isWithinAvailability) {
    return false;
  }
  
  // Check for conflicts with existing meetings
  const { count, error } = await supabase
    .from('meetings')
    .select('id', { count: 'exact' })
    .eq('calendar_id', calendarId)
    .eq('status', 'confirmed')
    .or(`start_time.lte.${endTime},end_time.gte.${startTime}`);
  
  if (error) {
    console.error('Error checking for meeting conflicts:', error);
    return false;
  }
  
  return count === 0;
}

/**
 * Check if a time is within a user's availability
 * @param {string} startTime - Start time (ISO string)
 * @param {string} endTime - End time (ISO string)
 * @param {Object} availability - User's availability settings
 * @param {string} timezone - User's timezone
 * @returns {boolean} True if the time is within availability
 */
function checkTimeAgainstAvailability(startTime, endTime, availability, timezone) {
  if (!availability || !timezone) {
    return false;
  }
  
  const start = moment(startTime).tz(timezone);
  const end = moment(endTime).tz(timezone);
  
  // Check if it's a weekday or weekend
  const isWeekend = start.day() === 0 || start.day() === 6;
  
  // Get the appropriate availability settings
  const availSettings = isWeekend ? availability.weekends : availability.weekdays;
  
  // If weekend and not available on weekends
  if (isWeekend && (!availSettings || !availSettings.available)) {
    return false;
  }
  
  // If no specific time settings
  if (!availSettings || !availSettings.start || !availSettings.end) {
    return false;
  }
  
  // Parse availability times
  const availStart = moment.tz(`${start.format('YYYY-MM-DD')} ${availSettings.start}`, 'YYYY-MM-DD h:mm A', timezone);
  const availEnd = moment.tz(`${start.format('YYYY-MM-DD')} ${availSettings.end}`, 'YYYY-MM-DD h:mm A', timezone);
  
  // Check if meeting is within availability
  return start.isSameOrAfter(availStart) && end.isSameOrBefore(availEnd);
}

/**
 * Find available time slots for a group of users
 * @param {Array} userIds - Array of user IDs
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} duration - Meeting duration in minutes
 * @returns {Promise<Array>} Array of available time slots
 */
async function findGroupAvailability(userIds, startDate, endDate, duration) {
  // Get all users' calendars
  const { data: calendars, error } = await supabase
    .from('calendars')
    .select('*, users!inner(*)')
    .in('users.user_id', userIds);
  
  if (error) {
    console.error('Error fetching user calendars:', error);
    return [];
  }
  
  if (!calendars || calendars.length === 0) {
    return [];
  }
  
  // Get all meetings for these calendars
  const calendarIds = calendars.map(cal => cal.id);
  const { data: meetings, meetingsError } = await supabase
    .from('meetings')
    .select('*')
    .in('calendar_id', calendarIds)
    .gte('end_time', `${startDate}T00:00:00Z`)
    .lte('start_time', `${endDate}T23:59:59Z`)
    .eq('status', 'confirmed');
  
  if (meetingsError) {
    console.error('Error fetching meetings:', meetingsError);
    return [];
  }
  
  // Group meetings by user
  const meetingsByUser = {};
  calendars.forEach(cal => {
    const userId = cal.users.user_id;
    meetingsByUser[userId] = meetings.filter(m => m.calendar_id === cal.id);
  });
  
  // Group availability by user
  const availabilityByUser = {};
  calendars.forEach(cal => {
    const userId = cal.users.user_id;
    availabilityByUser[userId] = {
      timezone: cal.users.timezone,
      availability: cal.availability
    };
  });
  
  // Generate potential time slots
  const timeSlots = generateTimeSlots(startDate, endDate, duration);
  
  // Filter time slots based on all users' availability
  const availableSlots = timeSlots.filter(slot => {
    return userIds.every(userId => {
      // Check user's availability settings
      const userAvail = availabilityByUser[userId];
      if (!userAvail) return false;
      
      const isWithinAvailability = checkTimeAgainstAvailability(
        slot.start,
        slot.end,
        userAvail.availability,
        userAvail.timezone
      );
      
      if (!isWithinAvailability) return false;
      
      // Check for meeting conflicts
      const userMeetings = meetingsByUser[userId] || [];
      return !userMeetings.some(meeting => {
        const meetingStart = new Date(meeting.start_time);
        const meetingEnd = new Date(meeting.end_time);
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);
        
        return (
          (slotStart < meetingEnd && slotEnd > meetingStart) || // Overlap
          (slotStart.getTime() === meetingStart.getTime()) || // Same start time
          (slotEnd.getTime() === meetingEnd.getTime()) // Same end time
        );
      });
    });
  });
  
  return availableSlots;
}

/**
 * Generate potential time slots for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} duration - Meeting duration in minutes
 * @returns {Array} Array of time slot objects
 */
function generateTimeSlots(startDate, endDate, duration) {
  const slots = [];
  const start = moment(startDate);
  const end = moment(endDate).endOf('day');
  const interval = 30; // 30-minute intervals
  
  while (start.isSameOrBefore(end)) {
    // Skip generating slots for times outside of typical business hours (9 AM - 5 PM)
    const dayStart = moment(start).hour(9).minute(0).second(0);
    const dayEnd = moment(start).hour(17).minute(0).second(0);
    
    let slotStart = moment(dayStart);
    
    while (slotStart.add(interval, 'minutes').isSameOrBefore(dayEnd)) {
      const slotEnd = moment(slotStart).add(duration, 'minutes');
      
      if (slotEnd.isSameOrBefore(dayEnd)) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          formatted: {
            date: slotStart.format('YYYY-MM-DD'),
            time: slotStart.format('h:mm A'),
            day: slotStart.format('dddd')
          }
        });
      }
      
      slotStart = moment(slotStart);
    }
    
    start.add(1, 'day').startOf('day');
  }
  
  return slots;
}

/**
 * Sync with Google Calendar (placeholder)
 * @param {string} userId - User ID
 * @param {string} accessToken - Google OAuth access token
 * @returns {Promise<boolean>} Success status
 */
async function syncWithGoogleCalendar(userId, accessToken) {
  // This would be implemented with the Google Calendar API
  console.log(`Syncing calendar for user ${userId} with Google Calendar`);
  return true;
}

module.exports = {
  getCalendar,
  getCalendarMeetings,
  isTimeSlotAvailable,
  findGroupAvailability,
  syncWithGoogleCalendar
};