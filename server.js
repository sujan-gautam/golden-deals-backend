const express = require('express');
const connectDB = require('./config/connectDB');
const dotenv = require('dotenv');
const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const eventRoutes = require('./routes/eventRoutes');
const feedRoutes = require('./routes/feedRoutes');
const storiesRoutes = require('./routes/storiesRoutes');
const messageRoutes = require('./routes/messageRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const savedItemRoutes = require('./routes/savedItemRoutes');
const searchRoutes = require('./routes/searchRoutes');
const authRoutes  = require('./routes/authRoutes');
const trustedClient = require('./middleware/trustedClient');
const initializeSocket = require('./socket/socket');
const passport = require('passport');
const session = require('express-session');
const cors = require('cors');
const http = require('http');
const path = require('path');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Register Mongoose models
require('./models/userModel');
require('./models/postModel');
require('./models/productModel');
require('./models/eventModel');
require('./models/messageModel');
require('./models/conversationModel');
require('./models/notificationModel');

// google login
require('./config/passport')();



const app = express();
const server = http.createServer(app); // Create HTTP server instance

// Initialize Socket.IO with the same server instance
initializeSocket(server, app);

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_APP_URL, // Restrict to frontend origin in development
  credentials: true, // If you're using cookies/auth headers
}));

// Serve static files from specific subdirectories
app.use('/storage/posts-pictures', express.static(path.join(__dirname, 'storage/posts-pictures')));
app.use('/storage/products-pictures', express.static(path.join(__dirname, 'storage/products-pictures')));
app.use('/storage/events-pictures', express.static(path.join(__dirname, 'storage/events-pictures')));
app.use('/storage/profile-pictures', express.static(path.join(__dirname, 'storage/profile-pictures')));
app.use('/storage/stories-pictures', express.static(path.join(__dirname, 'storage/stories-pictures')));
app.use('/storage/ai-pictures', express.static(path.join(__dirname, 'storage/ai-pictures')));

// Log static file serving paths for debugging
console.log('Serving posts pictures from:', path.join(__dirname, 'storage/posts-pictures'));
console.log('Serving products pictures from:', path.join(__dirname, 'storage/products-pictures'));
console.log('Serving events pictures from:', path.join(__dirname, 'storage/events-pictures'));
console.log('Serving profile pictures from:', path.join(__dirname, 'storage/profile-pictures'));

// google login
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/products', trustedClient, productRoutes);
app.use('/api/users', trustedClient, userRoutes);
app.use('/api/posts', trustedClient, postRoutes);
app.use('/api/events', trustedClient, eventRoutes);
app.use('/api/feed', trustedClient, feedRoutes);
app.use('/api/stories', trustedClient, storiesRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/saved-items', trustedClient, savedItemRoutes);
app.use('/api/search', trustedClient, searchRoutes);
app.use('/api/auth',authRoutes);

// Add this before your routes
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server with the unified HTTP server instance
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => { // Changed from app.listen to server.listen
  console.log(`App is running on port: ${PORT}`);
});