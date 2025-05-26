const asyncHandler = require('express-async-handler');
const Message = require('../models/messageModel');
const Conversation = require('../models/conversationModel');
const mongoose = require('mongoose');

const sendMessage = asyncHandler(async (req, res) => {
  const { conversationId, content, product, isAIResponse } = req.body;
  const userId = req.user?.id;


  if (!userId) {
    console.error('No user ID in request');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  if (!conversationId || !content) {
    console.error('Missing conversationId or content:', { conversationId, content });
    res.status(400).json({ message: 'Conversation ID and content are required' });
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    console.error('Invalid conversationId:', conversationId);
    res.status(400).json({ message: 'Invalid conversation ID' });
    return;
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    console.error('Conversation not found:', conversationId);
    res.status(404).json({ message: 'Conversation not found' });
    return;
  }

  if (!conversation.participants.includes(userId) && !isAIResponse) {
    console.error('User not authorized for conversation:', { userId, conversationId });
    res.status(403).json({ message: 'Not authorized to send messages in this conversation' });
    return;
  }

  const message = await Message.create({
    conversationId,
    senderId: userId,
    content,
    product: product || null,
    isAIResponse: !!isAIResponse,
    isRead: isAIResponse ? true : false, // AI messages are auto-read
  });

  // Update conversation's updatedAt
  conversation.updatedAt = Date.now();
  await conversation.save();

  await message.populate('senderId', 'username firstname lastname avatar');
  const formattedMessage = {
    _id: message._id,
    conversationId: message.conversationId,
    sender: message.senderId,
    content: message.content,
    product: message.product,
    isAIResponse: message.isAIResponse,
    isRead: message.isRead,
    createdAt: message.createdAt,
  };


  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${conversationId}`).emit('receive_message', formattedMessage);
  } else {
    console.warn('Socket.IO not initialized');
  }

  res.status(201).json(formattedMessage);
});

const getMessages = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { conversationId } = req.params;


  if (!userId) {
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    res.status(400).json({ message: 'Invalid conversation ID' });
    return;
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    res.status(404).json({ message: 'Conversation not found' });
    return;
  }

  if (!conversation.participants.includes(userId)) {
    res.status(403).json({ message: 'Not authorized to view this conversation' });
    return;
  }

  // Mark messages as read for the current user (exclude AI messages)
  await Message.updateMany(
    { conversationId, senderId: { $ne: userId }, isRead: false, isAIResponse: false },
    { $set: { isRead: true } }
  );

  const messages = await Message.find({ conversationId })
    .populate('senderId', 'username firstname lastname avatar')
    .sort({ createdAt: 1 });

  const formattedMessages = messages.map((message) => ({
    _id: message._id,
    conversationId: message.conversationId,
    sender: message.senderId,
    content: message.content,
    product: message.product,
    isAIResponse: message.isAIResponse,
    isRead: message.isRead,
    createdAt: message.createdAt,
  }));

  res.status(200).json(formattedMessages);
});

const createConversation = asyncHandler(async (req, res) => {
  const { receiverId } = req.body;
  const userId = req.user?.id;


  if (!userId) {
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  if (!receiverId) {
    res.status(400).json({ message: 'Receiver ID is required' });
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    res.status(400).json({ message: 'Invalid receiver ID' });
    return;
  }

  if (receiverId === userId) {
    res.status(400).json({ message: 'Cannot create conversation with yourself' });
    return;
  }

  let conversation = await Conversation.findOne({
    participants: { $all: [userId, receiverId], $size: 2 },
  });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [userId, receiverId],
    });
  }

  await conversation.populate('participants', 'username firstname lastname avatar');

  // Fetch last message and unread count
  const lastMessage = await Message.findOne({ conversationId: conversation._id })
    .sort({ createdAt: -1 })
    .populate('senderId', 'username firstname lastname avatar');
  const unreadCount = await Message.countDocuments({
    conversationId: conversation._id,
    senderId: { $ne: userId },
    isRead: false,
    isAIResponse: false,
  });

  const formattedConversation = {
    _id: conversation._id,
    participants: conversation.participants,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    lastMessage: lastMessage
      ? {
          _id: lastMessage._id,
          conversationId: lastMessage.conversationId,
          sender: lastMessage.senderId,
          content: lastMessage.content,
          product: lastMessage.product,
          isAIResponse: lastMessage.isAIResponse,
          isRead: lastMessage.isRead,
          createdAt: lastMessage.createdAt,
        }
      : null,
    unreadCount,
  };

  res.status(201).json(formattedConversation);
});

const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  const conversations = await Conversation.find({ participants: userId })
    .populate('participants', 'username firstname lastname avatar')
    .sort({ updatedAt: -1 });

  // Enhance conversations with lastMessage and unreadCount
  const enhancedConversations = await Promise.all(
    conversations.map(async (conversation) => {
      const lastMessage = await Message.findOne({ conversationId: conversation._id })
        .sort({ createdAt: -1 })
        .populate('senderId', 'username firstname lastname avatar');
      const unreadCount = await Message.countDocuments({
        conversationId: conversation._id,
        senderId: { $ne: userId },
        isRead: false,
        isAIResponse: false,
      });

      return {
        _id: conversation._id,
        participants: conversation.participants,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastMessage: lastMessage
          ? {
              _id: lastMessage._id,
              conversationId: lastMessage.conversationId,
              sender: lastMessage.senderId,
              content: lastMessage.content,
              product: lastMessage.product,
              isAIResponse: lastMessage.isAIResponse,
              isRead: lastMessage.isRead,
              createdAt: lastMessage.createdAt,
            }
          : null,
        unreadCount,
      };
    })
  );

  res.status(200).json(enhancedConversations);
});

const markMessagesAsRead = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { conversationId } = req.params;


  if (!userId) {
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    res.status(400).json({ message: 'Invalid conversation ID' });
    return;
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    res.status(404).json({ message: 'Conversation not found' });
    return;
  }

  if (!conversation.participants.includes(userId)) {
    res.status(403).json({ message: 'Not authorized to view this conversation' });
    return;
  }

  await Message.updateMany(
    { conversationId, senderId: { $ne: userId }, isRead: false, isAIResponse: false },
    { $set: { isRead: true } }
  );

  res.status(200).json({ message: 'Messages marked as read' });
});

module.exports = {
  sendMessage,
  getMessages,
  createConversation,
  getConversations,
  markMessagesAsRead,
};
