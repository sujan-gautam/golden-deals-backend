// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const {
  verifyAdmin,
  loginAdmin,
  verifyToken,
  getAnalytics,
  getAllUsers,
  updateUser,
  deleteUser,
  getAllPosts,
  createPost,
  updatePost,
  deletePost,
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getAllStories,
  createStory,
  updateStory,
  deleteStory,
  getAllNotifications,
  deleteNotification,
  getApiMetrics,
  forgotPassword,
  resetPassword,
  logApiMetrics,
  uploadPosts,
  uploadProducts,
  uploadEvents,
  uploadStories,
  getLikes
} = require('../controllers/adminController');

// Apply API metrics logging to all routes
router.use(logApiMetrics);

// Public routes
router.post('/login', loginAdmin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Private routes (require verifyAdmin)
router.get('/verify-token', verifyAdmin, verifyToken);
router.get('/analytics', verifyAdmin, getAnalytics);
router.get('/users', verifyAdmin, getAllUsers);
router.put('/users/:id', verifyAdmin, updateUser);
router.delete('/users/:id', verifyAdmin, deleteUser);

// Posts routes
router.get('/posts', verifyAdmin, getAllPosts);
router.post('/posts', verifyAdmin, uploadPosts.single('file'), createPost);
router.put('/posts/:id', verifyAdmin, uploadPosts.single('file'), updatePost);
router.delete('/posts/:id', verifyAdmin, deletePost);

// Products routes
router.get('/products', verifyAdmin, getAllProducts);
router.post('/products', verifyAdmin, uploadProducts.single('file'), createProduct);
router.put('/products/:id', verifyAdmin, uploadProducts.single('file'), updateProduct);
router.delete('/products/:id', verifyAdmin, deleteProduct);

// Events routes
router.get('/events', verifyAdmin, getAllEvents);
router.post('/events', verifyAdmin, uploadEvents.single('file'), createEvent);
router.put('/events/:id', verifyAdmin, uploadEvents.single('file'), updateEvent);
router.delete('/events/:id', verifyAdmin, deleteEvent);

// Stories routes
router.get('/stories', verifyAdmin, getAllStories);
router.post('/stories', verifyAdmin, uploadStories.single('file'), createStory);
router.put('/stories/:id', verifyAdmin, uploadStories.single('file'), updateStory);
router.delete('/stories/:id', verifyAdmin, deleteStory);

// Notifications routes
router.get('/notifications', verifyAdmin, getAllNotifications);
router.delete('/notifications/:id', verifyAdmin, deleteNotification);

// API Metrics
router.get('/api-metrics', verifyAdmin, getApiMetrics);

router.route('/likes/:type/:id').get(verifyAdmin, getLikes);

module.exports = router;