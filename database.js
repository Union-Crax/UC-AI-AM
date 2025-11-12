// Database connection and initialization for UC-AIv2
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

let dbConfig;

if (process.env.DATABASE_URL) {
    // Use direct PostgreSQL connection string
    dbConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 20, // Maximum number of connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000, // Increased for remote connections
    };
} else {
    // Use individual connection parameters
    dbConfig = {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT) || 5432,
        database: process.env.POSTGRES_DB || 'uc_aiv2',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'password',
        ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    };
}

const pool = new Pool(dbConfig);

export async function testConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as current_time');
        client.release();
        console.log('PostgreSQL connected successfully');
        console.log('   Current time:', result.rows[0].current_time);
        return true;
    } catch (error) {
        console.error('PostgreSQL connection failed:', error.message);
        console.error('   Make sure PostgreSQL is running and configuration is correct');
        return false;
    }
}

// Initialize database schema
export async function initializeDatabase() {
    try {
        const client = await pool.connect();
        
        // Read and execute schema file
        const schemaPath = path.join(process.cwd(), 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        await client.query(schema);
        console.log('Database schema initialized successfully');
        
        client.release();
        return true;
    } catch (error) {
        console.error('Database initialization failed:', error.message);
        return false;
    }
}

// Store message with embedding
export async function storeMessage(messageData) {
    const {
        discordMessageId,
        content,
        authorId,
        authorName,
        channelId,
        guildId,
        messageType,
        embedding
    } = messageData;

    try {
        const client = await pool.connect();
        
        const query = `
            INSERT INTO messages (
                discord_message_id, content, author_id, author_name,
                channel_id, guild_id, message_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, created_at
        `;
        
        const values = [
            discordMessageId,
            content,
            authorId,
            authorName,
            channelId,
            guildId || null,
            messageType || 'user'
        ];
        
        const result = await client.query(query, values);
        client.release();
        
        return result.rows[0];
    } catch (error) {
        console.error('Failed to store message:', error.message);
        return null;
    }
}

// Search for similar messages using text similarity
export async function findSimilarMessages(queryText, guildId, authorId = null, limit = 5) {
    try {
        const client = await pool.connect();

        let query = `
            SELECT
                id,
                content,
                author_name,
                message_type,
                created_at,
                ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) as similarity_score
            FROM messages
            WHERE guild_id = $2
            AND to_tsvector('english', content) @@ plainto_tsquery('english', $1)
        `;

        const values = [queryText, guildId, limit];
        
        // Add user filter if authorId is provided
        if (authorId) {
            query += ` AND author_id = $4`;
            values[3] = authorId;
        }
        
        query += `
            ORDER BY similarity_score DESC, created_at DESC
            LIMIT $3
        `;
        
        const result = await client.query(query, values);
        
        client.release();
        return result.rows;
    } catch (error) {
        console.error('Failed to search similar messages:', error.message);
        return [];
    }
}

// Get recent messages for context (fallback when semantic search fails)
export async function getRecentMessages(guildId, authorId = null, limit = 10) {
    try {
        const client = await pool.connect();

        let query = `
            SELECT content, author_name, message_type, created_at
            FROM messages
            WHERE guild_id = $1
        `;

        const values = [guildId, limit];
        
        // Add user filter if authorId is provided
        if (authorId) {
            query += ` AND author_id = $3`;
            values[2] = authorId;
        }
        
        query += `
            ORDER BY created_at DESC
            LIMIT $2
        `;
        
        const result = await client.query(query, values);
        
        client.release();
        return result.rows;
    } catch (error) {
        console.error('Failed to get recent messages:', error.message);
        return [];
    }
}

// Clean up old messages
export async function cleanupOldMessages(daysOld = 30) {
    try {
        const client = await pool.connect();
        
        const query = `
            DELETE FROM messages 
            WHERE created_at < NOW() - INTERVAL '${daysOld} days'
            AND message_type = 'user'
        `;
        
        const result = await client.query(query);
        client.release();
        
        console.log(`Cleaned up ${result.rowCount} old messages`);
        return result.rowCount;
    } catch (error) {
        console.error('Failed to cleanup old messages:', error.message);
        return 0;
    }
}

// Close database connection pool
export async function closeDatabase() {
    try {
        await pool.end();
        console.log('Database connections closed');
    } catch (error) {
        console.error('Error closing database connections:', error.message);
    }
}

export { pool };