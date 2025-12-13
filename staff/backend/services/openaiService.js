/**
 * OpenAI Service for Sunday Clinic
 * Handles OpenAI API integration
 */

const logger = require('../utils/logger');

// OpenAI API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

module.exports = {
    OPENAI_API_KEY,
    OPENAI_API_URL
};
