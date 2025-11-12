-- PostgreSQL Schema for UC-AIv2 Context Management

-- Messages table without embeddings
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    discord_message_id VARCHAR(255),
    content TEXT NOT NULL,
    author_id VARCHAR(255) NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    channel_id VARCHAR(255) NOT NULL,
    guild_id VARCHAR(255),
    message_type VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_guild_id ON messages(guild_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_message_type ON messages(message_type);

-- Full-text search index for content-based search
CREATE INDEX IF NOT EXISTS idx_messages_content ON messages USING gin(to_tsvector('english', content));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();