const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUser, createUser, updateUser } = require('../utils/database');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set up your profile and preferences')
    .setDMPermission(true),
  
  contexts: [1, 0, 2], // GUILD, BOT_DM, PRIVATE_CHANNEL
  integration_types: [0], // GUILD_INSTALL
  
  async execute(interaction) {
    try {
      // Check if user already exists in database
      const user = await getUser(interaction.user.id);
      
      if (user) {
        // User exists, ask if they want to update their profile
        return startUpdateFlow(interaction, user);
      } else {
        // New user, start setup process
        return startSetupFlow(interaction);
      }
    } catch (error) {
      console.error('Error in setup command:', error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error processing your setup. Please try again later.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error processing your setup. Please try again later.', ephemeral: true });
      }
    }
  }
};

/**
 * Start the setup flow for new users
 * @param {Interaction} interaction - Discord interaction
 */
async function startSetupFlow(interaction) {
  try {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Welcome to Syncify!')
      .setDescription('Let\'s set up your profile. First, we need to know your timezone.')
      .addFields(
        { name: 'Why do we need this?', value: 'Your timezone helps us schedule meetings at times that work for you.' }
      );
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('start_timezone_selection')
          .setLabel('Set Timezone')
          .setStyle(ButtonStyle.Primary)
      );
    
    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  } catch (error) {
    console.error('Error starting setup flow:', error);
    await interaction.reply({ content: 'There was an error starting the setup process. Please try again later.', ephemeral: true });
  }
}

/**
 * Start the update flow for existing users
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} user - User object from database
 */
async function startUpdateFlow(interaction, user) {
  try {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Update Your Profile')
      .setDescription('What would you like to update?')
      .addFields(
        { name: 'Current Timezone', value: user.timezone || 'Not set' }
      );
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('update_timezone')
          .setLabel('Update Timezone')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('update_availability')
          .setLabel('Update Availability')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  } catch (error) {
    console.error('Error starting update flow:', error);
    await interaction.reply({ content: 'There was an error processing your update request. Please try again later.', ephemeral: true });
  }
}

/**
 * Start the timezone selection process
 * @param {Interaction} interaction - Discord interaction
 */
async function startTimezoneSelection(interaction) {
  try {
    // Create button for starting timezone selection
    const button = new ButtonBuilder()
      .setCustomId('select_timezone')
      .setLabel('Select Timezone')
      .setStyle(ButtonStyle.Primary);
    
    const row = new ActionRowBuilder().addComponents(button);
    
    // Create embed message
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Timezone Selection')
      .setDescription('Please select your timezone from the dropdown menu that will appear when you click the button below.');
    
    // Send the message with the button
    const response = await interaction.update({
      embeds: [embed],
      components: [row],
      ephemeral: true,
      fetchReply: true
    });
    
    // Create a collector for button interactions
    const filter = i => i.customId === 'select_timezone' && i.user.id === interaction.user.id;
    const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      try {
        // Get common timezones
        const commonTimezones = [
          'America/New_York',    // Eastern Time
          'America/Chicago',     // Central Time
          'America/Denver',      // Mountain Time
          'America/Los_Angeles', // Pacific Time
          'America/Anchorage',   // Alaska Time
          'Pacific/Honolulu',    // Hawaii Time
          'Europe/London',       // GMT/UTC
          'Europe/Paris',        // Central European Time
          'Europe/Moscow',       // Moscow Time
          'Asia/Tokyo',          // Japan Time
          'Asia/Shanghai',       // China Time
          'Asia/Kolkata',        // India Time
          'Australia/Sydney',    // Australian Eastern Time
          'Pacific/Auckland'     // New Zealand Time
        ];
        
        // Create select menu options
        const options = commonTimezones.map(tz => {
          const now = moment().tz(tz);
          const offset = now.format('Z');
          const label = `${tz.replace('_', ' ')} (${offset})`;
          return {
            label: label.length > 100 ? label.substring(0, 97) + '...' : label,
            value: tz,
            description: now.format('h:mm A')
          };
        });
        
        // Create select menu
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('timezone_select')
          .setPlaceholder('Select your timezone')
          .addOptions(options);
        
        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        
        // Update the message with the select menu
        await i.update({
          content: 'Please select your timezone:',
          components: [selectRow]
        });
        
        // Create a collector for the select menu
        const selectFilter = i => i.customId === 'timezone_select' && i.user.id === interaction.user.id;
        const selectCollector = response.createMessageComponentCollector({ filter: selectFilter, time: 300000 }); // 5 minute timeout
        
        selectCollector.on('collect', async i => {
          const selectedTimezone = i.values[0];
          
          try {
            // Check if user exists
            const existingUser = await getUser(interaction.user.id);
            
            if (existingUser) {
              // Update existing user
              await updateUser(interaction.user.id, { timezone: selectedTimezone });
            } else {
              // Create new user
              await createUser(interaction.user.id, interaction.user.username, selectedTimezone);
            }
            
            // Update the message
            await i.update({
              content: `Your timezone has been set to ${selectedTimezone}!`,
              components: [],
              embeds: []
            });
            
            // Start the next step of the setup process
            setTimeout(() => startSetupStep2(interaction), 1500);
          } catch (error) {
            console.error('Error saving timezone:', error);
            await i.update({
              content: 'There was an error saving your timezone. Please try again later.',
              components: [],
              embeds: []
            });
          }
        });
        
        selectCollector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            try {
              await interaction.followUp({
                content: 'Timezone selection timed out. Please try again later.',
                ephemeral: true
              });
            } catch (error) {
              console.error('Error sending timeout message:', error);
            }
          }
        });
      } catch (error) {
        console.error('Error in timezone selection:', error);
        await i.update({
          content: 'There was an error processing your request. Please try again later.',
          components: [],
          embeds: []
        });
      }
    });
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await interaction.followUp({
            content: 'Setup timed out. Please try again later.',
            ephemeral: true
          });
        } catch (error) {
          console.error('Error sending timeout message:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error in startTimezoneSelection:', error);
    await interaction.followUp({
      content: 'There was an error processing your request. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Start the second step of the setup process (Google Calendar)
 * @param {Interaction} interaction - Discord interaction
 */
async function startSetupStep2(interaction) {
  try {
    // Create embed for Google Calendar setup
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Google Calendar Integration')
      .setDescription('Would you like to connect your Google Calendar? This will allow Syncify to check your existing calendar events when scheduling meetings.')
      .addFields(
        { name: 'Note', value: 'You can skip this step and connect your calendar later using the `/calendars` command.' }
      );
    
    // Create buttons for connecting or skipping
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('connect_google_calendar')
          .setLabel('Connect Google Calendar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('skip_google_calendar')
          .setLabel('Skip for Now')
          .setStyle(ButtonStyle.Secondary)
      );
    
    // Send the message with buttons
    const response = await interaction.followUp({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
    
    // Create a collector for button interactions
    const filter = i => 
      (i.customId === 'connect_google_calendar' || i.customId === 'skip_google_calendar') && 
      i.user.id === interaction.user.id;
    
    const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      try {
        if (i.customId === 'connect_google_calendar') {
          // This would normally redirect to OAuth flow
          // For now, we'll just acknowledge and move to the next step
          await i.update({
            content: 'Google Calendar integration is not yet implemented. Skipping this step.',
            embeds: [],
            components: []
          });
        } else {
          // Skip Google Calendar integration
          await i.update({
            content: 'Skipping Google Calendar integration.',
            embeds: [],
            components: []
          });
        }
        
        // Start the next step
        setTimeout(() => startAvailabilitySetup(interaction), 1500);
      } catch (error) {
        console.error('Error in Google Calendar setup:', error);
        await i.update({
          content: 'There was an error processing your request. Please try again later.',
          components: [],
          embeds: []
        });
      }
    });
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await interaction.followUp({
            content: 'Setup timed out. Please try again later.',
            ephemeral: true
          });
        } catch (error) {
          console.error('Error sending timeout message:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error in startSetupStep2:', error);
    await interaction.followUp({
      content: 'There was an error processing your request. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Start the availability setup process
 * @param {Interaction} interaction - Discord interaction
 */
async function startAvailabilitySetup(interaction) {
  try {
    // Create embed for availability setup
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Set Your Availability')
      .setDescription('Let\'s set up your regular availability for meetings. First, let\'s set your weekday availability (Monday-Friday).')
      .addFields(
        { name: 'Note', value: 'You can update your availability later using the `/availability` command.' }
      );
    
    // Create button to start availability setup
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('start_weekday_availability')
          .setLabel('Set Weekday Availability')
          .setStyle(ButtonStyle.Primary)
      );
    
    // Send the message with button
    const response = await interaction.followUp({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
    
    // Create a collector for button interactions
    const filter = i => i.customId === 'start_weekday_availability' && i.user.id === interaction.user.id;
    const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      try {
        // Create modal for weekday availability
        const modal = new ModalBuilder()
          .setCustomId('weekday_availability_form')
          .setTitle('Weekday Availability');
        
        // Create text inputs for start and end times
        const startTimeInput = new TextInputBuilder()
          .setCustomId('weekday_start_time')
          .setLabel('Start Time (e.g., 9:00 AM)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('9:00 AM')
          .setRequired(true);
        
        const endTimeInput = new TextInputBuilder()
          .setCustomId('weekday_end_time')
          .setLabel('End Time (e.g., 5:00 PM)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('5:00 PM')
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
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await interaction.followUp({
            content: 'Setup timed out. Please try again later.',
            ephemeral: true
          });
        } catch (error) {
          console.error('Error sending timeout message:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error in startAvailabilitySetup:', error);
    await interaction.followUp({
      content: 'There was an error processing your request. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Process the weekday availability form submission
 * @param {Interaction} interaction - Discord interaction
 */
async function processWeekdayAvailabilityForm(interaction) {
  try {
    // Get form values
    const weekdayStartTime = interaction.fields.getTextInputValue('weekday_start_time');
    const weekdayEndTime = interaction.fields.getTextInputValue('weekday_end_time');
    
    // Store the values temporarily (in a real app, you'd save to database)
    const user = await getUser(interaction.user.id);
    
    // Create or update availability object
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
      .setDescription('Now, let\'s set your weekend availability (Saturday-Sunday).')
      .addFields(
        { name: 'Weekday Availability', value: `${weekdayStartTime} - ${weekdayEndTime}` }
      );
    
    // Create button to start weekend availability setup
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('start_weekend_availability')
          .setLabel('Set Weekend Availability')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('skip_weekend_availability')
          .setLabel('Not Available on Weekends')
          .setStyle(ButtonStyle.Secondary)
      );
    
    // Reply to the modal submission
    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
    
    // Create a collector for button interactions
    const filter = i => 
      (i.customId === 'start_weekend_availability' || i.customId === 'skip_weekend_availability') && 
      i.user.id === interaction.user.id;
    
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      try {
        if (i.customId === 'start_weekend_availability') {
          // Create modal for weekend availability
          const modal = new ModalBuilder()
            .setCustomId('weekend_availability_form')
            .setTitle('Weekend Availability');
          
          // Create text inputs for start and end times
          const startTimeInput = new TextInputBuilder()
            .setCustomId('weekend_start_time')
            .setLabel('Start Time (e.g., 10:00 AM)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('10:00 AM')
            .setRequired(true);
          
          const endTimeInput = new TextInputBuilder()
            .setCustomId('weekend_end_time')
            .setLabel('End Time (e.g., 4:00 PM)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('4:00 PM')
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
          
          // Update the message
          await i.update({
            content: 'Weekend availability set to not available.',
            embeds: [],
            components: []
          });
          
          // Start the final step
          setTimeout(() => startSetupStep3(interaction, availability), 1500);
        }
      } catch (error) {
        console.error('Error in weekend availability setup:', error);
        await i.update({
          content: 'There was an error processing your request. Please try again later.',
          components: [],
          embeds: []
        });
      }
    });
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await interaction.followUp({
            content: 'Setup timed out. Please try again later.',
            ephemeral: true
          });
        } catch (error) {
          console.error('Error sending timeout message:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error processing weekday availability form:', error);
    await interaction.reply({
      content: 'There was an error processing your availability. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Process the weekend availability form submission
 * @param {Interaction} interaction - Discord interaction
 */
async function processWeekendAvailabilityForm(interaction) {
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
    
    // Reply to the modal submission
    await interaction.reply({
      content: `Weekend availability set to ${weekendStartTime} - ${weekendEndTime}.`,
      ephemeral: true
    });
    
    // Start the final step
    setTimeout(() => startSetupStep3(interaction, availability), 1500);
  } catch (error) {
    console.error('Error processing weekend availability form:', error);
    await interaction.reply({
      content: 'There was an error processing your availability. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Start the final step of the setup process
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} availability - User's availability settings
 */
async function startSetupStep3(interaction, availability) {
  try {
    // Format availability for display
    let availabilityText = 'Weekdays: ';
    if (availability.weekdays) {
      availabilityText += `${availability.weekdays.start} - ${availability.weekdays.end}`;
    } else {
      availabilityText += 'Not set';
    }
    
    availabilityText += '\nWeekends: ';
    if (availability.weekends) {
      if (availability.weekends.available) {
        availabilityText += `${availability.weekends.start} - ${availability.weekends.end}`;
      } else {
        availabilityText += 'Not available';
      }
    } else {
      availabilityText += 'Not set';
    }
    
    // Create embed for setup completion
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Setup Complete!')
      .setDescription('Your profile has been set up successfully. You can now use Syncify to schedule meetings and manage your calendar.')
      .addFields(
        { name: 'Your Availability', value: availabilityText },
        { name: 'What\'s Next?', value: 'Try using `/schedule` to schedule a meeting or `/availability` to update your availability.' }
      );
    
    // Send the completion message
    await interaction.followUp({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    console.error('Error in startSetupStep3:', error);
    await interaction.followUp({
      content: 'There was an error completing your setup. Your preferences have been saved, but please try again later if you need to make changes.',
      ephemeral: true
    });
  }
}

// Export the functions for use in button interactions
module.exports.startTimezoneSelection = startTimezoneSelection;
module.exports.startSetupStep2 = startSetupStep2;
module.exports.processWeekdayAvailabilityForm = processWeekdayAvailabilityForm;
module.exports.processWeekendAvailabilityForm = processWeekendAvailabilityForm;