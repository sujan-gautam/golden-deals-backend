const crypto = require('crypto');
require('dotenv').config(); // Load environment variables

// Encryption setup
const SECRET = process.env.ENCRYPTION_SECRET || 'default-supersecretkey'; // Use env variable
const KEY = crypto.createHash('sha256').update(SECRET).digest();
const IV_LENGTH = 16; // AES-256-CBC IV length

// Encrypt function
function encrypt(data) {
  const iv = crypto.randomBytes(IV_LENGTH); // Random IV for each encryption
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return {
    iv: iv.toString('base64'), // Include IV in response
    payload: encrypted,
  };
}

// Middleware to encrypt JSON responses
const encryptionMiddleware = (req, res, next) => {
  const oldJson = res.json;
  res.json = function (data) {
    const encryptedData = encrypt(data);
    return oldJson.call(this, encryptedData);
  };
  next();
};

module.exports = encryptionMiddleware;