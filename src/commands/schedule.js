const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUser, getUserCalendars, createMeeting } = require('../utils/database');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule a new meeting')
    .setDMPermission(true),
  
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
      
      // Start the scheduling process
      await startSchedulingProcess(interaction, user, calendars);
    } catch (error) {
      console.error('Error in schedule command:', error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
      }
    }
  }
};

/**
 * Start the scheduling process
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} user - User object from database
 * @param {Array} calendars - User's calendars
 */
async function startSchedulingProcess(interaction, user, calendars) {
  try {
    // Create embed for calendar selection
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Schedule a Meeting')
      .setDescription('First, select which calendar you want to schedule this meeting on.');
    
    // Create select menu for calendars
    const options = calendars.map(calendar => ({
      label: calendar.name,
      value: calendar.id.toString(),
      description: calendar.description ? (calendar.description.length > 100 ? calendar.description.substring(0, 97) + '...' : calendar.description) : 'No description'
    }));
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('calendar_select')
      .setPlaceholder('Select a calendar')
      .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    // Send the message with the select menu
    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
      fetchReply: true
    });
    
    // Create a collector for the select menu
    const filter = i => i.customId === 'calendar_select' && i.user.id === interaction.user.id;
    const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      try {
        const selectedCalendarId = i.values[0];
        const selectedCalendar = calendars.find(c => c.id.toString() === selectedCalendarId);
        
        if (!selectedCalendar) {
          await i.update({
            content: 'Invalid calendar selection. Please try again.',
            components: [],
            embeds: []
          });
          return;
        }
        
        // Store the selected calendar ID for later use
        const meetingData = {
          calendarId: selectedCalendarId
        };
        
        // Update the message
        await i.update({
          content: `Selected calendar: ${selectedCalendar.name}`,
          components: [],
          embeds: []
        });
        
        // Move to the next step
        setTimeout(() => showMeetingDetailsForm(interaction, user, meetingData), 1000);
      } catch (error) {
        console.error('Error in calendar selection:', error);
        await i.update({
          content: 'There was an error processing your selection. Please try again later.',
          components: [],
          embeds: []
        });
      }
    });
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await interaction.followUp({
            content: 'Calendar selection timed out. Please try again later.',
            ephemeral: true
          });
        } catch (error) {
          console.error('Error sending timeout message:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error starting scheduling process:', error);
    await interaction.followUp({
      content: 'There was an error starting the scheduling process. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Show the meeting details form
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} user - User object from database
 * @param {Object} meetingData - Partial meeting data
 */
async function showMeetingDetailsForm(interaction, user, meetingData) {
  try {
    // Create modal for meeting details
    const modal = new ModalBuilder()
      .setCustomId('meeting_details_form')
      .setTitle('Meeting Details');
    
    // Create text inputs for meeting details
    const titleInput = new TextInputBuilder()
      .setCustomId('meeting_title')
      .setLabel('Meeting Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Weekly Team Sync')
      .setRequired(true);
    
    const dateInput = new TextInputBuilder()
      .setCustomId('meeting_date')
      .setLabel('Date (YYYY-MM-DD)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(moment().add(1, 'day').format('YYYY-MM-DD'))
      .setRequired(true);
    
    const startTimeInput = new TextInputBuilder()
      .setCustomId('meeting_start_time')
      .setLabel('Start Time (e.g., 9:00 AM)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('9:00 AM')
      .setRequired(true);
    
    const durationInput = new TextInputBuilder()
      .setCustomId('meeting_duration')
      .setLabel('Duration (minutes)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('30')
      .setRequired(true);
    
    const descriptionInput = new TextInputBuilder()
      .setCustomId('meeting_description')
      .setLabel('Description (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Discuss project updates and next steps')
      .setRequired(false);
    
    // Add inputs to modal
    const titleRow = new ActionRowBuilder().addComponents(titleInput);
    const dateRow = new ActionRowBuilder().addComponents(dateInput);
    const startTimeRow = new ActionRowBuilder().addComponents(startTimeInput);
    const durationRow = new ActionRowBuilder().addComponents(durationInput);
    const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
    
    modal.addComponents(titleRow, dateRow, startTimeRow, durationRow, descriptionRow);
    
    // Store meeting data in a global variable (in a real app, use a database or session)
    global.pendingMeetings = global.pendingMeetings || {};
    global.pendingMeetings[interaction.user.id] = meetingData;
    
    // Show the modal
    await interaction.followUp({
      content: 'Please fill out the meeting details:',
      ephemeral: true
    });
    
    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error showing meeting details form:', error);
    await interaction.followUp({
      content: 'There was an error processing your request. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Process the meeting details form submission
 * @param {Interaction} interaction - Discord interaction
 */
async function processMeetingDetailsForm(interaction) {
  try {
    // Get form values
    const title = interaction.fields.getTextInputValue('meeting_title');
    const dateStr = interaction.fields.getTextInputValue('meeting_date');
    const startTimeStr = interaction.fields.getTextInputValue('meeting_start_time');
    const durationStr = interaction.fields.getTextInputValue('meeting_duration');
    const description = interaction.fields.getTextInputValue('meeting_description') || '';
    
    // Get the user and their timezone
    const user = await getUser(interaction.user.id);
    const timezone = user.timezone || 'UTC';
    
    // Get the pending meeting data
    const pendingMeetings = global.pendingMeetings || {};
    const meetingData = pendingMeetings[interaction.user.id];
    
    if (!meetingData) {
      await interaction.reply({
        content: 'Your session has expired. Please start over with `/schedule`.',
        ephemeral: true
      });
      return;
    }
    
    // Parse the date and time
    try {
      // Combine date and start time
      const startDateTime = moment.tz(`${dateStr} ${startTimeStr}`, 'YYYY-MM-DD h:mm A', timezone);
      
      if (!startDateTime.isValid()) {
        await interaction.reply({
          content: 'Invalid date or time format. Please use YYYY-MM-DD for date and h:mm AM/PM for time.',
          ephemeral: true
        });
        return;
      }
      
      // Parse duration
      const duration = parseInt(durationStr, 10);
      
      if (isNaN(duration) || duration <= 0) {
        await interaction.reply({
          content: 'Invalid duration. Please enter a positive number of minutes.',
          ephemeral: true
        });
        return;
      }
      
      // Calculate end time
      const endDateTime = moment(startDateTime).add(duration, 'minutes');
      
      // Format times for display
      const formattedStartTime = startDateTime.format('MMMM D, YYYY [at] h:mm A z');
      const formattedEndTime = endDateTime.format('h:mm A z');
      
      // Store the complete meeting data
      meetingData.title = title;
      meetingData.startTime = startDateTime.toISOString();
      meetingData.endTime = endDateTime.toISOString();
      meetingData.description = description;
      
      // Create embed for confirmation
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Confirm Meeting')
        .setDescription(`Please confirm the details for your meeting "${title}":`)
        .addFields(
          { name: 'Start Time', value: formattedStartTime, inline: true },
          { name: 'End Time', value: formattedEndTime, inline: true },
          { name: 'Duration', value: `${duration} minutes`, inline: true }
        );
      
      if (description) {
        embed.addFields({ name: 'Description', value: description });
      }
      
      // Create buttons for confirmation
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('confirm_meeting')
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('cancel_meeting')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );
      
      // Send the confirmation message
      const response = await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true,
        fetchReply: true
      });
      
      // Create a collector for button interactions
      const filter = i => 
        (i.customId === 'confirm_meeting' || i.customId === 'cancel_meeting') && 
        i.user.id === interaction.user.id;
      
      const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
      
      collector.on('collect', async i => {
        try {
          if (i.customId === 'confirm_meeting') {
            // Create the meeting in the database
            const meeting = await createMeeting(
              meetingData.calendarId,
              meetingData.title,
              meetingData.startTime,
              meetingData.endTime,
              meetingData.description
            );
            
            // Update the message
            await i.update({
              content: `Meeting "${meeting.title}" has been scheduled for ${formattedStartTime}.`,
              embeds: [],
              components: []
            });
            
            // Clean up
            delete pendingMeetings[interaction.user.id];
          } else {
            // Cancel the meeting
            await i.update({
              content: 'Meeting scheduling cancelled.',
              embeds: [],
              components: []
            });
            
            // Clean up
            delete pendingMeetings[interaction.user.id];
          }
        } catch (error) {
          console.error('Error processing meeting confirmation:', error);
          await i.update({
            content: 'There was an error scheduling your meeting. Please try again later.',
            embeds: [],
            components: []
          });
        }
      });
      
      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          try {
            await interaction.followUp({
              content: 'Meeting confirmation timed out. Please try again later.',
              ephemeral: true
            });
            
            // Clean up
            delete pendingMeetings[interaction.user.id];
          } catch (error) {
            console.error('Error sending timeout message:', error);
          }
        }
      });
    } catch (error) {
      console.error('Error parsing date/time:', error);
      await interaction.reply({
        content: 'There was an error processing your meeting details. Please check your date and time formats and try again.',
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error processing meeting details form:', error);
    await interaction.reply({
      content: 'There was an error processing your meeting details. Please try again later.',
      ephemeral: true
    });
  }
}

// Export the functions for use in modal submissions
module.exports.processMeetingDetailsForm = processMeetingDetailsForm;