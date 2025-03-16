const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
// Grab all the command files from the commands directory
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
    const command = require(filePath);
    if ('data' in command) {
      // Get the command data
      const commandData = command.data.toJSON();
      
      // Add contexts from the command file if available, otherwise use default
      if ('contexts' in command) {
        commandData.contexts = command.contexts;
      } else {
        // Default to all contexts if not specified
        commandData.contexts = [0, 1, 2]; // 0 = GUILD, 1 = BOT_DM, 2 = PRIVATE_CHANNEL
      }
      
      // Add integration_types from the command file if available, otherwise use default
      if ('integration_types' in command) {
        commandData.integration_types = command.integration_types;
      } else {
        // Default to guild install if not specified
        commandData.integration_types = [1]; // 1 = GUILD_INSTALL
      }
      
      commands.push(commandData);
      console.log(`Added command: ${command.data.name}`);
    } else {
      console.log(`[WARNING] The command at ${filePath} is missing a required "data" property.`);
    }
  } catch (error) {
    console.error(`[ERROR] Failed to load command from ${filePath}:`, error.message);
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Deploy commands
(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    let data;
    
    // Check if GUILD_ID is provided and if DEPLOY_GLOBAL is not set to true
    if (process.env.GUILD_ID && process.env.DEPLOY_GLOBAL !== 'true') {
      // Deploy commands to a specific guild (for testing)
      data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );
      console.log(`Successfully reloaded ${data.length} application (/) commands for guild ${process.env.GUILD_ID}.`);
      console.log('Note: For production, set DEPLOY_GLOBAL=true in your .env file to deploy commands globally.');
    } else {
      // Deploy commands globally (for production)
      data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
      console.log(`Successfully reloaded ${data.length} application (/) commands globally.`);
      console.log('Note: Global commands can take up to an hour to propagate to all servers.');
    }
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
})();