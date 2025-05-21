// utils/webhookVerifier.js
const crypto = require('crypto');

/**
 * Verify webhook request comes from Google
 * @param {Object} headers - Request headers
 * @param {string} body - Request body as string
 * @returns {boolean} Whether the request is valid
 */
exports.verifyWebhook = (headers, body) => {
  // Check for required headers
  const channelId = headers['x-goog-channel-id'];
  const resourceState = headers['x-goog-resource-state'];
  const messageNumber = headers['x-goog-message-number'];
  const resourceId = headers['x-goog-resource-id'];
  const token = headers['x-goog-channel-token'];
  
  if (!channelId || !resourceState || !messageNumber || !resourceId) {
    return false;
  }
  
  // Verify token if configured
  if (process.env.WEBHOOK_SECRET && token !== process.env.WEBHOOK_SECRET) {
    return false;
  }
  
  return true;
};

/**
 * Generate a secure token for webhook registration
 * @returns {string} Secure random token
 */
exports.generateWebhookToken = () => {
  return crypto.randomBytes(32).toString('hex');
};