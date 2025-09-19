const express = require('express');
const router = express.Router();
const {
  createConversation,
  getConversations,
  getMessages,
  sendMessage,
  markMessagesAsRead,
  deleteMessage,
  reactToMessage,
  pinMessage
} = require('../controllers/messageController');
const verifyToken = require('../middleware/verifyTokenHandler');

// Routes
router.post('/conversation', verifyToken, createConversation); // Create a new conversation
router.get('/conversations', verifyToken, getConversations);   // Get all user conversations
router.get('/conversation/:conversationId', verifyToken, getMessages); // Get messages for a conversation
router.post('/conversation/:conversationId/read',verifyToken, markMessagesAsRead);
router.post('/conversation/:conversationId/message/:messageId/delete', verifyToken, deleteMessage);
router.post('/conversation/:conversationId/message/:messageId/react', verifyToken, reactToMessage);
router.post('/conversation/:conversationId/message/:messageId/pin', verifyToken, pinMessage);
router.post('/', verifyToken, sendMessage);
module.exports = router;