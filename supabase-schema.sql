-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    google_refresh_token TEXT,
    google_access_token TEXT,
    google_token_expiry TIMESTAMP WITH TIME ZONE,
    google_calendar_id TEXT
);

-- Create calendars table
CREATE TABLE IF NOT EXISTS public.calendars (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    availability JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    google_calendar_id TEXT,
    color TEXT DEFAULT '#0099ff'
);

-- Create meetings table
CREATE TABLE IF NOT EXISTS public.meetings (
    id SERIAL PRIMARY KEY,
    calendar_id INTEGER NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    google_event_id TEXT,
    attendee_id TEXT REFERENCES public.users(user_id) ON DELETE SET NULL,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
    recurring_rule TEXT,
    reminder_sent BOOLEAN DEFAULT false
);

-- Create group_sessions table
CREATE TABLE IF NOT EXISTS public.group_sessions (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    duration INTEGER NOT NULL, -- in minutes
    start_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    is_private BOOLEAN DEFAULT false,
    availability JSONB,
    selected_time TIMESTAMP WITH TIME ZONE,
    selected_timezone TEXT
);

-- Create group_participants table
CREATE TABLE IF NOT EXISTS public.group_participants (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    availability JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    UNIQUE(session_id, user_id)
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    meeting_id INTEGER REFERENCES public.meetings(id) ON DELETE CASCADE,
    group_session_id TEXT REFERENCES public.group_sessions(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    type TEXT NOT NULL CHECK (type IN ('meeting_reminder', 'meeting_invitation', 'group_invitation', 'group_update'))
);

-- Create user preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id TEXT PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
    reminder_time INTEGER DEFAULT 30, -- minutes before meeting
    notification_enabled BOOLEAN DEFAULT true,
    email_notification_enabled BOOLEAN DEFAULT false,
    email TEXT,
    theme TEXT DEFAULT 'light',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_calendars_user_id ON public.calendars(user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_calendar_id ON public.meetings(calendar_id);
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON public.meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_group_sessions_host_id ON public.group_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_session_id ON public.group_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_user_id ON public.group_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calendars_updated_at BEFORE UPDATE ON public.calendars FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_group_sessions_updated_at BEFORE UPDATE ON public.group_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_group_participants_updated_at BEFORE UPDATE ON public.group_participants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();