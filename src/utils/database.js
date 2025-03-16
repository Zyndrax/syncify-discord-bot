const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/**
 * Get a user from the database
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function getUser(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching user:', error);
  }
  
  return data;
}

/**
 * Create a new user in the database
 * @param {string} userId - Discord user ID
 * @param {string} username - Discord username
 * @param {string} timezone - User's timezone
 * @returns {Promise<Object>} Created user object
 */
async function createUser(userId, username, timezone) {
  const { data, error } = await supabase
    .from('users')
    .insert([
      { 
        user_id: userId, 
        username: username,
        timezone: timezone
      }
    ])
    .select()
    .single();
  
  if (error) {
    console.error('Error creating user:', error);
    throw error;
  }
  
  return data;
}

/**
 * Update a user's information
 * @param {string} userId - Discord user ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated user object
 */
async function updateUser(userId, updates) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating user:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get a user's calendars
 * @param {string} userId - Discord user ID
 * @returns {Promise<Array>} Array of calendar objects
 */
async function getUserCalendars(userId) {
  const { data, error } = await supabase
    .from('calendars')
    .select('*')
    .eq('user_id', userId);
  
  if (error) {
    console.error('Error fetching calendars:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Create a new calendar for a user
 * @param {string} userId - Discord user ID
 * @param {string} name - Calendar name
 * @param {string} description - Calendar description
 * @param {Object} availability - Availability object
 * @returns {Promise<Object>} Created calendar object
 */
async function createCalendar(userId, name, description, availability) {
  const { data, error } = await supabase
    .from('calendars')
    .insert([
      { 
        user_id: userId, 
        name: name,
        description: description,
        availability: availability
      }
    ])
    .select()
    .single();
  
  if (error) {
    console.error('Error creating calendar:', error);
    throw error;
  }
  
  return data;
}

/**
 * Update a calendar
 * @param {string} calendarId - Calendar ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated calendar object
 */
async function updateCalendar(calendarId, updates) {
  const { data, error } = await supabase
    .from('calendars')
    .update(updates)
    .eq('id', calendarId)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating calendar:', error);
    throw error;
  }
  
  return data;
}

/**
 * Create a new meeting
 * @param {string} calendarId - Calendar ID
 * @param {string} title - Meeting title
 * @param {string} startTime - Start time (ISO string)
 * @param {string} endTime - End time (ISO string)
 * @param {string} description - Meeting description
 * @returns {Promise<Object>} Created meeting object
 */
async function createMeeting(calendarId, title, startTime, endTime, description = '') {
  const { data, error } = await supabase
    .from('meetings')
    .insert([
      { 
        calendar_id: calendarId, 
        title: title,
        start_time: startTime,
        end_time: endTime,
        description: description,
        status: 'confirmed',
        reminder_sent: false
      }
    ])
    .select()
    .single();
  
  if (error) {
    console.error('Error creating meeting:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get meetings for a calendar
 * @param {string} calendarId - Calendar ID
 * @returns {Promise<Array>} Array of meeting objects
 */
async function getCalendarMeetings(calendarId) {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('calendar_id', calendarId)
    .order('start_time', { ascending: true });
  
  if (error) {
    console.error('Error fetching meetings:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Create a group session
 * @param {string} hostId - Host user ID
 * @param {string} title - Session title
 * @param {number} duration - Session duration in minutes
 * @returns {Promise<Object>} Created session object
 */
async function createGroupSession(hostId, title, duration) {
  const { data, error } = await supabase
    .from('group_sessions')
    .insert([
      { 
        host_id: hostId, 
        title: title,
        duration: duration,
        status: 'pending'
      }
    ])
    .select()
    .single();
  
  if (error) {
    console.error('Error creating group session:', error);
    throw error;
  }
  
  return data;
}

/**
 * Add a participant to a group session
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Created participant object
 */
async function addGroupParticipant(sessionId, userId) {
  const { data, error } = await supabase
    .from('group_participants')
    .insert([
      { 
        session_id: sessionId, 
        user_id: userId,
        status: 'pending'
      }
    ])
    .select()
    .single();
  
  if (error) {
    console.error('Error adding group participant:', error);
    throw error;
  }
  
  return data;
}

module.exports = {
  getUser,
  createUser,
  updateUser,
  getUserCalendars,
  createCalendar,
  updateCalendar,
  createMeeting,
  getCalendarMeetings,
  createGroupSession,
  addGroupParticipant
};