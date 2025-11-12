// Database Setup Script for UC-AIv2
// Simple script to initialize the database schema

import 'dotenv/config';
import { testConnection, initializeDatabase } from './database.js';

console.log('UC-AIv2 Database Setup');
console.log('='.repeat(40));
console.log('');

// Check environment configuration
console.log('Checking configuration...');

const hasDirectUrl = !!process.env.DATABASE_URL;
const hasIndividualParams = !!process.env.POSTGRES_HOST;

console.log('DATABASE_URL found:', hasDirectUrl);
console.log('Individual parameters found:', hasIndividualParams);

if (!hasDirectUrl && !hasIndividualParams) {
    console.log('No database configuration found in .env');
    console.log('   Please set either DATABASE_URL or individual PostgreSQL parameters');
    console.log('   Current DATABASE_URL:', process.env.DATABASE_URL);
    console.log('   Current POSTGRES_HOST:', process.env.POSTGRES_HOST);
    process.exit(1);
}

if (hasDirectUrl) {
    console.log('Found direct DATABASE_URL configuration');
    console.log('   URL:', process.env.DATABASE_URL.substring(0, 50) + '...');
} else {
    console.log('Found individual PostgreSQL parameters');
    console.log('   Host:', process.env.POSTGRES_HOST);
    console.log('   Database:', process.env.POSTGRES_DB);
    console.log('   User:', process.env.POSTGRES_USER);
}
console.log('');

// Database connection
console.log('Testing database connection...');
try {
    const connected = await testConnection();
    if (connected) {
        console.log('Database connection successful');
        console.log('');
    } else {
        console.log('Database connection failed');
        console.log('   Please check your DATABASE_URL or connection parameters');
        console.log('   Ensure PostgreSQL server is accessible and credentials are correct');
        console.log('');
        process.exit(1);
    }
} catch (error) {
    console.log('Database connection error:', error.message);
    console.log('');
    process.exit(1);
}

// Schema initialization
console.log('Initializing database schema...');
try {
    const result = await initializeDatabase();
    if (result) {
        console.log('Database schema initialized successfully');
        console.log('');
    } else {
        console.log('Database schema initialization failed');
        console.log('   Check that schema.sql file exists and database permissions are correct');
        console.log('');
        process.exit(1);
    }
} catch (error) {
    console.log('Schema initialization error:', error.message);
    console.log('');
    process.exit(1);
}

// Success :3
console.log('Database setup completed successfully!');
console.log('');
console.log('Next steps:');
console.log('   Start the bot: npm start');
console.log('');
console.log('Setup complete, Lets get this bread started');

process.exit(0);