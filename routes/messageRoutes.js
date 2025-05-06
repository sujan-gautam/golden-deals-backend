const express = require('express');
const router = express.Router();
const {
  createConversation,
  getConversations,
  getMessages,
  sendMessage
} = require('../controllers/messageController');
const verifyToken = require('../middleware/verifyTokenHandler');

// Routes
router.post('/conversation', verifyToken, createConversation); // Create a new conversation
router.get('/conversations', verifyToken, getConversations);   // Get all user conversations
router.get('/conversation/:conversationId', verifyToken, getMessages); // Get messages for a conversation
router.post('/', verifyToken, sendMessage);
module.exports = router;