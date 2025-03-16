const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/**
 * Initialize the reminder system
 * @param {Client} client - Discord.js client
 */
function initializeReminderSystem(client) {
  console.log('Initializing reminder system...');
  
  // Schedule a job to run every minute to check for upcoming meetings
  cron.schedule('* * * * *', async () => {
    try {
      await checkUpcomingMeetings(client);
    } catch (error) {
      console.error('Error in reminder system:', error);
    }
  });
}

/**
 * Check for upcoming meetings and send reminders
 * @param {Client} client - Discord.js client
 */
async function checkUpcomingMeetings(client) {
  const now = new Date();
  const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
  
  // Format dates for Supabase query
  const nowStr = now.toISOString();
  const thirtyMinutesFromNowStr = thirtyMinutesFromNow.toISOString();
  
  try {
    // Get meetings that start within the next 30 minutes and haven't had reminders sent
    const { data: meetings, error } = await supabase
      .from('meetings')
      .select(`
        id, 
        title, 
        start_time, 
        end_time, 
        description,
        calendars(
          users(
            user_id, 
            timezone
          )
        )
      `)
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)
      .gte('start_time', nowStr)
      .lt('start_time', thirtyMinutesFromNowStr);
    
    if (error) {
      console.error('Error fetching upcoming meetings:', error);
      return;
    }
    
    // Send reminders for each meeting
    for (const meeting of meetings) {
      try {
        const userId = meeting.calendars.users.user_id;
        const userTimezone = meeting.calendars.users.timezone || 'UTC';
        
        // Format times in user's timezone
        const startTime = moment(meeting.start_time).tz(userTimezone).format('MMMM D, YYYY [at] h:mm A z');
        const endTime = moment(meeting.end_time).tz(userTimezone).format('h:mm A z');
        
        // Create reminder embed
        const reminderEmbed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('📅 Meeting Reminder')
          .setDescription(`Your meeting **${meeting.title}** starts in less than 30 minutes!`)
          .addFields(
            { name: 'Start Time', value: startTime, inline: true },
            { name: 'End Time', value: endTime, inline: true },
          );
          
        if (meeting.description) {
          reminderEmbed.addFields({ name: 'Description', value: meeting.description });
        }
        
        // Try to send DM to user
        try {
          const user = await client.users.fetch(userId);
          await user.send({ embeds: [reminderEmbed] });
          
          // Mark reminder as sent
          await supabase
            .from('meetings')
            .update({ reminder_sent: true })
            .eq('id', meeting.id);
            
          console.log(`Sent reminder for meeting ${meeting.id} to user ${userId}`);
        } catch (dmError) {
          console.error(`Failed to send reminder DM to user ${userId}:`, dmError);
        }
      } catch (meetingError) {
        console.error(`Error processing meeting ${meeting.id}:`, meetingError);
      }
    }
  } catch (error) {
    console.error('Error in checkUpcomingMeetings:', error);
  }
}

module.exports = {
  initializeReminderSystem
};