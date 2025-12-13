/**
 * Cloudflare R2 Storage Service
 * S3-compatible object storage for lab results and medical files
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('../utils/logger');

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'dokterdibya-medis';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// Check if R2 is configured
const isR2Configured = () => {
    return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
};

// Create S3 client for R2
let s3Client = null;

const getS3Client = () => {
    if (!s3Client && isR2Configured()) {
        s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: R2_ACCESS_KEY_ID,
                secretAccessKey: R2_SECRET_ACCESS_KEY,
            },
        });
    }
    return s3Client;
};

/**
 * Upload file to R2
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} fileName - Original filename
 * @param {string} mimeType - File MIME type
 * @param {string} folder - Folder path (e.g., 'lab-results', 'usg')
 * @returns {Object} Upload result with URL
 */
const uploadFile = async (fileBuffer, fileName, mimeType, folder = 'lab-results') => {
    if (!isR2Configured()) {
        throw new Error('R2 storage is not configured');
    }

    const client = getS3Client();

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = fileName.split('.').pop();
    const safeName = fileName
        .replace(/\.[^/.]+$/, '') // Remove extension
        .replace(/[^a-zA-Z0-9]/g, '-') // Replace special chars
        .substring(0, 50); // Limit length

    const key = `${folder}/${safeName}-${timestamp}-${randomStr}.${ext}`;

    try {
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            Body: fileBuffer,
            ContentType: mimeType,
            // Set cache control for medical files
            CacheControl: 'private, max-age=31536000',
        });

        await client.send(command);

        // Generate public URL
        const url = R2_PUBLIC_URL
            ? `${R2_PUBLIC_URL}/${key}`
            : `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.dev/${key}`;

        logger.info(`File uploaded to R2: ${key} (${fileBuffer.length} bytes)`);

        return {
            success: true,
            key,
            url,
            filename: key.split('/').pop(),
        };
    } catch (error) {
        logger.error('R2 upload error', { error: error.message, key });
        throw error;
    }
};

/**
 * Delete file from R2
 * @param {string} key - File key in R2
 */
const deleteFile = async (key) => {
    if (!isR2Configured()) {
        throw new Error('R2 storage is not configured');
    }

    const client = getS3Client();

    try {
        const command = new DeleteObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
        });

        await client.send(command);
        logger.info('File deleted from R2', { key });

        return { success: true };
    } catch (error) {
        logger.error('R2 delete error', { error: error.message, key });
        throw error;
    }
};

/**
 * Get signed URL for private file access
 * @param {string} key - File key in R2
 * @param {number} expiresIn - URL expiry in seconds (default 1 hour)
 */
const getSignedDownloadUrl = async (key, expiresIn = 3600) => {
    if (!isR2Configured()) {
        throw new Error('R2 storage is not configured');
    }

    const client = getS3Client();

    try {
        const command = new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
        });

        const signedUrl = await getSignedUrl(client, command, { expiresIn });
        return signedUrl;
    } catch (error) {
        logger.error('R2 signed URL error', { error: error.message, key });
        throw error;
    }
};

/**
 * Get file as buffer from R2 (for AI processing)
 * @param {string} key - File key in R2
 */
const getFileBuffer = async (key) => {
    if (!isR2Configured()) {
        throw new Error('R2 storage is not configured');
    }

    const client = getS3Client();

    try {
        const command = new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
        });

        const response = await client.send(command);

        // Convert stream to buffer
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (error) {
        logger.error('R2 get file error', { error: error.message, key });
        throw error;
    }
};

module.exports = {
    isR2Configured,
    uploadFile,
    deleteFile,
    getSignedDownloadUrl,
    getFileBuffer,
    R2_BUCKET_NAME,
    R2_PUBLIC_URL,
};
