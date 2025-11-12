import {
    storeMessage,
    findSimilarMessages,
    getRecentMessages,
    cleanupOldMessages
} from './database.js';

// Configuration
const ENABLE_SEMANTIC_SEARCH = process.env.ENABLE_SEMANTIC_SEARCH === 'true';
const MAX_CONTEXT_MESSAGES = parseInt(process.env.MAX_CONTEXT_MESSAGES) || 20;
const CONTEXT_SIMILARITY_THRESHOLD = parseFloat(process.env.CONTEXT_SIMILARITY_THRESHOLD) || 0.7;
const DEBUG = process.env.DEBUG === 'true';

class SemanticContextManager {
    constructor() {
        this.isInitialized = false;
        this.messageCache = new Map(); // Temporary cache for quick access
    }

    /**
     * Initialize the semantic context manager
     */
    async initialize() {
        try {
            console.log('Init Semantic Context Manager...');
            
            // Cleanup old messages on startup
            await this.performCleanup();
            
            this.isInitialized = true;
            console.log('Semantic Context Manager init successfully');
            
            return true;
        } catch (error) {
            console.error('Failed to init Semantic Context Manager:', error.message);
            return false;
        }
    }

    /**
     * Store a user message
     */
    async storeUserMessage(messageData) {
        const {
            discordMessageId,
            content,
            authorId,
            authorName,
            channelId,
            guildId
        } = messageData;

        try {
            // Store in database (no embeddings needed)
            const result = await storeMessage({
                discordMessageId,
                content,
                authorId,
                authorName,
                channelId,
                guildId,
                messageType: 'user'
            });

            if (result) {
                // Cache for quick access
                this.messageCache.set(discordMessageId, {
                    content,
                    authorName,
                    messageType: 'user',
                    created_at: result.created_at
                });
            }

            return result;
        } catch (error) {
            console.error('Failed to store user message:', error.message);
            return null;
        }
    }

    /**
     * Store an assistant response
     */
    async storeAssistantMessage(messageData) {
        const {
            discordMessageId,
            content,
            channelId,
            guildId
        } = messageData;

        try {
            // Store in database (no embeddings needed)
            const result = await storeMessage({
                discordMessageId,
                content,
                authorId: 'assistant',
                authorName: 'AM',
                channelId,
                guildId,
                messageType: 'assistant'
            });

            if (result) {
                // Cache for quick access
                this.messageCache.set(discordMessageId, {
                    content,
                    authorName: 'AM',
                    messageType: 'assistant',
                    created_at: result.created_at
                });
            }

            return result;
        } catch (error) {
            console.error('Failed to store assistant message:', error.message);
            return null;
        }
    }

    /**
     * Get relevant context for a new message using text-based search
     */
    async getRelevantContext(userInput, guildId, userId = null) {
        try {
            // Check cache first (include userId in cache key)
            const cacheKey = `${guildId}_${userId || 'all'}_${Buffer.from(userInput).toString('base64')}`;
            
            if (this.messageCache.has(cacheKey)) {
                return this.messageCache.get(cacheKey);
            }

            let context = [];

            if (ENABLE_SEMANTIC_SEARCH) {
                // Search for similar messages using text search
                const similarMessages = await findSimilarMessages(
                    userInput,
                    guildId,
                    userId,
                    Math.floor(MAX_CONTEXT_MESSAGES / 2)
                );

                if (similarMessages.length > 0) {
                    context = similarMessages.map(msg => ({
                        content: msg.content,
                        author: msg.author_name,
                        type: msg.message_type,
                        similarity: parseFloat(msg.similarity_score) || 0,
                        timestamp: msg.created_at
                    }));

                    if (DEBUG) {
                        console.log(`Found ${context.length} textually relevant messages`);
                        console.log(`   Average similarity: ${(context.reduce((sum, msg) => sum + msg.similarity, 0) / context.length).toFixed(3)}`);
                    }
                }
            }

            if (context.length < MAX_CONTEXT_MESSAGES / 2) {
                const recentMessages = await getRecentMessages(
                    guildId,
                    userId,
                    MAX_CONTEXT_MESSAGES - context.length
                );

                // Add recent messages that aren't already in context
                for (const msg of recentMessages) {
                    if (!context.some(existing => existing.content === msg.content)) {
                        context.push({
                            content: msg.content,
                            author: msg.author_name,
                            type: msg.message_type,
                            timestamp: msg.created_at,
                            isRecent: true
                        });
                    }
                }
            }

            // Sort by relevance (text similarity first, then recency)
            context.sort((a, b) => {
                if (a.similarity && b.similarity) {
                    return b.similarity - a.similarity;
                } else if (a.similarity && !b.similarity) {
                    return -1;
                } else if (!a.similarity && b.similarity) {
                    return 1;
                } else {
                    return new Date(b.timestamp) - new Date(a.timestamp);
                }
            });

            // Cache the result
            this.messageCache.set(cacheKey, context);

            // Limit context size
            const finalContext = context.slice(0, MAX_CONTEXT_MESSAGES);
            
            if (DEBUG) {
                console.log(`Context retrieved: ${finalContext.length} messages`);
            }

            return finalContext;

        } catch (error) {
            console.error('Failed to get relevant context:', error.message);
            
            // Fallback to simple recent messages
            try {
                const recentMessages = await getRecentMessages(guildId, userId, MAX_CONTEXT_MESSAGES);
                return recentMessages.map(msg => ({
                    content: msg.content,
                    author: msg.author_name,
                    type: msg.message_type,
                    timestamp: msg.created_at
                }));
            } catch (fallbackError) {
                console.error('Fallback context retrieval also failed:', fallbackError.message);
                return [];
            }
        }
    }

    /**
     * Perform cleanup of old messages
     */
    async performCleanup() {
        try {
            const cleanedCount = await cleanupOldMessages(30);
            
            if (cleanedCount > 0) {
                console.log(`Cleaned up ${cleanedCount} old messages`);
            }
        } catch (error) {
            console.error('Cleanup failed:', error.message);
        }
    }

    /**
     * Get statistics about the context database
     */
    async getStatistics() {
        try {
            const client = require('./database.js').pool.connect();
            
            const result = await client.query(`
                SELECT 
                    COUNT(*) as total_messages,
                    COUNT(CASE WHEN message_type = 'user' THEN 1 END) as user_messages,
                    COUNT(CASE WHEN message_type = 'assistant' THEN 1 END) as assistant_messages,
                    COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as messages_with_embeddings,
                    COUNT(DISTINCT channel_id) as unique_channels
                FROM messages
            `);

            client.release();
            
            return result.rows[0];
        } catch (error) {
            console.error('Failed to get statistics:', error.message);
            return null;
        }
    }

    /**
     * Check if the context manager is ready
     */
    isReady() {
        return this.isInitialized;
    }
}

// Create and export a singleton instance
const semanticContextManager = new SemanticContextManager();

export default semanticContextManager;