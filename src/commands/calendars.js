const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUser, getUserCalendars, createCalendar, updateCalendar } = require('../utils/database');
const { syncWithGoogleCalendar } = require('../utils/calendar');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('calendars')
    .setDescription('Manage your calendars')
    .setDMPermission(true)
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List your calendars'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new calendar'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('sync')
        .setDescription('Sync with Google Calendar')),
  
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
      
      // Handle subcommands
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'list') {
        await listCalendars(interaction, user);
      } else if (subcommand === 'create') {
        await startCalendarCreation(interaction, user);
      } else if (subcommand === 'sync') {
        await startGoogleCalendarSync(interaction, user);
      }
    } catch (error) {
      console.error('Error in calendars command:', error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
      }
    }
  }
};

/**
 * List a user's calendars
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} user - User object from database
 */
async function listCalendars(interaction, user) {
  try {
    // Get user's calendars
    const calendars = await getUserCalendars(interaction.user.id);
    
    if (calendars.length === 0) {
      // No calendars found
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Your Calendars')
        .setDescription('You don\'t have any calendars yet.')
        .addFields(
          { name: 'Create a Calendar', value: 'Use `/calendars create` to create your first calendar.' }
        );
      
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
      return;
    }
    
    // Create embed for calendars
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Your Calendars')
      .setDescription(`You have ${calendars.length} calendar(s).`);
    
    // Add fields for each calendar
    calendars.forEach((calendar, index) => {
      const availabilityText = formatAvailability(calendar.availability);
      
      embed.addFields(
        { name: `${index + 1}. ${calendar.name}`, value: calendar.description || 'No description' },
        { name: 'Availability', value: availabilityText, inline: true }
      );
    });
    
    // Add buttons for actions
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_calendar')
          .setLabel('Create New Calendar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('sync_google_calendar')
          .setLabel('Sync with Google Calendar')
          .setStyle(ButtonStyle.Secondary)
      );
    
    // Send the message with the embed and buttons
    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
      fetchReply: true
    });
    
    // Create a collector for button interactions
    const filter = i => 
      (i.customId === 'create_calendar' || i.customId === 'sync_google_calendar') && 
      i.user.id === interaction.user.id;
    
    const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      try {
        if (i.customId === 'create_calendar') {
          // Start calendar creation process
          await i.update({
            content: 'Starting calendar creation...',
            embeds: [],
            components: []
          });
          
          setTimeout(() => startCalendarCreation(interaction, user), 1000);
        } else {
          // Start Google Calendar sync process
          await i.update({
            content: 'Starting Google Calendar sync...',
            embeds: [],
            components: []
          });
          
          setTimeout(() => startGoogleCalendarSync(interaction, user), 1000);
        }
      } catch (error) {
        console.error('Error handling button interaction:', error);
        await i.update({
          content: 'There was an error processing your request. Please try again later.',
          embeds: [],
          components: []
        });
      }
    });
  } catch (error) {
    console.error('Error listing calendars:', error);
    await interaction.reply({
      content: 'There was an error retrieving your calendars. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Format availability for display
 * @param {Object} availability - Availability object
 * @returns {string} Formatted availability text
 */
function formatAvailability(availability) {
  if (!availability) {
    return 'Not set';
  }
  
  let text = '';
  
  if (availability.weekdays) {
    text += `Weekdays: ${availability.weekdays.start} - ${availability.weekdays.end}\n`;
  } else {
    text += 'Weekdays: Not set\n';
  }
  
  if (availability.weekends) {
    if (availability.weekends.available) {
      text += `Weekends: ${availability.weekends.start} - ${availability.weekends.end}`;
    } else {
      text += 'Weekends: Not available';
    }
  } else {
    text += 'Weekends: Not set';
  }
  
  return text;
}

/**
 * Start the calendar creation process
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} user - User object from database
 */
async function startCalendarCreation(interaction, user) {
  try {
    // Create modal for calendar details
    const modal = new ModalBuilder()
      .setCustomId('calendar_details_form')
      .setTitle('Create Calendar');
    
    // Create text inputs for calendar details
    const nameInput = new TextInputBuilder()
      .setCustomId('calendar_name')
      .setLabel('Calendar Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Work Calendar')
      .setRequired(true);
    
    const descriptionInput = new TextInputBuilder()
      .setCustomId('calendar_description')
      .setLabel('Description (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Calendar for work-related meetings and events')
      .setRequired(false);
    
    // Add inputs to modal
    const nameRow = new ActionRowBuilder().addComponents(nameInput);
    const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
    
    modal.addComponents(nameRow, descriptionRow);
    
    // Show the modal
    await interaction.followUp({
      content: 'Please fill out the calendar details:',
      ephemeral: true
    });
    
    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error starting calendar creation:', error);
    await interaction.followUp({
      content: 'There was an error starting the calendar creation process. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Process the calendar details form submission
 * @param {Interaction} interaction - Discord interaction
 */
async function processCalendarDetailsForm(interaction) {
  try {
    // Get form values
    const name = interaction.fields.getTextInputValue('calendar_name');
    const description = interaction.fields.getTextInputValue('calendar_description') || '';
    
    // Get user's availability from their profile
    const user = await getUser(interaction.user.id);
    const availability = user.availability || {};
    
    // Create the calendar
    const calendar = await createCalendar(
      interaction.user.id,
      name,
      description,
      availability
    );
    
    // Create embed for confirmation
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Calendar Created')
      .setDescription(`Your calendar "${name}" has been created successfully.`)
      .addFields(
        { name: 'Description', value: description || 'No description' },
        { name: 'Availability', value: formatAvailability(availability) }
      );
    
    // Send the confirmation message
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    console.error('Error processing calendar details form:', error);
    await interaction.reply({
      content: 'There was an error creating your calendar. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Start the Google Calendar sync process
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} user - User object from database
 */
async function startGoogleCalendarSync(interaction, user) {
  try {
    // Create embed for Google Calendar sync
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Google Calendar Integration')
      .setDescription('Connect your Google Calendar to sync your events with Syncify.')
      .addFields(
        { name: 'Note', value: 'This will allow Syncify to check your existing calendar events when scheduling meetings.' }
      );
    
    // Create button for connecting
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('connect_google_calendar')
          .setLabel('Connect Google Calendar')
          .setStyle(ButtonStyle.Primary)
      );
    
    // Send the message with the button
    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
      fetchReply: true
    });
    
    // Create a collector for button interactions
    const filter = i => i.customId === 'connect_google_calendar' && i.user.id === interaction.user.id;
    const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      try {
        // This would normally redirect to OAuth flow
        // For now, we'll just acknowledge
        await i.update({
          content: 'Google Calendar integration is not yet implemented. This feature will be available soon.',
          embeds: [],
          components: []
        });
      } catch (error) {
        console.error('Error in Google Calendar sync:', error);
        await i.update({
          content: 'There was an error processing your request. Please try again later.',
          components: [],
          embeds: []
        });
      }
    });
  } catch (error) {
    console.error('Error starting Google Calendar sync:', error);
    await interaction.followUp({
      content: 'There was an error starting the Google Calendar sync process. Please try again later.',
      ephemeral: true
    });
  }
}

// Export the functions for use in modal submissions
module.exports.processCalendarDetailsForm = processCalendarDetailsForm;