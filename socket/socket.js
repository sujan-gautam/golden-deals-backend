const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Conversation = require('../models/conversationModel');

const initializeSocket = (server, app) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_APP_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
  });

  app.set('io', io);

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      console.error('Socket.IO: No token provided');
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.SECRECT_KEY || 'your-secret-key');
      socket.user = { id: decoded.user?.id || decoded.id, username: decoded.user?.username || decoded.username };
      console.log(`Socket.IO authenticated user: ${socket.user.id} (${socket.user.username})`);
      socket.join(`user:${socket.user.id}`);
      next();
    } catch (err) {
      console.error('Socket.IO token verification failed:', err.message);
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}, User: ${socket.user.username || socket.user.id}`);

    socket.on('join_conversation', async (conversationId, callback) => {
      try {
        if (!conversationId || typeof conversationId !== 'string') {
          console.error(`Invalid conversationId: ${conversationId}`);
          callback({ success: false, error: 'Invalid conversation ID' });
          return;
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          console.error(`Conversation not found: ${conversationId}`);
          callback({ success: false, error: 'Conversation not found' });
          return;
        }

        const participantIds = conversation.participants.map((id) => id.toString());
        if (!participantIds.includes(socket.user.id)) {
          console.error(`User not authorized for conversation: ${socket.user.id}, ${conversationId}`);
          callback({ success: false, error: 'Not authorized to join this conversation' });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        console.log(`${socket.user.username || socket.user.id} joined conversation: ${conversationId}`);
        callback({ success: true });
      } catch (error) {
        console.error(`Error joining conversation ${conversationId}: ${error.message}`);
        callback({ success: false, error: 'Failed to join conversation' });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id}, Reason: ${reason}`);
    });
  });

  return io;
};

module.exports = initializeSocket;