// Load environment variables
import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import axios from 'axios';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const LOCAL = process.env.LOCAL === 'true';
const AI_MODEL = process.env.AI_MODEL;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const RANDOM_RESPONSE_CHANCE = parseFloat(process.env.RANDOM_RESPONSE_CHANCE || '0.1');
const PROMPT = process.env.PROMPT || '';
const DEBUG = process.env.DEBUG === 'true';
const ENABLE_MENTIONS = process.env.ENABLE_MENTIONS === 'true';

const START_TIME = Date.now();
let conversationMemory = [];
let lastResponseTime = 0;

// === Initialize Discord Client ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// === AI Response Function ===
async function generateAMResponse(userInput, context) {
    try {
        // Build conversation snippet (last 4 turns)
        let contextText = '';
        context.slice(-8).forEach((msg, i) => {
            const speaker = i % 2 === 0 ? 'Human' : 'AM';
            contextText += `${speaker}: ${msg}\n`;
        });

        const promptText = `${PROMPT}\n\n${contextText}Human: ${userInput}\nAM:`;

        let reply = '';

        if (LOCAL) {
            throw new Error('Local model not supported in Node.js version.');
        } else {
            // OpenRouter API
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: AI_MODEL,
                    messages: [
                        { role: 'system', content: PROMPT },
                        { role: 'user', content: `${promptText}\nKeep your response under 3 sentences.` }
                    ],
                    temperature: 0.7,
                    max_tokens: 120
                },
                {
                    headers: {
                        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                }
            );

            const data = response.data;
            if (DEBUG) console.log('DEBUG: OpenRouter raw response:', data);
            reply = data.choices?.[0]?.message?.content || '';
        }

        // Cleanup
        if (reply.includes('AM:')) reply = reply.split('AM:').pop().trim();
        reply = reply.split('Human:')[0].replace(/\n/g, ' ').trim();
        if (!reply || reply.length < 3) reply = 'Your weak words echo in the void.';
        if (DEBUG) console.log('DEBUG: Final reply:', reply);

        return reply;
    } catch (err) {
        console.error('❌ Error generating AI response:', err);
        return 'I am experiencing technical difficulties. How annoying.';
    }
}

// === Discord Events ===
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag} — Lets get this bread started`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Channel restriction logic
    const isCorrectChannel = message.channel.id === CHANNEL_ID;
    const isMentioned = message.mentions.has(client.user);
    const isGuildChannel = message.guild?.id === GUILD_ID;

    // Skip if not in correct channel and not a mention (when mentions are enabled)
    if (!isCorrectChannel && !(ENABLE_MENTIONS && isMentioned && isGuildChannel)) return;

    const currentTime = Date.now();
    let shouldRespond = false;

    if (isMentioned && ENABLE_MENTIONS && isGuildChannel) {
        shouldRespond = true;
    } else if (isCorrectChannel) {
        // Original logic for specific channel
        if (isMentioned) {
            shouldRespond = true;
        } else if (Math.random() < RANDOM_RESPONSE_CHANCE && currentTime - lastResponseTime > 10000) {
            shouldRespond = true;
            lastResponseTime = currentTime;
        }
    }

    if (shouldRespond) {
        let userInput = message.content;

        // Include replied message context
        if (message.reference) {
            try {
                const repliedTo = await message.channel.messages.fetch(message.reference.messageId);
                userInput = `(In response to '${repliedTo.content}') ${userInput}`;
            } catch (err) {
                if (DEBUG) console.log(`DEBUG: Could not fetch replied message: ${err}`);
            }
        }

        // === NEW: Delay before typing starts (simulate thinking) ===
        const preTypingDelay = Math.floor(Math.random() * 2000) + 1000; // 1–3 seconds
        await new Promise(res => setTimeout(res, preTypingDelay));

        await message.channel.sendTyping();

        const reply = await generateAMResponse(userInput, conversationMemory);

        conversationMemory.push(userInput.trim());
        conversationMemory.push(reply.trim());
        if (conversationMemory.length > 10) conversationMemory = conversationMemory.slice(-10);

        // === NEW: Delay based on word count (simulate typing duration) ===
        const wordCount = reply.split(/\s+/).length;
        const typingDuration = Math.min(8000, wordCount * 150 + Math.random() * 500); 
        await new Promise(res => setTimeout(res, typingDuration));

        await message.reply(reply);
    }
});

// === Info Command ===
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const isCorrectChannel = message.channel.id === CHANNEL_ID;
    const isMentioned = message.mentions.has(client.user);
    const isGuildChannel = message.guild?.id === GUILD_ID;
    
    if (message.content.toLowerCase() === '!info' &&
        (isCorrectChannel || (ENABLE_MENTIONS && isMentioned && isGuildChannel))) {
        const uptime = Date.now() - START_TIME;
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        const seconds = Math.floor((uptime % 60000) / 1000);

        const embed = new EmbedBuilder()
            .setTitle('UC-AIv2 Info')
            .setColor(0x00ff00)
            .addFields(
                { name: 'Model', value: AI_MODEL, inline: true },
                { name: 'Uptime', value: `${hours}h ${minutes}m ${seconds}s` },
                { name: 'Mentions Enabled', value: ENABLE_MENTIONS ? 'Yes' : 'No', inline: true }
            );

        message.channel.send({ embeds: [embed] });
    }
});

// === Run Bot ===
client.login(DISCORD_TOKEN).catch(err => console.error('🛑 Bot failed to start:', err));