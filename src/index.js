const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { initializeReminderSystem } = require('./utils/reminders');

// Create a new client instance
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ] 
});

// Create a collection for commands
client.commands = new Collection();

// Create a map to track handled interactions
const handledInteractions = new Map();

// Load command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Handle interaction events
client.on(Events.InteractionCreate, async interaction => {
  try {
    // Check if interaction has already been handled
    if (handledInteractions.has(interaction.id)) {
      console.log(`Interaction ${interaction.id} has already been handled, skipping.`);
      return;
    }
    
    // Mark interaction as being handled
    handledInteractions.set(interaction.id, Date.now());
    
    // Clean up old entries from the map (older than 5 minutes)
    const now = Date.now();
    for (const [id, timestamp] of handledInteractions.entries()) {
      if (now - timestamp > 5 * 60 * 1000) {
        handledInteractions.delete(id);
      }
    }
    
    // Handle different interaction types
    if (interaction.isChatInputCommand()) {
      await handleCommandInteraction(interaction);
    } else if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalInteraction(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(interaction);
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    
    try {
      const replyOptions = {
        content: 'There was an error processing your interaction!',
        ephemeral: true
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyOptions);
      } else {
        await interaction.reply(replyOptions);
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
});

/**
 * Handle command interactions
 * @param {Interaction} interaction - Discord interaction
 */
async function handleCommandInteraction(interaction) {
  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}`);
    console.error(error);
    
    const replyOptions = {
      content: 'There was an error while executing this command!',
      ephemeral: true
    };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyOptions);
    } else {
      await interaction.reply(replyOptions);
    }
  }
}

/**
 * Handle button interactions
 * @param {Interaction} interaction - Discord interaction
 */
async function handleButtonInteraction(interaction) {
  const { customId } = interaction;
  
  try {
    // Handle setup command buttons
    if (customId === 'start_timezone_selection' || 
        customId === 'update_timezone') {
      const setupCommand = client.commands.get('setup');
      if (setupCommand && setupCommand.startTimezoneSelection) {
        await setupCommand.startTimezoneSelection(interaction);
      }
    }
    // Handle calendar-related buttons
    else if (customId === 'create_calendar' || 
             customId === 'sync_google_calendar') {
      const calendarsCommand = client.commands.get('calendars');
      if (calendarsCommand) {
        if (customId === 'create_calendar' && calendarsCommand.startCalendarCreation) {
          await calendarsCommand.startCalendarCreation(interaction);
        } else if (customId === 'sync_google_calendar' && calendarsCommand.startGoogleCalendarSync) {
          await calendarsCommand.startGoogleCalendarSync(interaction);
        }
      }
    }
    // Handle availability-related buttons
    else if (customId === 'update_availability' || 
             customId === 'update_weekday_availability' ||
             customId === 'update_weekend_availability' ||
             customId === 'skip_weekend_availability') {
      const availabilityCommand = client.commands.get('availability');
      if (availabilityCommand) {
        if (customId === 'update_availability' && availabilityCommand.startAvailabilityUpdate) {
          await availabilityCommand.startAvailabilityUpdate(interaction);
        } else if (customId === 'update_weekday_availability' && availabilityCommand.startWeekdayAvailabilityUpdate) {
          await availabilityCommand.startWeekdayAvailabilityUpdate(interaction);
        } else if ((customId === 'update_weekend_availability' || customId === 'skip_weekend_availability') && 
                  availabilityCommand.handleWeekendAvailabilityButton) {
          await availabilityCommand.handleWeekendAvailabilityButton(interaction);
        }
      }
    }
    // Handle meeting-related buttons
    else if (customId === 'confirm_meeting' || 
             customId === 'cancel_meeting') {
      const scheduleCommand = client.commands.get('schedule');
      if (scheduleCommand && scheduleCommand.handleMeetingConfirmation) {
        await scheduleCommand.handleMeetingConfirmation(interaction);
      }
    }
    // Handle group session-related buttons
    else if (customId === 'continue_to_scheduling' || 
             customId === 'cancel_group_session' ||
             customId === 'confirm_group_session') {
      const groupScheduleCommand = client.commands.get('group-schedule');
      if (groupScheduleCommand && groupScheduleCommand.handleGroupSessionButton) {
        await groupScheduleCommand.handleGroupSessionButton(interaction);
      }
    }
    else {
      console.log(`No handler found for button with customId: ${customId}`);
      await interaction.reply({
        content: 'This button is not currently supported.',
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(`Error handling button interaction (${customId}):`, error);
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error processing your request. Please try again later.',
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: 'There was an error processing your request. Please try again later.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handle modal interactions
 * @param {Interaction} interaction - Discord interaction
 */
async function handleModalInteraction(interaction) {
  const { customId } = interaction;
  
  try {
    // Handle setup command modals
    if (customId === 'weekday_availability_form') {
      const setupCommand = client.commands.get('setup');
      if (setupCommand && setupCommand.processWeekdayAvailabilityForm) {
        await setupCommand.processWeekdayAvailabilityForm(interaction);
      }
    }
    else if (customId === 'weekend_availability_form') {
      const setupCommand = client.commands.get('setup');
      if (setupCommand && setupCommand.processWeekendAvailabilityForm) {
        await setupCommand.processWeekendAvailabilityForm(interaction);
      }
    }
    // Handle calendar command modals
    else if (customId === 'calendar_details_form') {
      const calendarsCommand = client.commands.get('calendars');
      if (calendarsCommand && calendarsCommand.processCalendarDetailsForm) {
        await calendarsCommand.processCalendarDetailsForm(interaction);
      }
    }
    // Handle availability command modals
    else if (customId === 'weekday_availability_update_form') {
      const availabilityCommand = client.commands.get('availability');
      if (availabilityCommand && availabilityCommand.processWeekdayAvailabilityUpdateForm) {
        await availabilityCommand.processWeekdayAvailabilityUpdateForm(interaction);
      }
    }
    else if (customId === 'weekend_availability_update_form') {
      const availabilityCommand = client.commands.get('availability');
      if (availabilityCommand && availabilityCommand.processWeekendAvailabilityUpdateForm) {
        await availabilityCommand.processWeekendAvailabilityUpdateForm(interaction);
      }
    }
    // Handle schedule command modals
    else if (customId === 'meeting_details_form') {
      const scheduleCommand = client.commands.get('schedule');
      if (scheduleCommand && scheduleCommand.processMeetingDetailsForm) {
        await scheduleCommand.processMeetingDetailsForm(interaction);
      }
    }
    // Handle group schedule command modals
    else if (customId === 'group_session_details_form') {
      const groupScheduleCommand = client.commands.get('group-schedule');
      if (groupScheduleCommand && groupScheduleCommand.processGroupSessionDetailsForm) {
        await groupScheduleCommand.processGroupSessionDetailsForm(interaction);
      }
    }
    else if (customId === 'date_range_form') {
      const groupScheduleCommand = client.commands.get('group-schedule');
      if (groupScheduleCommand && groupScheduleCommand.processDateRangeForm) {
        await groupScheduleCommand.processDateRangeForm(interaction);
      }
    }
    else {
      console.log(`No handler found for modal with customId: ${customId}`);
      await interaction.reply({
        content: 'This form is not currently supported.',
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(`Error handling modal interaction (${customId}):`, error);
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error processing your form submission. Please try again later.',
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: 'There was an error processing your form submission. Please try again later.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handle select menu interactions
 * @param {Interaction} interaction - Discord interaction
 */
async function handleSelectMenuInteraction(interaction) {
  const { customId } = interaction;
  
  try {
    // Handle timezone selection
    if (customId === 'timezone_select') {
      const setupCommand = client.commands.get('setup');
      if (setupCommand && setupCommand.handleTimezoneSelection) {
        await setupCommand.handleTimezoneSelection(interaction);
      }
    }
    // Handle calendar selection
    else if (customId === 'calendar_select') {
      const scheduleCommand = client.commands.get('schedule');
      if (scheduleCommand && scheduleCommand.handleCalendarSelection) {
        await scheduleCommand.handleCalendarSelection(interaction);
      }
    }
    // Handle time selection for group scheduling
    else if (customId === 'time_select') {
      const groupScheduleCommand = client.commands.get('group-schedule');
      if (groupScheduleCommand && groupScheduleCommand.handleTimeSelection) {
        await groupScheduleCommand.handleTimeSelection(interaction);
      }
    }
    else {
      console.log(`No handler found for select menu with customId: ${customId}`);
      await interaction.reply({
        content: 'This selection is not currently supported.',
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(`Error handling select menu interaction (${customId}):`, error);
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error processing your selection. Please try again later.',
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: 'There was an error processing your selection. Please try again later.',
        ephemeral: true
      });
    }
  }
}

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, readyClient => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  
  // Initialize the reminder system
  initializeReminderSystem(client);
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);