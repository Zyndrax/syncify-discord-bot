const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder } = require('discord.js');
const { getUser, createGroupSession, addGroupParticipant } = require('../utils/database');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('group-schedule')
    .setDescription('Schedule a group meeting with multiple participants')
    .setDMPermission(false),
  
  contexts: [1], // GUILD only
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
      
      // Start the group scheduling process
      await startGroupSchedulingProcess(interaction, user);
    } catch (error) {
      console.error('Error in group-schedule command:', error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
      }
    }
  }
};

/**
 * Start the group scheduling process
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} user - User object from database
 */
async function startGroupSchedulingProcess(interaction, user) {
  try {
    // Create modal for group session details
    const modal = new ModalBuilder()
      .setCustomId('group_session_details_form')
      .setTitle('Group Session Details');
    
    // Create text inputs for session details
    const titleInput = new TextInputBuilder()
      .setCustomId('session_title')
      .setLabel('Session Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Team Planning Session')
      .setRequired(true);
    
    const durationInput = new TextInputBuilder()
      .setCustomId('session_duration')
      .setLabel('Duration (minutes)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('60')
      .setRequired(true);
    
    const descriptionInput = new TextInputBuilder()
      .setCustomId('session_description')
      .setLabel('Description (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Discuss project roadmap and assign tasks')
      .setRequired(false);
    
    // Add inputs to modal
    const titleRow = new ActionRowBuilder().addComponents(titleInput);
    const durationRow = new ActionRowBuilder().addComponents(durationInput);
    const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
    
    modal.addComponents(titleRow, durationRow, descriptionRow);
    
    // Show the modal
    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error starting group scheduling process:', error);
    await interaction.reply({
      content: 'There was an error starting the group scheduling process. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Process the group session details form submission
 * @param {Interaction} interaction - Discord interaction
 */
async function processGroupSessionDetailsForm(interaction) {
  try {
    // Get form values
    const title = interaction.fields.getTextInputValue('session_title');
    const durationStr = interaction.fields.getTextInputValue('session_duration');
    const description = interaction.fields.getTextInputValue('session_description') || '';
    
    // Parse duration
    const duration = parseInt(durationStr, 10);
    
    if (isNaN(duration) || duration <= 0) {
      await interaction.reply({
        content: 'Invalid duration. Please enter a positive number of minutes.',
        ephemeral: true
      });
      return;
    }
    
    // Create the group session in the database
    const session = await createGroupSession(
      interaction.user.id,
      title,
      duration
    );
    
    // Store session data in a global variable (in a real app, use a database or session)
    global.pendingGroupSessions = global.pendingGroupSessions || {};
    global.pendingGroupSessions[interaction.user.id] = {
      sessionId: session.id,
      title: title,
      duration: duration,
      description: description,
      participants: []
    };
    
    // Create embed for participant selection
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Add Participants')
      .setDescription(`Please select participants for your group session "${title}".`)
      .addFields(
        { name: 'Duration', value: `${duration} minutes`, inline: true },
        { name: 'Host', value: `<@${interaction.user.id}>`, inline: true }
      );
    
    if (description) {
      embed.addFields({ name: 'Description', value: description });
    }
    
    // Create user select menu for participants
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('participant_select')
      .setPlaceholder('Select participants')
      .setMinValues(1)
      .setMaxValues(10);
    
    const selectRow = new ActionRowBuilder().addComponents(userSelect);
    
    // Create buttons for next steps
    const buttonRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('continue_to_scheduling')
          .setLabel('Continue to Scheduling')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('cancel_group_session')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
    
    // Send the message with the select menu and buttons
    const response = await interaction.reply({
      embeds: [embed],
      components: [selectRow, buttonRow],
      ephemeral: true,
      fetchReply: true
    });
    
    // Create collectors for the select menu and buttons
    const filter = i => 
      (i.customId === 'participant_select' || 
       i.customId === 'continue_to_scheduling' || 
       i.customId === 'cancel_group_session') && 
      i.user.id === interaction.user.id;
    
    const collector = response.createMessageComponentCollector({ filter, time: 600000 }); // 10 minute timeout
    
    collector.on('collect', async i => {
      try {
        if (i.customId === 'participant_select') {
          // Get selected users
          const selectedUsers = i.values;
          
          // Update the session data
          const sessionData = global.pendingGroupSessions[interaction.user.id];
          sessionData.participants = selectedUsers;
          
          // Add participants to the database
          for (const userId of selectedUsers) {
            try {
              await addGroupParticipant(sessionData.sessionId, userId);
            } catch (error) {
              console.error(`Error adding participant ${userId}:`, error);
            }
          }
          
          // Update the embed
          const updatedEmbed = EmbedBuilder.from(embed)
            .addFields({ name: 'Participants', value: selectedUsers.map(id => `<@${id}>`).join(', ') });
          
          // Update the message
          await i.update({
            embeds: [updatedEmbed],
            components: [selectRow, buttonRow]
          });
        } else if (i.customId === 'continue_to_scheduling') {
          // Get the session data
          const sessionData = global.pendingGroupSessions[interaction.user.id];
          
          if (!sessionData.participants || sessionData.participants.length === 0) {
            await i.update({
              content: 'Please select at least one participant before continuing.',
              components: [selectRow, buttonRow],
              embeds: [embed]
            });
            return;
          }
          
          // Update the message
          await i.update({
            content: 'Moving to scheduling...',
            components: [],
            embeds: []
          });
          
          // Start the scheduling process
          setTimeout(() => startGroupScheduling(interaction, sessionData), 1000);
        } else {
          // Cancel the session
          const sessionData = global.pendingGroupSessions[interaction.user.id];
          
          // TODO: Delete the session from the database
          
          // Update the message
          await i.update({
            content: 'Group session cancelled.',
            components: [],
            embeds: []
          });
          
          // Clean up
          delete global.pendingGroupSessions[interaction.user.id];
        }
      } catch (error) {
        console.error('Error processing participant selection:', error);
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
            content: 'Group session setup timed out. Please try again later.',
            ephemeral: true
          });
          
          // Clean up
          delete global.pendingGroupSessions[interaction.user.id];
        } catch (error) {
          console.error('Error sending timeout message:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error processing group session details form:', error);
    await interaction.reply({
      content: 'There was an error processing your group session details. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Start the group scheduling process
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} sessionData - Group session data
 */
async function startGroupScheduling(interaction, sessionData) {
  try {
    // Create embed for date selection
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Select Date Range')
      .setDescription(`Let's find the best time for your group session "${sessionData.title}".`)
      .addFields(
        { name: 'Step 1', value: 'Select a date range to check availability.' },
        { name: 'Participants', value: sessionData.participants.map(id => `<@${id}>`).join(', ') }
      );
    
    // Create modal for date range
    const modal = new ModalBuilder()
      .setCustomId('date_range_form')
      .setTitle('Select Date Range');
    
    // Create text inputs for date range
    const startDateInput = new TextInputBuilder()
      .setCustomId('start_date')
      .setLabel('Start Date (YYYY-MM-DD)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(moment().format('YYYY-MM-DD'))
      .setRequired(true);
    
    const endDateInput = new TextInputBuilder()
      .setCustomId('end_date')
      .setLabel('End Date (YYYY-MM-DD)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(moment().add(7, 'days').format('YYYY-MM-DD'))
      .setRequired(true);
    
    // Add inputs to modal
    const startDateRow = new ActionRowBuilder().addComponents(startDateInput);
    const endDateRow = new ActionRowBuilder().addComponents(endDateInput);
    
    modal.addComponents(startDateRow, endDateRow);
    
    // Send the message and show the modal
    await interaction.followUp({
      embeds: [embed],
      ephemeral: true
    });
    
    await interaction.showModal(modal);
    
    // Store session data for later use
    global.pendingGroupSessions[interaction.user.id] = sessionData;
  } catch (error) {
    console.error('Error starting group scheduling:', error);
    await interaction.followUp({
      content: 'There was an error starting the group scheduling process. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Process the date range form submission
 * @param {Interaction} interaction - Discord interaction
 */
async function processDateRangeForm(interaction) {
  try {
    // Get form values
    const startDateStr = interaction.fields.getTextInputValue('start_date');
    const endDateStr = interaction.fields.getTextInputValue('end_date');
    
    // Parse dates
    const startDate = moment(startDateStr, 'YYYY-MM-DD');
    const endDate = moment(endDateStr, 'YYYY-MM-DD');
    
    if (!startDate.isValid() || !endDate.isValid()) {
      await interaction.reply({
        content: 'Invalid date format. Please use YYYY-MM-DD.',
        ephemeral: true
      });
      return;
    }
    
    if (endDate.isBefore(startDate)) {
      await interaction.reply({
        content: 'End date must be after start date.',
        ephemeral: true
      });
      return;
    }
    
    // Get the session data
    const sessionData = global.pendingGroupSessions[interaction.user.id];
    
    if (!sessionData) {
      await interaction.reply({
        content: 'Your session has expired. Please start over with `/group-schedule`.',
        ephemeral: true
      });
      return;
    }
    
    // Update session data with date range
    sessionData.startDate = startDate.format('YYYY-MM-DD');
    sessionData.endDate = endDate.format('YYYY-MM-DD');
    
    // In a real app, this would query the database for participant availability
    // For now, we'll simulate finding available times
    
    // Create embed for available times
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Available Times')
      .setDescription(`Here are some potential times for your group session "${sessionData.title}".`)
      .addFields(
        { name: 'Date Range', value: `${startDate.format('MMMM D, YYYY')} to ${endDate.format('MMMM D, YYYY')}` },
        { name: 'Duration', value: `${sessionData.duration} minutes` }
      );
    
    // Create select menu for available times
    // In a real app, these would be calculated based on participant availability
    const options = [
      {
        label: `${startDate.format('ddd, MMM D')} at 9:00 AM`,
        value: `${startDate.format('YYYY-MM-DD')}_09:00`,
        description: 'All participants available'
      },
      {
        label: `${startDate.format('ddd, MMM D')} at 2:00 PM`,
        value: `${startDate.format('YYYY-MM-DD')}_14:00`,
        description: 'All participants available'
      },
      {
        label: `${startDate.add(1, 'day').format('ddd, MMM D')} at 10:00 AM`,
        value: `${startDate.format('YYYY-MM-DD')}_10:00`,
        description: 'All participants available'
      },
      {
        label: `${startDate.add(1, 'day').format('ddd, MMM D')} at 3:00 PM`,
        value: `${startDate.format('YYYY-MM-DD')}_15:00`,
        description: 'Most participants available'
      }
    ];
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('time_select')
      .setPlaceholder('Select a time')
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
    const filter = i => i.customId === 'time_select' && i.user.id === interaction.user.id;
    const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      try {
        const selectedTimeValue = i.values[0];
        const [dateStr, timeStr] = selectedTimeValue.split('_');
        
        // Format the selected time
        const selectedDateTime = moment(`${dateStr} ${timeStr}`, 'YYYY-MM-DD HH:mm');
        const formattedDateTime = selectedDateTime.format('dddd, MMMM D, YYYY [at] h:mm A');
        
        // Update session data with selected time
        sessionData.scheduledDate = dateStr;
        sessionData.scheduledTime = timeStr;
        
        // Create confirmation embed
        const confirmEmbed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('Confirm Group Session')
          .setDescription(`Please confirm your group session "${sessionData.title}":`)
          .addFields(
            { name: 'Time', value: formattedDateTime, inline: true },
            { name: 'Duration', value: `${sessionData.duration} minutes`, inline: true },
            { name: 'Participants', value: sessionData.participants.map(id => `<@${id}>`).join(', ') }
          );
        
        if (sessionData.description) {
          confirmEmbed.addFields({ name: 'Description', value: sessionData.description });
        }
        
        // Create buttons for confirmation
        const buttonRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('confirm_group_session')
              .setLabel('Confirm')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('cancel_group_session')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
          );
        
        // Update the message
        await i.update({
          embeds: [confirmEmbed],
          components: [buttonRow]
        });
        
        // Create a collector for the buttons
        const buttonFilter = i => 
          (i.customId === 'confirm_group_session' || i.customId === 'cancel_group_session') && 
          i.user.id === interaction.user.id;
        
        const buttonCollector = response.createMessageComponentCollector({ filter: buttonFilter, time: 300000 }); // 5 minute timeout
        
        buttonCollector.on('collect', async i => {
          try {
            if (i.customId === 'confirm_group_session') {
              // In a real app, this would update the database with the scheduled time
              // and send notifications to participants
              
              // Update the message
              await i.update({
                content: `Group session "${sessionData.title}" has been scheduled for ${formattedDateTime}.`,
                embeds: [],
                components: []
              });
              
              // Send a message to the channel
              await interaction.channel.send({
                content: `<@${interaction.user.id}> has scheduled a group session!`,
                embeds: [
                  new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(sessionData.title)
                    .setDescription(sessionData.description || 'No description provided.')
                    .addFields(
                      { name: 'Time', value: formattedDateTime, inline: true },
                      { name: 'Duration', value: `${sessionData.duration} minutes`, inline: true },
                      { name: 'Host', value: `<@${interaction.user.id}>`, inline: true },
                      { name: 'Participants', value: sessionData.participants.map(id => `<@${id}>`).join(', ') }
                    )
                ]
              });
              
              // Clean up
              delete global.pendingGroupSessions[interaction.user.id];
            } else {
              // Cancel the session
              await i.update({
                content: 'Group session cancelled.',
                embeds: [],
                components: []
              });
              
              // Clean up
              delete global.pendingGroupSessions[interaction.user.id];
            }
          } catch (error) {
            console.error('Error processing group session confirmation:', error);
            await i.update({
              content: 'There was an error scheduling your group session. Please try again later.',
              embeds: [],
              components: []
            });
          }
        });
      } catch (error) {
        console.error('Error processing time selection:', error);
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
            content: 'Time selection timed out. Please try again later.',
            ephemeral: true
          });
          
          // Clean up
          delete global.pendingGroupSessions[interaction.user.id];
        } catch (error) {
          console.error('Error sending timeout message:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error processing date range form:', error);
    await interaction.reply({
      content: 'There was an error processing your date range. Please try again later.',
      ephemeral: true
    });
  }
}

// Export the functions for use in modal submissions
module.exports.processGroupSessionDetailsForm = processGroupSessionDetailsForm;
module.exports.processDateRangeForm = processDateRangeForm;