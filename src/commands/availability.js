const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUser, updateUser, getUserCalendars, updateCalendar } = require('../utils/database');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('availability')
    .setDescription('View and update your availability')
    .setDMPermission(true)
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View your current availability'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Update your availability')),
  
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
      
      if (subcommand === 'view') {
        await viewAvailability(interaction, user);
      } else if (subcommand === 'update') {
        await startAvailabilityUpdate(interaction, user);
      }
    } catch (error) {
      console.error('Error in availability command:', error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
      }
    }
  }
};

/**
 * View a user's availability
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} user - User object from database
 */
async function viewAvailability(interaction, user) {
  try {
    const availability = user.availability || {};
    
    // Format availability for display
    let weekdayText = 'Not set';
    if (availability.weekdays) {
      weekdayText = `${availability.weekdays.start} - ${availability.weekdays.end}`;
    }
    
    let weekendText = 'Not set';
    if (availability.weekends) {
      if (availability.weekends.available) {
        weekendText = `${availability.weekends.start} - ${availability.weekends.end}`;
      } else {
        weekendText = 'Not available';
      }
    }
    
    // Create embed for availability
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Your Availability')
      .setDescription('Here is your current availability for scheduling meetings.')
      .addFields(
        { name: 'Timezone', value: user.timezone || 'Not set', inline: true },
        { name: 'Weekdays (Mon-Fri)', value: weekdayText, inline: true },
        { name: 'Weekends (Sat-Sun)', value: weekendText, inline: true }
      );
    
    // Create button for updating
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('update_availability')
          .setLabel('Update Availability')
          .setStyle(ButtonStyle.Primary)
      );
    
    // Send the message with the embed and button
    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
      fetchReply: true
    });
    
    // Create a collector for button interactions
    const filter = i => i.customId === 'update_availability' && i.user.id === interaction.user.id;
    const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      try {
        await i.update({
          content: 'Starting availability update...',
          embeds: [],
          components: []
        });
        
        setTimeout(() => startAvailabilityUpdate(interaction, user), 1000);
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
    console.error('Error viewing availability:', error);
    await interaction.reply({
      content: 'There was an error retrieving your availability. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Start the availability update process
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} user - User object from database
 */
async function startAvailabilityUpdate(interaction, user) {
  try {
    // Create embed for availability update
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Update Availability')
      .setDescription('Let\'s update your availability for meetings. First, let\'s set your weekday availability (Monday-Friday).');
    
    // Create button to start weekday availability update
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('update_weekday_availability')
          .setLabel('Set Weekday Availability')
          .setStyle(ButtonStyle.Primary)
      );
    
    // Send the message with the button
    const response = await interaction.followUp({
      embeds: [embed],
      components: [row],
      ephemeral: true,
      fetchReply: true
    });
    
    // Create a collector for button interactions
    const filter = i => i.customId === 'update_weekday_availability' && i.user.id === interaction.user.id;
    const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      try {
        // Create modal for weekday availability
        const modal = new ModalBuilder()
          .setCustomId('weekday_availability_update_form')
          .setTitle('Weekday Availability');
        
        // Get current values if they exist
        const availability = user.availability || {};
        const weekdays = availability.weekdays || {};
        
        // Create text inputs for start and end times
        const startTimeInput = new TextInputBuilder()
          .setCustomId('weekday_start_time')
          .setLabel('Start Time (e.g., 9:00 AM)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('9:00 AM')
          .setValue(weekdays.start || '')
          .setRequired(true);
        
        const endTimeInput = new TextInputBuilder()
          .setCustomId('weekday_end_time')
          .setLabel('End Time (e.g., 5:00 PM)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('5:00 PM')
          .setValue(weekdays.end || '')
          .setRequired(true);
        
        // Add inputs to modal
        const startTimeRow = new ActionRowBuilder().addComponents(startTimeInput);
        const endTimeRow = new ActionRowBuilder().addComponents(endTimeInput);
        modal.addComponents(startTimeRow, endTimeRow);
        
        // Show the modal
        await i.showModal(modal);
      } catch (error) {
        console.error('Error showing weekday availability modal:', error);
        await i.update({
          content: 'There was an error processing your request. Please try again later.',
          components: [],
          embeds: []
        });
      }
    });
  } catch (error) {
    console.error('Error starting availability update:', error);
    await interaction.followUp({
      content: 'There was an error starting the availability update process. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Process the weekday availability update form submission
 * @param {Interaction} interaction - Discord interaction
 */
async function processWeekdayAvailabilityUpdateForm(interaction) {
  try {
    // Get form values
    const weekdayStartTime = interaction.fields.getTextInputValue('weekday_start_time');
    const weekdayEndTime = interaction.fields.getTextInputValue('weekday_end_time');
    
    // Get user and current availability
    const user = await getUser(interaction.user.id);
    
    // Update availability object
    const availability = user.availability || {};
    availability.weekdays = {
      start: weekdayStartTime,
      end: weekdayEndTime
    };
    
    // Update user with new availability
    await updateUser(interaction.user.id, { availability });
    
    // Create embed for weekend availability
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Weekend Availability')
      .setDescription('Now, let\'s update your weekend availability (Saturday-Sunday).')
      .addFields(
        { name: 'Weekday Availability', value: `${weekdayStartTime} - ${weekdayEndTime}` }
      );
    
    // Create button to start weekend availability update
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('update_weekend_availability')
          .setLabel('Set Weekend Availability')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('skip_weekend_availability')
          .setLabel('Not Available on Weekends')
          .setStyle(ButtonStyle.Secondary)
      );
    
    // Reply to the modal submission
    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
      fetchReply: true
    });
    
    // Create a collector for button interactions
    const filter = i => 
      (i.customId === 'update_weekend_availability' || i.customId === 'skip_weekend_availability') && 
      i.user.id === interaction.user.id;
    
    const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      try {
        if (i.customId === 'update_weekend_availability') {
          // Create modal for weekend availability
          const modal = new ModalBuilder()
            .setCustomId('weekend_availability_update_form')
            .setTitle('Weekend Availability');
          
          // Get current values if they exist
          const weekends = availability.weekends || {};
          
          // Create text inputs for start and end times
          const startTimeInput = new TextInputBuilder()
            .setCustomId('weekend_start_time')
            .setLabel('Start Time (e.g., 10:00 AM)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('10:00 AM')
            .setValue(weekends.available ? weekends.start || '' : '')
            .setRequired(true);
          
          const endTimeInput = new TextInputBuilder()
            .setCustomId('weekend_end_time')
            .setLabel('End Time (e.g., 4:00 PM)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('4:00 PM')
            .setValue(weekends.available ? weekends.end || '' : '')
            .setRequired(true);
          
          // Add inputs to modal
          const startTimeRow = new ActionRowBuilder().addComponents(startTimeInput);
          const endTimeRow = new ActionRowBuilder().addComponents(endTimeInput);
          modal.addComponents(startTimeRow, endTimeRow);
          
          // Show the modal
          await i.showModal(modal);
        } else {
          // Skip weekend availability
          const user = await getUser(interaction.user.id);
          
          // Update availability object
          const availability = user.availability || {};
          availability.weekends = {
            available: false
          };
          
          // Update user with new availability
          await updateUser(interaction.user.id, { availability });
          
          // Update all user's calendars with the new availability
          const calendars = await getUserCalendars(interaction.user.id);
          for (const calendar of calendars) {
            await updateCalendar(calendar.id, { availability });
          }
          
          // Update the message
          await i.update({
            content: 'Your availability has been updated. Weekend availability set to not available.',
            embeds: [],
            components: []
          });
        }
      } catch (error) {
        console.error('Error in weekend availability update:', error);
        await i.update({
          content: 'There was an error processing your request. Please try again later.',
          components: [],
          embeds: []
        });
      }
    });
  } catch (error) {
    console.error('Error processing weekday availability update form:', error);
    await interaction.reply({
      content: 'There was an error updating your availability. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Process the weekend availability update form submission
 * @param {Interaction} interaction - Discord interaction
 */
async function processWeekendAvailabilityUpdateForm(interaction) {
  try {
    // Get form values
    const weekendStartTime = interaction.fields.getTextInputValue('weekend_start_time');
    const weekendEndTime = interaction.fields.getTextInputValue('weekend_end_time');
    
    // Get user and current availability
    const user = await getUser(interaction.user.id);
    
    // Update availability object
    const availability = user.availability || {};
    availability.weekends = {
      available: true,
      start: weekendStartTime,
      end: weekendEndTime
    };
    
    // Update user with new availability
    await updateUser(interaction.user.id, { availability });
    
    // Update all user's calendars with the new availability
    const calendars = await getUserCalendars(interaction.user.id);
    for (const calendar of calendars) {
      await updateCalendar(calendar.id, { availability });
    }
    
    // Format availability for display
    let weekdayText = 'Not set';
    if (availability.weekdays) {
      weekdayText = `${availability.weekdays.start} - ${availability.weekdays.end}`;
    }
    
    let weekendText = 'Not available';
    if (availability.weekends && availability.weekends.available) {
      weekendText = `${availability.weekends.start} - ${availability.weekends.end}`;
    }
    
    // Create embed for confirmation
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Availability Updated')
      .setDescription('Your availability has been updated successfully.')
      .addFields(
        { name: 'Weekdays (Mon-Fri)', value: weekdayText, inline: true },
        { name: 'Weekends (Sat-Sun)', value: weekendText, inline: true }
      );
    
    // Reply to the modal submission
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    console.error('Error processing weekend availability update form:', error);
    await interaction.reply({
      content: 'There was an error updating your availability. Please try again later.',
      ephemeral: true
    });
  }
}

// Export the functions for use in modal submissions
module.exports.processWeekdayAvailabilityUpdateForm = processWeekdayAvailabilityUpdateForm;
module.exports.processWeekendAvailabilityUpdateForm = processWeekendAvailabilityUpdateForm;