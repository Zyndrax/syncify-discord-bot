# Syncify

Syncify is a Discord bot that helps users schedule meetings with each other based on their availability. It integrates with Supabase for data storage and optionally with Google Calendar for syncing meetings.

## Features

- **Multiple Calendars**: Users can create and manage multiple calendars, each with its own availability settings
- **Availability Management**: Set your available days and times for each calendar
- **Meeting Scheduling**: Schedule meetings with other Discord users based on their availability
- **Calendar View**: View your schedule in a calendar format
- **Meeting Management**: View and manage your upcoming meetings
- **Google Calendar Integration**: (Optional) Sync your meetings with Google Calendar

## Commands

- `/setup` - Set up your Syncify profile and create your first calendar
- `/calendars` - Manage your calendars
  - `/calendars list` - List all your calendars
  - `/calendars create` - Create a new calendar
  - `/calendars rename` - Rename a calendar
  - `/calendars set_default` - Set a calendar as your default calendar
  - `/calendars availability` - Update the availability for a calendar
- `/availability` - Update your availability settings for a specific calendar
- `/schedule` - View your schedule for a specific month
- `/scheduler` - Schedule a meeting with another user
- `/meetings` - View your upcoming meetings
  - `/meetings list` - List all your upcoming meetings
  - `/meetings today` - View your meetings for today
  - `/meetings week` - View your meetings for this week

## Setup

### Prerequisites

- Node.js (v16 or higher)
- A Discord bot token
- A Supabase project

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/syncify.git
   cd syncify
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on the `.env.example` file:
   ```
   cp .env.example .env
   ```

4. Fill in the required environment variables in the `.env` file:
   - `DISCORD_TOKEN`: Your Discord bot token
   - `CLIENT_ID`: Your Discord application client ID
   - `GUILD_ID`: (Optional) Your test guild ID for guild-specific command deployment
   - `DEPLOY_GLOBAL`: Set to 'true' to deploy commands globally, or leave unset to deploy to a specific guild
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_KEY`: Your Supabase service role key
   - `GOOGLE_CLIENT_ID`: (Optional) Your Google API client ID
   - `GOOGLE_CLIENT_SECRET`: (Optional) Your Google API client secret
   - `GOOGLE_REDIRECT_URI`: (Optional) Your Google API redirect URI

5. Set up the Supabase database schema:
   - Run the SQL commands in `supabase-schema.sql` in your Supabase SQL editor

6. Deploy the commands to Discord:
   ```
   node src/deploy-commands.js
   ```
   
   Command deployment options:
   - **Guild-specific deployment** (for testing): Set `GUILD_ID` in your `.env` file and leave `DEPLOY_GLOBAL` unset or set to 'false'
   - **Global deployment** (for production): Set `DEPLOY_GLOBAL=true` in your `.env` file
   
   Note: Global commands can take up to an hour to propagate to all servers.

7. Start the bot:
   ```
   node src/index.js
   ```

## Database Schema

The Supabase database schema includes the following tables:

- `users` - Stores user information
- `calendars` - Stores calendar information for each user
- `meetings` - Stores meeting information

## License

This project is licensed under the MIT License - see the LICENSE file for details.