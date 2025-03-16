const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser, getUserCalendars, getCalendarMeetings } = require('../utils/database');
const { getCalendar } = require('../utils/calendar');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meetings')
    .setDescription('View and manage your meetings')
    .setDMPermission(true)
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List your upcoming meetings')
        .addStringOption(option =>
          option
            .setName('calendar')
            .setDescription('Calendar to view meetings from (defaults to all calendars)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('today')
        .setDescription('View your meetings for today')),
  
  contexts: [1, 0, 2], // GUILD, BOT_DM, PRIVATE_CHANNEL
  integration_types: [0], // GUILD_INSTALL
  
  async execute(interaction) {
    try {
      // Check if user exists in database
      const user = await getUser(interaction.user.id);
      
      if (!user) {
        return interaction.reply({
          content: 'You need to set up your profile first. Use `/setup` to get started.',
          ephemeral: true
        });
      }
      
      // Get user's calendars
      const calendars = await getUserCalendars(interaction.user.id);
      
      if (calendars.length === 0) {
        return interaction.reply({
          content: 'You don\'t have any calendars set up yet. Use `/calendars` to create one.',
          ephemeral: true
        });
      }
      
      // Handle subcommands
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'list') {
        const calendarOption = interaction.options.getString('calendar');
        await listMeetings(interaction, user, calendars, calendarOption);
      } else if (subcommand === 'today') {
        await listTodayMeetings(interaction, user, calendars);
      }
    } catch (error) {
      console.error('Error in meetings command:', error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
      }
    }
  }
};

/**
 * List a user's meetings
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} user - User object from database
 * @param {Array} calendars - User's calendars
 * @param {string} calendarOption - Optional calendar name to filter by
 */
async function listMeetings(interaction, user, calendars, calendarOption) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Filter calendars if a specific one was requested
    let filteredCalendars = calendars;
    if (calendarOption) {
      filteredCalendars = calendars.filter(cal => 
        cal.name.toLowerCase() === calendarOption.toLowerCase()
      );
      
      if (filteredCalendars.length === 0) {
        return interaction.editReply({
          content: `No calendar found with name "${calendarOption}". Please check your calendar names with \`/calendars list\`.`,
        });
      }
    }
    
    // Get meetings for each calendar
    const allMeetings = [];
    for (const calendar of filteredCalendars) {
      const meetings = await getCalendarMeetings(calendar.id);
      meetings.forEach(meeting => {
        allMeetings.push({
          ...meeting,
          calendarName: calendar.name
        });
      });
    }
    
    // Filter for upcoming meetings and sort by start time
    const now = new Date();
    const upcomingMeetings = allMeetings
      .filter(meeting => new Date(meeting.start_time) >= now)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    
    if (upcomingMeetings.length === 0) {
      // No upcoming meetings
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Upcoming Meetings')
        .setDescription('You have no upcoming meetings scheduled.');
      
      if (calendarOption) {
        embed.setDescription(`You have no upcoming meetings scheduled in "${calendarOption}".`);
      }
      
      return interaction.editReply({
        embeds: [embed]
      });
    }
    
    // Format meetings for display
    const timezone = user.timezone || 'UTC';
    const formattedMeetings = upcomingMeetings.map(meeting => {
      const startTime = moment(meeting.start_time).tz(timezone);
      const endTime = moment(meeting.end_time).tz(timezone);
      
      return {
        title: meeting.title,
        calendarName: meeting.calendarName,
        startTime: startTime.format('MMMM D, YYYY [at] h:mm A z'),
        endTime: endTime.format('h:mm A z'),
        duration: endTime.diff(startTime, 'minutes'),
        description: meeting.description,
        id: meeting.id
      };
    });
    
    // Create embed for meetings
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Upcoming Meetings')
      .setDescription(`You have ${formattedMeetings.length} upcoming meeting(s).`);
    
    if (calendarOption) {
      embed.setDescription(`You have ${formattedMeetings.length} upcoming meeting(s) in "${calendarOption}".`);
    }
    
    // Add fields for each meeting (limit to 10 for display)
    formattedMeetings.slice(0, 10).forEach((meeting, index) => {
      embed.addFields(
        { name: `${index + 1}. ${meeting.title}`, value: `**Calendar:** ${meeting.calendarName}\n**When:** ${meeting.startTime}\n**Duration:** ${meeting.duration} minutes` }
      );
      
      if (meeting.description) {
        embed.addFields({ name: 'Description', value: meeting.description });
      }
    });
    
    if (formattedMeetings.length > 10) {
      embed.addFields({ name: 'Note', value: `Showing 10 of ${formattedMeetings.length} meetings. Use calendar filters to see more.` });
    }
    
    // Send the message with the embed
    await interaction.editReply({
      embeds: [embed]
    });
  } catch (error) {
    console.error('Error listing meetings:', error);
    await interaction.editReply({
      content: 'There was an error retrieving your meetings. Please try again later.'
    });
  }
}

/**
 * List a user's meetings for today
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} user - User object from database
 * @param {Array} calendars - User's calendars
 */
async function listTodayMeetings(interaction, user, calendars) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Get meetings for each calendar
    const allMeetings = [];
    for (const calendar of calendars) {
      const meetings = await getCalendarMeetings(calendar.id);
      meetings.forEach(meeting => {
        allMeetings.push({
          ...meeting,
          calendarName: calendar.name
        });
      });
    }
    
    // Filter for today's meetings and sort by start time
    const timezone = user.timezone || 'UTC';
    const today = moment().tz(timezone).startOf('day');
    const tomorrow = moment(today).add(1, 'day');
    
    const todayMeetings = allMeetings
      .filter(meeting => {
        const meetingTime = moment(meeting.start_time).tz(timezone);
        return meetingTime >= today && meetingTime < tomorrow;
      })
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    
    if (todayMeetings.length === 0) {
      // No meetings today
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Today\'s Meetings')
        .setDescription(`You have no meetings scheduled for today (${today.format('MMMM D, YYYY')}).`);
      
      return interaction.editReply({
        embeds: [embed]
      });
    }
    
    // Format meetings for display
    const formattedMeetings = todayMeetings.map(meeting => {
      const startTime = moment(meeting.start_time).tz(timezone);
      const endTime = moment(meeting.end_time).tz(timezone);
      
      return {
        title: meeting.title,
        calendarName: meeting.calendarName,
        startTime: startTime.format('h:mm A z'),
        endTime: endTime.format('h:mm A z'),
        duration: endTime.diff(startTime, 'minutes'),
        description: meeting.description,
        id: meeting.id
      };
    });
    
    // Create embed for meetings
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Today\'s Meetings')
      .setDescription(`You have ${formattedMeetings.length} meeting(s) scheduled for today (${today.format('MMMM D, YYYY')}).`);
    
    // Add fields for each meeting
    formattedMeetings.forEach((meeting, index) => {
      embed.addFields(
        { name: `${index + 1}. ${meeting.title}`, value: `**Calendar:** ${meeting.calendarName}\n**Time:** ${meeting.startTime} - ${meeting.endTime}\n**Duration:** ${meeting.duration} minutes` }
      );
      
      if (meeting.description) {
        embed.addFields({ name: 'Description', value: meeting.description });
      }
    });
    
    // Send the message with the embed
    await interaction.editReply({
      embeds: [embed]
    });
  } catch (error) {
    console.error('Error listing today\'s meetings:', error);
    await interaction.editReply({
      content: 'There was an error retrieving your meetings. Please try again later.'
    });
  }
}