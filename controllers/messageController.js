const asyncHandler = require('express-async-handler');
const Message = require('../models/messageModel');
const Conversation = require('../models/conversationModel');
const mongoose = require('mongoose');
const io = require('../socket/socket'); 

const sendMessage = asyncHandler(async (req, res) => {
  const { conversationId, content, product, event, isAIResponse } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

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

  // Determine receiver's online status (simplified; use Socket.IO presence)
  const receiverId = conversation.participants.find((p) => p.toString() !== userId);
  const io = req.app.get('io');
  let status = 'sent';
  if (io && receiverId) {
    const onlineUsers = io.sockets.adapter.rooms.get(`user:${receiverId}`); // Check if receiver is online
    status = onlineUsers ? 'delivered' : 'sent';
  }

  // Validate event and product (unchanged)
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

// messageController.js
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

  // Fetch messages without marking them as read
  const messages = await Message.find({
    conversationId,
    deletedFor: { $ne: userId },
  })
    .populate('senderId', 'username firstname lastname avatar')
    .select('conversationId content product event isAIResponse isRead status reactions deletedFor createdAt pinnedBy')
    .sort({ createdAt: 1 });

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


const createConversation = asyncHandler(async (req, res) => {
  const { receiverId } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    console.error('createConversation - No user ID found');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

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
    } else {
      console.log('createConversation - Found existing conversation:', conversation._id);
    }

    // Populate participants
    await conversation.populate('participants', 'username firstname lastname avatar');

    // Fetch last message with sender and event
    const lastMessage = await Message.findOne({ conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .populate('senderId', 'username firstname lastname avatar')
      .select('conversationId content product event isAIResponse isRead createdAt'); // Explicitly select event

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

const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    console.error('getConversations - No user ID found in request');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

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
          .select('conversationId content product event isAIResponse isRead createdAt'); // Explicitly select event

        // Calculate unread messages (excluding user's own messages and AI responses)
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

    console.log(`getConversations - Returning ${enhancedConversations.length} conversations for user: ${userId}`);
    res.status(200).json(enhancedConversations);
  } catch (error) {
    console.error('getConversations - Error:', error.message);
    res.status(500).json({ message: 'Server error while fetching conversations' });
  }
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

  // Mark messages as read
  await Message.updateMany(
    { conversationId, senderId: { $ne: userId }, isRead: false, isAIResponse: false },
    { $set: { isRead: true, status: 'read' } }
  );

  // Calculate updated unread count for the conversation
  const unreadCount = await Message.countDocuments({
    conversationId,
    senderId: { $ne: userId },
    isRead: false,
    isAIResponse: false,
  });

  // Update conversation with new unread count (if schema supports it)
  conversation.unreadCount = unreadCount; // Assuming Conversation model has an unreadCount field
  await conversation.save();

  // Emit socket event to notify all participants
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${conversationId}`).emit('message_status_updated', {
      conversationId,
      userId,
      status: 'read',
      unreadCount, // Include updated unread count
    });
  }

  res.status(200).json({ message: 'Messages marked as read', unreadCount });
});

const deleteMessage = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { messageId } = req.params;

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

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
  if (!message.deletedFor.includes(userId)) {
    message.deletedFor.push(userId);
    await message.save();
  }

  // Notify other participants (optional)
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${message.conversationId}`).emit('message_deleted', {
      messageId,
      userId,
    });
  }

  res.status(200).json({ message: 'Message deleted for user' });
});

const reactToMessage = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { messageId } = req.params;
  const { emoji } = req.body;

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

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

  if (existingReaction) {
    // Remove reaction
    message.reactions = message.reactions.filter(
      (r) => !(r.userId.toString() === userId && r.emoji === emoji)
    );
  } else {
    // Add reaction
    message.reactions.push({ userId, emoji });
  }

  await message.save();

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

const searchMessages = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { conversationId } = req.params;
  const { query } = req.query;

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }
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

  const { hits } = await client.search({
    index: 'messages_index',
    body: {
      query: {
        bool: {
          filter: [
            { term: { conversationId } },
            { bool: { must_not: { term: { deletedFor: userId } } } }
          ],
          must: [
            { match: { content: { query, fuzziness: 'AUTO' } } }
          ]
        }
      },
      sort: [{ createdAt: { order: 'asc' } }],
      size: 100 // Adjust based on needs
    }
  });

  const messages = hits.hits.map(hit => ({
    _id: hit._id,
    conversationId: hit._source.conversationId,
    senderId: hit._source.senderId || null,
    content: hit._source.content || '',
    product: hit._source.product || null,
    event: hit._source.event || null,
    isAIResponse: hit._source.isAIResponse || false,
    isRead: hit._source.isRead || false,
    status: hit._source.status || 'sent',
    reactions: Array.isArray(hit._source.reactions) ? hit._source.reactions : [],
    deletedFor: Array.isArray(hit._source.deletedFor) ? hit._source.deletedFor : [],
    pinnedBy: Array.isArray(hit._source.pinnedBy) ? hit._source.pinnedBy : [],
    createdAt: hit._source.createdAt
  }));

  // Populate sender details from MongoDB
  const populatedMessages = await Message.populate(messages, {
    path: 'senderId',
    select: 'username firstname lastname avatar'
  });

  const formattedMessages = populatedMessages.map(message => ({
    ...message,
    sender: message.senderId
      ? {
          _id: message.senderId._id,
          username: message.senderId.username || 'Unknown',
          avatar: message.senderId.avatar || null,
          firstname: message.senderId.firstname || '',
          lastname: message.senderId.lastname || ''
        }
      : null
  }));

  res.status(200).json(formattedMessages);
});

const pinMessage = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { conversationId, messageId } = req.params;

  if (!userId || !mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(messageId)) {
    res.status(400).json({ message: 'Invalid user, conversation, or message ID' });
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

  console.log('Pinned message saved:', { messageId, pinnedBy: updatedPinnedBy }); // Debug log

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
  pinMessage
};
