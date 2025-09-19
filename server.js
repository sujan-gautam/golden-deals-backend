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
const adminRoutes = require('./routes/adminRoutes');
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
// const originCheck = require('./middleware/originCheck');

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
require('./models/adminModel');

// google login
require('./config/passport')();



const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const server = http.createServer(app); // Create HTTP server instance

// Initialize Socket.IO with the same server instance
initializeSocket(server, app);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_APP_URL || 'http://localhost:8080', // Fallback for safety
  credentials: true, // Allow cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization', 'session_logininfo'], // Add Authorization
}));
app.options('*', cors());
// Add originCheck middleware globally
// app.use(originCheck);

// Serve static files from specific subdirectories
app.use('/storage/posts-pictures', express.static(path.join(__dirname, 'storage/posts-pictures')));
app.use('/storage/products-pictures', express.static(path.join(__dirname, 'storage/products-pictures')));
app.use('/storage/events-pictures', express.static(path.join(__dirname, 'storage/events-pictures')));
app.use('/storage/profile-pictures', express.static(path.join(__dirname, 'storage/profile-pictures')));
app.use('/storage/stories-pictures', express.static(path.join(__dirname, 'storage/stories-pictures')));
app.use('/storage/ai-pictures', express.static(path.join(__dirname, 'storage/ai-pictures')));
app.use('/storage/admin-pictures', express.static(path.join(__dirname, 'storage/admin-pictures')));

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
app.use('/api/users', userRoutes);
app.use('/api/posts', trustedClient, postRoutes);
app.use('/api/events', trustedClient, eventRoutes);
app.use('/api/feed', trustedClient, feedRoutes);
app.use('/api/stories', trustedClient, storiesRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/saved-items', trustedClient, savedItemRoutes);
app.use('/api/search', trustedClient, searchRoutes);
app.use('/api/auth',authRoutes);
app.use('/api/admin',adminRoutes);
app.get('/', (req, res) => {
  res.send('Server is up and running!');
});
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.get(process.env.DEFAULT_AVATAR_PATH || '/default-avatar.jpg', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'default-avatar.jpg');
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send('Image not found');
    }
  });
});
app.get(process.env.DEFAULT_IMAGE_PATH || '/default-image.jpg', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'default-image.jpg');
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send('Image not found');
    }
  });
});
app.get(process.env.DEFAULT_FALLBACK_IMAGE_PATH || '/fallback-image.jpg', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'fallback-image.jpg');
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send('Image not found');
    }
  });
});

app.use((err, req, res, next) => {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  console.error("Error middleware:", { message: err.message, statusCode, stack: err.stack });
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});


// Start server with the unified HTTP server instance
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 5000;
server.listen(PORT, HOST, () => {
  console.log(`App is running on port: ${PORT}`);
});
