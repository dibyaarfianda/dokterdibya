// ID Generator and Timezone Utilities
const crypto = require('crypto');

/**
 * Generate a random ID with only letters (A-Z)
 * @param {number} length - Length of the ID
 * @returns {string} Random ID with uppercase letters
 */
function generateLetterID(length = 10) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = '';
    for (let i = 0; i < length; i++) {
        id += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return id;
}

/**
 * Generate a random ID with only numbers (0-9)
 * @param {number} length - Length of the ID
 * @returns {string} Random ID with numbers
 */
function generateNumberID(length = 6) {
    let id = '';
    for (let i = 0; i < length; i++) {
        id += Math.floor(Math.random() * 10).toString();
    }
    return id;
}

/**
 * Generate a unique staff ID (10 letters)
 * @returns {string} Staff ID
 */
function generateStaffID() {
    return generateLetterID(10);
}

/**
 * Generate a unique patient ID (6 numbers)
 * @returns {string} Patient ID
 */
function generatePatientID() {
    return generateNumberID(6);
}

/**
 * Get current timestamp in GMT+7 (Jakarta/Indonesian time)
 * @returns {string} ISO timestamp with +07:00 timezone
 */
function getGMT7Timestamp() {
    const now = new Date();

    // Get UTC time first
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);

    // Add 7 hours to get GMT+7
    const gmt7Time = new Date(utcTime + (7 * 60 * 60 * 1000));

    // Format as YYYY-MM-DD HH:MM:SS for MySQL
    const year = gmt7Time.getFullYear();
    const month = String(gmt7Time.getMonth() + 1).padStart(2, '0');
    const day = String(gmt7Time.getDate()).padStart(2, '0');
    const hours = String(gmt7Time.getHours()).padStart(2, '0');
    const minutes = String(gmt7Time.getMinutes()).padStart(2, '0');
    const seconds = String(gmt7Time.getSeconds()).padStart(2, '0');

    // Return in ISO format with GMT+7 timezone indicator
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
}

/**
 * Get current date in GMT+7 (Jakarta/Indonesian time)
 * @returns {Date} Date object in GMT+7
 */
function getGMT7Date() {
    const now = new Date();
    // Get UTC time first
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    // Add 7 hours to get GMT+7 (Jakarta time)
    return new Date(utcTime + (7 * 60 * 60 * 1000));
}

/**
 * Convert any date to GMT+7 timestamp string
 * @param {Date|string} date - Input date
 * @returns {string} ISO timestamp with +07:00 timezone
 */
function toGMT7Timestamp(date) {
    const inputDate = new Date(date);

    // Get UTC time first
    const utcTime = inputDate.getTime() + (inputDate.getTimezoneOffset() * 60 * 1000);

    // Add 7 hours to get GMT+7
    const gmt7Time = new Date(utcTime + (7 * 60 * 60 * 1000));

    // Format as YYYY-MM-DD HH:MM:SS
    const year = gmt7Time.getFullYear();
    const month = String(gmt7Time.getMonth() + 1).padStart(2, '0');
    const day = String(gmt7Time.getDate()).padStart(2, '0');
    const hours = String(gmt7Time.getHours()).padStart(2, '0');
    const minutes = String(gmt7Time.getMinutes()).padStart(2, '0');
    const seconds = String(gmt7Time.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
}

/**
 * Format timestamp for MySQL (removes timezone indicator)
 * @param {string} timestamp - ISO timestamp
 * @returns {string} MySQL-formatted timestamp
 */
function toMySQLTimestamp(timestamp) {
    if (!timestamp) return getGMT7Timestamp().slice(0, 19).replace('T', ' ');
    return timestamp.slice(0, 19).replace('T', ' ');
}

/**
 * Check if an ID is a staff ID (10 letters)
 * @param {string} id - ID to check
 * @returns {boolean} True if staff ID
 */
function isStaffID(id) {
    return /^[A-Z]{10}$/.test(id);
}

/**
 * Check if an ID is a patient ID (6 numbers)
 * @param {string} id - ID to check
 * @returns {boolean} True if patient ID
 */
function isPatientID(id) {
    return /^[0-9]{6}$/.test(id);
}

/**
 * Determine user type from ID
 * @param {string} id - User ID
 * @returns {string} 'staff' or 'patient' or 'unknown'
 */
function getUserTypeFromID(id) {
    if (isStaffID(id)) return 'staff';
    if (isPatientID(id)) return 'patient';
    return 'unknown';
}

module.exports = {
    generateStaffID,
    generatePatientID,
    generateLetterID,
    generateNumberID,
    getGMT7Timestamp,
    getGMT7Date,
    toGMT7Timestamp,
    toMySQLTimestamp,
    isStaffID,
    isPatientID,
    getUserTypeFromID
};