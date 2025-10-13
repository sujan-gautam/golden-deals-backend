const asyncHandler = require('express-async-handler');
const Message = require('../models/messageModel');
const Conversation = require('../models/conversationModel');
const mongoose = require('mongoose');
const { logActivity } = require('../utils/activityLogger');

// @desc    Send a message
// @route   POST /api/messages
// @access  Private
const sendMessage = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('sendMessage - No user ID found');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  const { conversationId, content, product, event, isAIResponse } = req.body;
  const userId = req.user.id;

  if (!conversationId || !content) {
    res.status(400).json({ message: 'Conversation ID and content are required' });
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

  if (!conversation.participants.includes(userId) && !isAIResponse) {
    res.status(403).json({ message: 'Not authorized to send messages in this conversation' });
    return;
  }

  // Determine receiver's online status
  const receiverId = conversation.participants.find((p) => p.toString() !== userId);
  const io = req.app.get('io');
  let status = 'sent';
  if (io && receiverId) {
    const onlineUsers = io.sockets.adapter.rooms.get(`user:${receiverId}`);
    status = onlineUsers ? 'delivered' : 'sent';
  }

  // Validate event and product
  const validatedEvent = event && event._id && (event.title || event.event_title)
    ? {
        _id: event._id,
        title: event.title || event.event_title || 'Untitled Event',
        date: event.date || event.event_date || null,
        location: event.location || event.event_location || null,
        image: event.image || null,
      }
    : null;

  const validatedProduct = product && product._id && product.title
    ? {
        _id: product._id,
        title: product.title,
        price: product.price || null,
        image: product.image || null,
        condition: product.condition || null,
        category: product.category || null,
      }
    : null;

  if ((product && !validatedProduct) || (event && !validatedEvent)) {
    res.status(400).json({ message: 'Invalid product or event data' });
    return;
  }

  const message = await Message.create({
    conversationId,
    senderId: userId,
    content,
    product: validatedProduct,
    event: validatedEvent,
    isAIResponse: !!isAIResponse,
    isRead: isAIResponse ? true : false,
    status,
    deletedFor: [],
  });

  // Update conversation's updatedAt
  conversation.updatedAt = Date.now();
  await conversation.save();

  // Log activity (only for non-AI messages)
  if (!isAIResponse) {
    await logActivity(userId, 'send_message', message._id, 'Message', {
      conversation_id: conversationId,
      content_snippet: content.substring(0, 50),
      has_product: !!validatedProduct,
      has_event: !!validatedEvent,
    });
  }

  await message.populate('senderId', 'username firstname lastname avatar');
  const formattedMessage = {
    _id: message._id,
    conversationId: message.conversationId,
    sender: message.senderId,
    content: message.content,
    product: message.product,
    event: message.event,
    isAIResponse: message.isAIResponse,
    isRead: message.isRead,
    status: message.status,
    reactions: message.reactions,
    deletedFor: message.deletedFor,
    createdAt: message.createdAt,
  };

  if (io) {
    io.to(`conversation:${conversationId}`).emit('receive_message', formattedMessage);
  }

  res.status(201).json(formattedMessage);
});

// @desc    Get messages in a conversation
// @route   GET /api/conversations/:conversationId/messages
// @access  Private
const getMessages = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('getMessages - No user ID found');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  const userId = req.user.id;
  const { conversationId } = req.params;

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

  // Fetch messages without marking them as read
  const messages = await Message.find({
    conversationId,
    deletedFor: { $ne: userId },
  })
    .populate('senderId', 'username firstname lastname avatar')
    .select('conversationId content product event isAIResponse isRead status reactions deletedFor createdAt pinnedBy')
    .sort({ createdAt: 1 });

  // Log activity
  await logActivity(userId, 'view_messages', null, null, {
    action: 'view_messages',
    conversation_id: conversationId,
    messages_count: messages.length,
  });

  const formattedMessages = messages.map((message) => ({
    _id: message._id,
    conversationId: message.conversationId,
    sender: message.senderId
      ? {
          _id: message.senderId._id,
          username: message.senderId.username || 'Unknown',
          avatar: message.senderId.avatar || null,
          firstname: message.senderId.firstname || '',
          lastname: message.senderId.lastname || '',
        }
      : null,
    senderId: message.senderId ? message.senderId._id : null,
    content: message.content || '',
    product: message.product || null,
    event: message.event
      ? {
          _id: message.event._id,
          title: message.event.title || message.event.event_title || 'Untitled Event',
          date: message.event.date || message.event.event_date || null,
          location: message.event.location || message.event.event_location || null,
          image: message.event.image || null,
          price: message.event.price || null,
          condition: message.event.condition || null,
          category: message.event.category || null,
        }
      : null,
    isAIResponse: message.isAIResponse || false,
    isRead: message.isRead || false,
    status: message.status,
    reactions: message.reactions,
    deletedFor: message.deletedFor,
    pinnedBy: message.pinnedBy,
    createdAt: message.createdAt,
  }));

  res.status(200).json(formattedMessages);
});

// @desc    Create a conversation
// @route   POST /api/conversations
// @access  Private
const createConversation = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('createConversation - No user ID found');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  const { receiverId } = req.body;
  const userId = req.user.id;

  if (!receiverId) {
    console.error('createConversation - Missing receiverId');
    res.status(400).json({ message: 'Receiver ID is required' });
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    console.error('createConversation - Invalid receiverId:', receiverId);
    res.status(400).json({ message: 'Invalid receiver ID' });
    return;
  }

  if (receiverId === userId) {
    console.error('createConversation - Cannot create conversation with self:', userId);
    res.status(400).json({ message: 'Cannot create conversation with yourself' });
    return;
  }

  try {
    console.log('createConversation - Checking for existing conversation:', { userId, receiverId });

    // Find existing conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [userId, receiverId], $size: 2 },
    });

    // Create new conversation if none exists
    if (!conversation) {
      console.log('createConversation - Creating new conversation:', { userId, receiverId });
      conversation = await Conversation.create({
        participants: [userId, receiverId],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Log activity
      await logActivity(userId, 'create_conversation', conversation._id, 'Conversation', {
        receiver_id: receiverId,
      });
    } else {
      console.log('createConversation - Found existing conversation:', conversation._id);
      // Log activity for accessing existing conversation
      await logActivity(userId, 'access_conversation', conversation._id, 'Conversation', {
        receiver_id: receiverId,
      });
    }

    // Populate participants
    await conversation.populate('participants', 'username firstname lastname avatar');

    // Fetch last message with sender and event
    const lastMessage = await Message.findOne({ conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .populate('senderId', 'username firstname lastname avatar')
      .select('conversationId content product event isAIResponse isRead createdAt');

    // Calculate unread count
    const unreadCount = await Message.countDocuments({
      conversationId: conversation._id,
      senderId: { $ne: userId },
      isRead: false,
      isAIResponse: false,
    });

    // Format conversation response
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
            product: lastMessage.product || null,
            event: lastMessage.event
              ? {
                  _id: lastMessage.event._id,
                  title: lastMessage.event.title || lastMessage.event.event_title || 'Untitled Event',
                  date: lastMessage.event.date || lastMessage.event.event_date || null,
                  location: lastMessage.event.location || lastMessage.event.event_location || null,
                  image: lastMessage.event.image || null,
                  price: lastMessage.event.price || null,
                  condition: lastMessage.event.condition || null,
                  category: lastMessage.event.category || null,
                }
              : null,
            isAIResponse: lastMessage.isAIResponse,
            isRead: lastMessage.isRead,
            createdAt: lastMessage.createdAt,
          }
        : null,
      unreadCount,
    };

    console.log('createConversation - Returning conversation:', {
      conversationId: conversation._id,
      hasLastMessage: !!lastMessage,
      hasEvent: !!lastMessage?.event,
    });

    res.status(201).json(formattedConversation);
  } catch (error) {
    console.error('createConversation - Error:', error.message);
    res.status(500).json({ message: 'Failed to create conversation' });
  }
});

// @desc    Get all conversations for a user
// @route   GET /api/conversations
// @access  Private
const getConversations = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('getConversations - No user ID found');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  const userId = req.user.id;

  try {
    console.log(`getConversations - Fetching conversations for user: ${userId}`);

    // Fetch conversations with participants populated
    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'username firstname lastname avatar')
      .sort({ updatedAt: -1 });

    // Enhance conversations with lastMessage and unreadCount
    const enhancedConversations = await Promise.all(
      conversations.map(async (conversation) => {
        // Fetch the last message with sender and event populated
        const lastMessage = await Message.findOne({ conversationId: conversation._id })
          .sort({ createdAt: -1 })
          .populate('senderId', 'username firstname lastname avatar')
          .select('conversationId content product event isAIResponse isRead createdAt');

        // Calculate unread messages
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
                product: lastMessage.product || null,
                event: lastMessage.event
                  ? {
                      _id: lastMessage.event._id,
                      title: lastMessage.event.title || lastMessage.event.event_title || 'Untitled Event',
                      date: lastMessage.event.date || lastMessage.event.event_date || null,
                      location: lastMessage.event.location || lastMessage.event.event_location || null,
                      image: lastMessage.event.image || null,
                      price: lastMessage.event.price || null,
                      condition: lastMessage.event.condition || null,
                      category: lastMessage.event.category || null,
                    }
                  : null,
                isAIResponse: lastMessage.isAIResponse,
                isRead: lastMessage.isRead,
                createdAt: lastMessage.createdAt,
              }
            : null,
          unreadCount,
        };
      })
    );

    // Log activity
    await logActivity(userId, 'view_conversations', null, null, {
      action: 'view_conversations',
      conversations_count: enhancedConversations.length,
    });

    console.log(`getConversations - Returning ${enhancedConversations.length} conversations for user: ${userId}`);
    res.status(200).json(enhancedConversations);
  } catch (error) {
    console.error('getConversations - Error:', error.message);
    res.status(500).json({ message: 'Server error while fetching conversations' });
  }
});

// @desc    Mark messages as read in a conversation
// @route   PUT /api/conversations/:conversationId/messages/read
// @access  Private
const markMessagesAsRead = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('markMessagesAsRead - No user ID found');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  const userId = req.user.id;
  const { conversationId } = req.params;

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

  // Mark messages as read
  const updateResult = await Message.updateMany(
    { conversationId, senderId: { $ne: userId }, isRead: false, isAIResponse: false },
    { $set: { isRead: true, status: 'read' } }
  );

  // Calculate updated unread count
  const unreadCount = await Message.countDocuments({
    conversationId,
    senderId: { $ne: userId },
    isRead: false,
    isAIResponse: false,
  });

  // Log activity
  await logActivity(userId, 'mark_messages_read', null, null, {
    action: 'mark_messages_read',
    conversation_id: conversationId,
    modified_count: updateResult.modifiedCount,
  });

  // Update conversation with new unread count (if schema supports it)
  conversation.unreadCount = unreadCount;
  await conversation.save();

  // Emit socket event to notify all participants
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${conversationId}`).emit('message_status_updated', {
      conversationId,
      userId,
      status: 'read',
      unreadCount,
    });
  }

  res.status(200).json({ message: 'Messages marked as read', unreadCount });
});

// @desc    Delete a message (soft delete for user)
// @route   DELETE /api/messages/:messageId
// @access  Private
const deleteMessage = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('deleteMessage - No user ID found');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  const userId = req.user.id;
  const { messageId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    res.status(400).json({ message: 'Invalid message ID' });
    return;
  }

  const message = await Message.findById(messageId);
  if (!message) {
    res.status(404).json({ message: 'Message not found' });
    return;
  }

  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation || !conversation.participants.includes(userId)) {
    res.status(403).json({ message: 'Not authorized to delete this message' });
    return;
  }

  // Add user to deletedFor array
  let isNewDeletion = false;
  if (!message.deletedFor.includes(userId)) {
    message.deletedFor.push(userId);
    await message.save();
    isNewDeletion = true;
  }

  // Log activity only for new deletions
  if (isNewDeletion) {
    await logActivity(userId, 'delete_message', message._id, 'Message', {
      conversation_id: message.conversationId,
      content_snippet: message.content.substring(0, 50),
    });
  }

  // Notify other participants
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${message.conversationId}`).emit('message_deleted', {
      messageId,
      userId,
    });
  }

  res.status(200).json({ message: 'Message deleted for user' });
});

// @desc    React to a message
// @route   POST /api/messages/:messageId/react
// @access  Private
const reactToMessage = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('reactToMessage - No user ID found');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  const userId = req.user.id;
  const { messageId } = req.params;
  const { emoji } = req.body;

  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    res.status(400).json({ message: 'Invalid message ID' });
    return;
  }

  if (!emoji || typeof emoji !== 'string' || emoji.length > 5) {
    res.status(400).json({ message: 'Invalid emoji' });
    return;
  }

  const message = await Message.findById(messageId);
  if (!message) {
    res.status(404).json({ message: 'Message not found' });
    return;
  }

  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation || !conversation.participants.includes(userId)) {
    res.status(403).json({ message: 'Not authorized to react to this message' });
    return;
  }

  // Check if user already reacted with this emoji
  const existingReaction = message.reactions.find(
    (r) => r.userId.toString() === userId && r.emoji === emoji
  );

  let actionType = '';
  if (existingReaction) {
    // Remove reaction
    message.reactions = message.reactions.filter(
      (r) => !(r.userId.toString() === userId && r.emoji === emoji)
    );
    actionType = 'remove_reaction';
  } else {
    // Add reaction
    message.reactions.push({ userId, emoji });
    actionType = 'add_reaction';
  }

  await message.save();

  // Log activity
  await logActivity(userId, actionType, message._id, 'Message', {
    conversation_id: message.conversationId,
    emoji,
  });

  const formattedMessage = {
    _id: message._id,
    conversationId: message.conversationId,
    senderId: message.senderId ? message.senderId._id : null,
    reactions: message.reactions,
    deletedFor: message.deletedFor,
    status: message.status,
    createdAt: message.createdAt,
  };

  // Notify participants
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${message.conversationId}`).emit('message_reaction_updated', {
      messageId,
      userId,
      emoji,
      reactions: message.reactions,
    });
  }

  res.status(200).json(formattedMessage);
});

// @desc    Search messages in a conversation
// @route   GET /api/conversations/:conversationId/messages/search
// @access  Private
const searchMessages = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('searchMessages - No user ID found');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  const userId = req.user.id;
  const { conversationId } = req.params;
  const { query } = req.query;

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    res.status(400).json({ message: 'Invalid conversation ID' });
    return;
  }

  if (!query || typeof query !== 'string') {
    res.status(400).json({ message: 'Search query is required' });
    return;
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation || !conversation.participants.includes(userId)) {
    res.status(403).json({ message: 'Not authorized to view this conversation' });
    return;
  }

  // Log activity
  await logActivity(userId, 'search_messages', null, null, {
    action: 'search_messages',
    conversation_id: conversationId,
    query: query.substring(0, 50),
  });

  // Note: The original code uses an Elasticsearch client (`client.search`), which is not defined.
  // For consistency, I'll modify to use MongoDB text search instead, assuming no Elasticsearch dependency.
  const messages = await Message.find({
    conversationId,
    deletedFor: { $ne: userId },
    $text: { $search: query },
  })
    .populate('senderId', 'username firstname lastname avatar')
    .select('conversationId content product event isAIResponse isRead status reactions deletedFor createdAt pinnedBy')
    .sort({ createdAt: 1 })
    .limit(100);

  const formattedMessages = messages.map(message => ({
    _id: message._id,
    conversationId: message.conversationId,
    sender: message.senderId
      ? {
          _id: message.senderId._id,
          username: message.senderId.username || 'Unknown',
          avatar: message.senderId.avatar || null,
          firstname: message.senderId.firstname || '',
          lastname: message.senderId.lastname || '',
        }
      : null,
    senderId: message.senderId ? message.senderId._id : null,
    content: message.content || '',
    product: message.product || null,
    event: message.event
      ? {
          _id: message.event._id,
          title: message.event.title || message.event.event_title || 'Untitled Event',
          date: message.event.date || message.event.event_date || null,
          location: message.event.location || message.event.event_location || null,
          image: message.event.image || null,
          price: message.event.price || null,
          condition: message.event.condition || null,
          category: message.event.category || null,
        }
      : null,
    isAIResponse: message.isAIResponse || false,
    isRead: message.isRead || false,
    status: message.status,
    reactions: message.reactions,
    deletedFor: message.deletedFor,
    pinnedBy: message.pinnedBy,
    createdAt: message.createdAt,
  }));

  res.status(200).json(formattedMessages);
});

// @desc    Pin/unpin a message
// @route   PUT /api/conversations/:conversationId/messages/:messageId/pin
// @access  Private
const pinMessage = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('pinMessage - No user ID found');
    res.status(400).json({ message: 'Invalid user, conversation, or message ID' });
    return;
  }

  const userId = req.user.id;
  const { conversationId, messageId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(messageId)) {
    res.status(400).json({ message: 'Invalid conversation or message ID' });
    return;
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation || !conversation.participants.includes(userId)) {
    res.status(403).json({ message: 'Not authorized to pin messages in this conversation' });
    return;
  }

  const message = await Message.findById(messageId);
  if (!message || message.conversationId.toString() !== conversationId) {
    res.status(404).json({ message: 'Message not found' });
    return;
  }

  const isPinned = message.pinnedBy.includes(userId);
  const updatedPinnedBy = isPinned
    ? message.pinnedBy.filter((id) => id.toString() !== userId)
    : [...message.pinnedBy, userId];

  // Unpin other messages
  await Message.updateMany(
    { conversationId, _id: { $ne: messageId }, pinnedBy: { $ne: [] } },
    { $set: { pinnedBy: [] } }
  );

  message.pinnedBy = updatedPinnedBy;
  await message.save();

  // Log activity
  await logActivity(userId, isPinned ? 'unpin_message' : 'pin_message', message._id, 'Message', {
    conversation_id: conversationId,
    content_snippet: message.content.substring(0, 50),
  });

  console.log('Pinned message saved:', { messageId, pinnedBy: updatedPinnedBy });

  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${conversationId}`).emit('message_pinned_updated', {
      messageId,
      userId,
      pinnedBy: updatedPinnedBy,
      conversationId,
    });
  } else {
    console.warn('PinMessage - Socket.io not initialized');
  }

  res.status(200).json({ message: 'Message pinned/unpinned successfully', pinnedBy: updatedPinnedBy });
});

module.exports = {
  sendMessage,
  getMessages,
  createConversation,
  getConversations,
  markMessagesAsRead,
  deleteMessage,
  reactToMessage,
  searchMessages,
  pinMessage,
};