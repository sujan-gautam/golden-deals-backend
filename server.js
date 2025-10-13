// server.js
const express = require('express');
const connectDB = require('./config/connectDB');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const fs = require('fs');

// Load routes & middleware
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
const authRoutes = require('./routes/authRoutes');
const trustedClient = require('./middleware/trustedClient');
const encryptionMiddleware = require('./middleware/encryptionMiddleware');
const initializeSocket = require('./socket/socket');

// Load environment variables
dotenv.config();

// Connect to MongoDB (resilient)
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

// Passport config (Google login, etc.)
require('./config/passport')();

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
initializeSocket(server, app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: process.env.FRONTEND_APP_URL || 'http://localhost:8080',
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization', 'session_logininfo']
}));
app.options('*', cors());

// Session & passport
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

// --------------------
// Static file serving with per-folder fallback
// --------------------
const serveWithFallback = (urlPath, folderPath, fallbackFile) => {
  app.use(urlPath, express.static(folderPath));

  app.get(`${urlPath}/:filename`, (req, res) => {
    const filePath = path.join(folderPath, req.params.filename);

    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        res.sendFile(fallbackFile);
      } else {
        res.sendFile(filePath);
      }
    });
  });
};

const defaultImage = path.join(__dirname, 'public', 'default-image.jpg');
const defaultProduct = path.join(__dirname, 'public', 'default-image.jpg');
const defaultAvatar = path.join(__dirname, 'public', 'default-avatar.jpg');
const defaultEvent = path.join(__dirname, 'public', 'default-image.jpg');
const defaultFallback = path.join(__dirname, 'public', 'fallback-image.jpg');

serveWithFallback('/storage/posts-pictures', path.join(__dirname, 'storage/posts-pictures'), defaultImage);
serveWithFallback('/storage/products-pictures', path.join(__dirname, 'storage/products-pictures'), defaultProduct);
serveWithFallback('/storage/events-pictures', path.join(__dirname, 'storage/events-pictures'), defaultEvent);
serveWithFallback('/storage/profile-pictures', path.join(__dirname, 'storage/profile-pictures'), defaultAvatar);
serveWithFallback('/storage/stories-pictures', path.join(__dirname, 'storage/stories-pictures'), defaultFallback);
serveWithFallback('/storage/ai-pictures', path.join(__dirname, 'storage/ai-pictures'), defaultImage);
serveWithFallback('/storage/admin-pictures', path.join(__dirname, 'storage/admin-pictures'), defaultAvatar);

// Default image routes
app.get(process.env.DEFAULT_AVATAR_PATH || "/default-avatar.jpg", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "default-avatar.jpg"));
});

app.get(process.env.DEFAULT_IMAGE_PATH || "/default-image.jpg", (req, res) => {
  const defaultPath = path.join(__dirname, "public", "storage", "posts-pictures", "default-image.png");
  const fallbackPath = path.join(__dirname, "storage", "fallback-pictures", "fallback-image.png");

  // Serve default if exists, otherwise fallback
  if (fs.existsSync(defaultPath)) {
    res.sendFile(defaultPath);
  } else {
    res.sendFile(fallbackPath);
  }
});

app.get(process.env.DEFAULT_FALLBACK_IMAGE_PATH || "/fallback-image.jpg", (req, res) => {
  res.sendFile(path.join(__dirname, "storage", "fallback-pictures", "fallback-image.png"));
});

// --------------------
// API routes
// --------------------
app.use('/api/admin', adminRoutes);
app.use('/api', encryptionMiddleware);

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
app.use('/api/auth', authRoutes);

// Health check and root
app.get('/', (req, res) => res.send('Server is up and running!'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));

// --------------------
// Error handling
// --------------------
app.use((err, req, res, next) => {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  console.error("Error middleware:", { message: err.message, statusCode, stack: err.stack });
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

// Catch unhandled promises and exceptions
process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));

// --------------------
// Start server
// --------------------
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 5000;
server.listen(PORT, HOST, () => console.log(`App is running on port: ${PORT}`));

