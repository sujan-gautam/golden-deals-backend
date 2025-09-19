// controllers/adminController.js
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const Admin = require('../models/adminModel');
const Post = require('../models/postModel');
const Product = require('../models/productModel');
const Event = require('../models/eventModel');
const Story = require('../models/storiesModel');
const SavedItem = require('../models/savedItemModel');
const Notification = require('../models/notificationModel');
const ApiMetrics = require('../models/apiMetricsModel');
const User = require('../models/userModel');

// Import multer configurations (for use in routes)
const uploadPosts = require('../config/multerPosts');
const uploadProducts = require('../config/multerProducts');
const uploadEvents = require('../config/multerEvents');
const uploadStories = require('../config/multerStories');

// In-memory cache for real-time API metrics
const apiRequestCache = new Map();

// Helper: Multer error handler wrapper (apply to file upload routes)
const handleMulterError = (handler) => asyncHandler(async (req, res, next) => {
  try {
    return await handler(req, res, next);
  } catch (error) {
    if (error instanceof require('multer').MulterError) {
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ success: false, message: `Unexpected field: ${error.field || 'file'}. Expected 'file' for upload.` });
      }
      return res.status(400).json({ success: false, message: `Upload error: ${error.message}` });
    }
    throw error; // Re-throw non-Multer errors
  }
});

// @desc    Verify admin token
// @route   GET /api/admin/verify-token
// @access  Private (Admin)
const verifyToken = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401);
    throw new Error('No admin token provided');
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.SECRECT_KEY);
    const admin = await Admin.findById(decoded.admin.id).select('-password');
    if (!admin) {
      res.status(403);
      throw new Error('Not authorized as admin');
    }
    res.status(200).json({
      success: true,
      user: {
        id: admin._id,
        username: admin.username,
        firstname: admin.firstname,
        lastname: admin.lastname,
        email: admin.email,
        avatar: admin.avatar,
      },
    });
  } catch (error) {
    res.status(401);
    throw new Error('Invalid admin token');
  }
});

// Middleware to verify admin (use in routes)
const verifyAdmin = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401);
    throw new Error('No admin token provided');
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.SECRECT_KEY);
    const admin = await Admin.findById(decoded.admin.id).select('-password');
    if (!admin) {
      res.status(403);
      throw new Error('Not authorized as admin');
    }
    req.admin = admin;
    next();
  } catch (error) {
    res.status(401);
    throw new Error('Invalid admin token');
  }
});

// @desc    Get admin dashboard analytics
// @route   GET /api/admin/analytics
// @access  Private (Admin)
const getAnalytics = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalPosts,
    totalProducts,
    totalEvents,
    totalStories,
    totalSavedItems,
    activeUsers,
    recentPosts,
    recentProducts,
    recentEvents,
  ] = await Promise.all([
    User.countDocuments(),
    Post.countDocuments(),
    Product.countDocuments(),
    Event.countDocuments(),
    Story.countDocuments(),
    SavedItem.countDocuments(),
    User.countDocuments({ lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
    Post.find()
      .populate('user_id', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(10),
    Product.find()
      .populate('user_id', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(10),
    Event.find()
      .populate('user_id', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(10),
  ]);

  const userGrowth = await User.aggregate([
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $limit: 30 },
  ]);

  const engagementMetrics = await Post.aggregate([
    {
      $group: {
        _id: null,
        totalLikes: { $sum: { $size: '$likes' } },
        totalComments: { $sum: { $size: '$comments' } },
        totalShares: { $sum: '$shares' },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalUsers,
      totalPosts,
      totalProducts,
      totalEvents,
      totalStories,
      totalSavedItems,
      activeUsers,
      recentActivity: {
        posts: recentPosts,
        products: recentProducts,
        events: recentEvents,
      },
      userGrowth,
      engagement: engagementMetrics[0] || { totalLikes: 0, totalComments: 0, totalShares: 0 },
    },
  });
});

// @desc    Admin login
// @route   POST /api/admin/login
// @access  Public
const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400);
    throw new Error('Email and password are required');
  }

  const admin = await Admin.findOne({ email: email.toLowerCase() }).select('+password');
  if (!admin) {
    res.status(401);
    throw new Error('Invalid admin credentials');
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid admin credentials');
  }

  const accessToken = jwt.sign(
    { admin: { id: admin._id, username: admin.username, email: admin.email } },
    process.env.SECRECT_KEY,
    { expiresIn: '7d' }
  );

  res.status(200).json({
    accesstoken: accessToken,
    user: {
      id: admin._id,
      username: admin.username,
      firstname: admin.firstname,
      lastname: admin.lastname,
      email: admin.email,
      avatar: admin.avatar,
    },
  });
});

// @desc    Get all users with content counts
// @route   GET /api/admin/users
// @access  Private (Admin)
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select('username firstname lastname email avatar bio createdAt isAdmin');
  const postCounts = await Post.aggregate([{ $group: { _id: '$user_id', count: { $sum: 1 } } }]);
  const productCounts = await Product.aggregate([{ $group: { _id: '$user_id', count: { $sum: 1 } } }]);
  const eventCounts = await Event.aggregate([{ $group: { _id: '$user_id', count: { $sum: 1 } } }]);
  const storyCounts = await Story.aggregate([{ $group: { _id: '$user_id', count: { $sum: 1 } } }]);

  const postCountMap = new Map(postCounts.map(item => [item._id.toString(), item.count]));
  const productCountMap = new Map(productCounts.map(item => [item._id.toString(), item.count]));
  const eventCountMap = new Map(eventCounts.map(item => [item._id.toString(), item.count]));
  const storyCountMap = new Map(storyCounts.map(item => [item._id.toString(), item.count]));

  const usersWithCounts = users.map(user => ({
    ...user.toObject(),
    postCount: postCountMap.get(user._id.toString()) || 0,
    productCount: productCountMap.get(user._id.toString()) || 0,
    eventCount: eventCountMap.get(user._id.toString()) || 0,
    storyCount: storyCountMap.get(user._id.toString()) || 0,
    totalContent: (postCountMap.get(user._id.toString()) || 0) +
                  (productCountMap.get(user._id.toString()) || 0) +
                  (eventCountMap.get(user._id.toString()) || 0) +
                  (storyCountMap.get(user._id.toString()) || 0),
  }));

  res.status(200).json({
    success: true,
    count: usersWithCounts.length,
    data: usersWithCounts,
  });
});

// @desc    Update user (e.g., toggle admin status, ban/unban)
// @route   PUT /api/admin/users/:id
// @access  Private (Admin)
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isAdmin, isBanned, username, email, firstname, lastname, bio } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }

  const user = await User.findById(id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (username && username !== user.username) {
    const existingUser = await User.findOne({ username });
    if (existingUser && existingUser._id.toString() !== id) {
      res.status(400);
      throw new Error('Username is already taken');
    }
  }

  user.isAdmin = isAdmin !== undefined ? isAdmin : user.isAdmin;
  user.isBanned = isBanned !== undefined ? isBanned : user.isBanned;
  user.username = username || user.username;
  user.email = email || user.email;
  user.firstname = firstname || user.firstname;
  user.lastname = lastname || user.lastname;
  user.bio = bio || user.bio;

  const updatedUser = await user.save();
  res.status(200).json({
    success: true,
    message: 'User updated successfully',
    data: updatedUser,
  });
});

// @desc    Delete user and their content
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin)
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }

  const user = await User.findById(id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  await Promise.all([
    Post.deleteMany({ user_id: id }),
    Product.deleteMany({ user_id: id }),
    Event.deleteMany({ user_id: id }),
    Story.deleteMany({ user_id: id }),
    SavedItem.deleteMany({ user_id: id }),
    Notification.deleteMany({ $or: [{ sender: id }, { recipient: id }] }),
  ]);

  await user.deleteOne();
  res.status(200).json({ success: true, message: 'User and their content deleted successfully' });
});

// @desc    Get all posts
// @route   GET /api/admin/posts
// @access  Private (Admin)
const getAllPosts = asyncHandler(async (req, res) => {
  const posts = await Post.find()
    .populate('user_id', 'username avatar')
    .populate('comments.user_id', 'username avatar');
  res.status(200).json({ success: true, data: posts });
});

// @desc    Create post (expects multer.single('file') in route)
const createPost = handleMulterError(asyncHandler(async (req, res) => {
  console.log('createPost - req.file:', req.file); // Debug log
  console.log('createPost - req.body:', req.body); // Debug log

  const { content, user_id } = req.body;
  if (!content || !user_id) {
    res.status(400);
    throw new Error('Content and user_id are required');
  }

  const postData = { content, user_id };
  if (req.file) {
    postData.image = {
      filename: req.file.filename,
      path: `/storage/posts-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const post = await Post.create(postData);
  const populatedPost = await Post.findById(post._id)
    .populate('user_id', 'username avatar')
    .populate('comments.user_id', 'username avatar');

  res.status(201).json({
    success: true,
    message: 'Post created successfully',
    data: populatedPost,
  });
}));

// @desc    Update post (expects multer.single('file') in route)
const updatePost = handleMulterError(asyncHandler(async (req, res) => {
  console.log('updatePost - req.file:', req.file); // Debug log
  console.log('updatePost - req.body:', req.body); // Debug log

  const { id } = req.params;
  const { content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid post ID');
  }

  const post = await Post.findById(id);
  if (!post) {
    res.status(404);
    throw new Error('Post not found');
  }

  const updateData = { content: content || post.content };
  if (req.file) {
    updateData.image = {
      filename: req.file.filename,
      path: `/storage/posts-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const updatedPost = await Post.findByIdAndUpdate(id, updateData, { new: true })
    .populate('user_id', 'username avatar')
    .populate('comments.user_id', 'username avatar');

  res.status(200).json({
    success: true,
    message: 'Post updated successfully',
    data: updatedPost,
  });
}));

// @desc    Delete post
// @route   DELETE /api/admin/posts/:id
// @access  Private (Admin)
const deletePost = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid post ID');
  }

  const post = await Post.findById(id);
  if (!post) {
    res.status(404);
    throw new Error('Post not found');
  }

  await post.deleteOne();
  res.status(200).json({ success: true, message: 'Post deleted successfully' });
});

// @desc    Get all products
// @route   GET /api/admin/products
// @access  Private (Admin)
const getAllProducts = asyncHandler(async (req, res) => {
  const products = await Product.find()
    .populate('user_id', 'username avatar');
  res.status(200).json({ success: true, data: products });
});

// @desc    Create product (expects multer.single('file') in route)
const createProduct = handleMulterError(asyncHandler(async (req, res) => {
  console.log('createProduct - req.file:', req.file); // Debug log
  console.log('createProduct - req.body:', req.body); // Debug log

  const { title, description, price, category, condition, status, user_id } = req.body;

  if (!title || !price || !user_id) {
    res.status(400);
    throw new Error('Title, price, and user_id are required');
  }

  const productData = {
    user_id,
    title,
    description: description || '',
    price: parseFloat(price),
    category: category || '',
    condition: condition || 'new',
    status: status || 'instock',
  };

  if (req.file) {
    productData.image = {
      filename: req.file.filename,
      path: `/storage/products-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const product = await Product.create(productData);
  const populatedProduct = await Product.findById(product._id)
    .populate('user_id', 'username avatar');

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: populatedProduct,
  });
}));

// @desc    Update product (expects multer.single('file') in route)
const updateProduct = handleMulterError(asyncHandler(async (req, res) => {
  console.log('updateProduct - req.file:', req.file); // Debug log
  console.log('updateProduct - req.body:', req.body); // Debug log

  const { id } = req.params;
  const { title, description, price, category, condition, status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid product ID');
  }

  const product = await Product.findById(id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const updateData = {
    title: title || product.title,
    description: description || product.description,
    price: price ? parseFloat(price) : product.price,
    category: category || product.category,
    condition: condition || product.condition,
    status: status || product.status,
  };

  if (req.file) {
    updateData.image = {
      filename: req.file.filename,
      path: `/storage/products-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { new: true })
    .populate('user_id', 'username avatar');

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    data: updatedProduct,
  });
}));

// @desc    Delete product
// @route   DELETE /api/admin/products/:id
// @access  Private (Admin)
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid product ID');
  }

  const product = await Product.findById(id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  await product.deleteOne();
  res.status(200).json({ success: true, message: 'Product deleted successfully' });
});

// @desc    Get all events
// @route   GET /api/admin/events
// @access  Private (Admin)
const getAllEvents = asyncHandler(async (req, res) => {
  const events = await Event.find()
    .populate('user_id', 'username avatar')
    .populate('comments.user_id', 'username avatar');
  res.status(200).json({ success: true, data: events });
});

// @desc    Create event (expects multer.single('file') in route)
const createEvent = handleMulterError(asyncHandler(async (req, res) => {
  console.log('createEvent - req.file:', req.file); // Debug log
  console.log('createEvent - req.body:', req.body); // Debug log

  const { event_title, event_details, event_date, event_location, user_id } = req.body;

  if (!event_title || !event_details || !event_date || !event_location || !user_id) {
    res.status(400);
    throw new Error('Event title, details, date, location, and user_id are required');
  }

  const eventData = { event_title, event_details, event_date, event_location, user_id };
  if (req.file) {
    eventData.image = {
      filename: req.file.filename,
      path: `/storage/events-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const event = await Event.create(eventData);
  const populatedEvent = await Event.findById(event._id)
    .populate('user_id', 'username avatar')
    .populate('comments.user_id', 'username avatar');

  res.status(201).json({
    success: true,
    message: 'Event created successfully',
    data: populatedEvent,
  });
}));

// @desc    Update event (expects multer.single('file') in route)
const updateEvent = handleMulterError(asyncHandler(async (req, res) => {
  console.log('updateEvent - req.file:', req.file); // Debug log
  console.log('updateEvent - req.body:', req.body); // Debug log

  const { id } = req.params;
  const { event_title, event_details, event_date, event_location } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid event ID');
  }

  const event = await Event.findById(id);
  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }

  const updateData = {
    event_title: event_title || event.event_title,
    event_details: event_details || event.event_details,
    event_date: event_date || event.event_date,
    event_location: event_location || event.event_location,
  };

  if (req.file) {
    updateData.image = {
      filename: req.file.filename,
      path: `/storage/events-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const updatedEvent = await Event.findByIdAndUpdate(id, updateData, { new: true })
    .populate('user_id', 'username avatar')
    .populate('comments.user_id', 'username avatar');

  res.status(200).json({
    success: true,
    message: 'Event updated successfully',
    data: updatedEvent,
  });
}));

// @desc    Delete event
// @route   DELETE /api/admin/events/:id
// @access  Private (Admin)
const deleteEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid event ID');
  }

  const event = await Event.findById(id);
  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }

  await event.deleteOne();
  res.status(200).json({ success: true, message: 'Event deleted successfully' });
});

// @desc    Get all stories
// @route   GET /api/admin/stories
// @access  Private (Admin)
const getAllStories = asyncHandler(async (req, res) => {
  const stories = await Story.find()
    .populate('user_id', 'username avatar')
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: stories });
});

// @desc    Create story (expects multer.single('file') in route)
const createStory = handleMulterError(asyncHandler(async (req, res) => {
  console.log('createStory - req.file:', req.file); // Debug log
  console.log('createStory - req.body:', req.body); // Debug log

  const { text, textColor, user_id } = req.body;

  if (!req.file || !user_id) {
    res.status(400);
    throw new Error('Image and user_id are required');
  }

  const storyData = {
    user_id,
    image: {
      filename: req.file.filename,
      path: `/storage/stories-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    },
    text: text || '',
    textColor: textColor || '#ffffff',
    views: [],
  };

  const story = await Story.create(storyData);
  const populatedStory = await Story.findById(story._id)
    .populate('user_id', 'username avatar');

  res.status(201).json({
    success: true,
    message: 'Story created successfully',
    data: populatedStory,
  });
}));

// @desc    Update story (expects multer.single('file') in route)
const updateStory = handleMulterError(asyncHandler(async (req, res) => {
  console.log('updateStory - req.file:', req.file); // Debug log
  console.log('updateStory - req.body:', req.body); // Debug log

  const { id } = req.params;
  const { text, textColor } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid story ID');
  }

  const story = await Story.findById(id);
  if (!story) {
    res.status(404);
    throw new Error('Story not found');
  }

  const updateData = {
    text: text !== undefined ? text : story.text,
    textColor: textColor !== undefined ? textColor : story.textColor,
  };

  if (req.file) {
    updateData.image = {
      filename: req.file.filename,
      path: `/storage/stories-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
    updateData.updatedAt = Date.now();
  }

  const updatedStory = await Story.findByIdAndUpdate(id, updateData, { new: true })
    .populate('user_id', 'username avatar');

  res.status(200).json({
    success: true,
    message: 'Story updated successfully',
    data: updatedStory,
  });
}));

// @desc    Delete story
// @route   DELETE /api/admin/stories/:id
// @access  Private (Admin)
const deleteStory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid story ID');
  }

  const story = await Story.findById(id);
  if (!story) {
    res.status(404);
    throw new Error('Story not found');
  }

  await story.deleteOne();
  res.status(200).json({ success: true, message: 'Story deleted successfully' });
});

// @desc    Get all notifications
// @route   GET /api/admin/notifications
// @access  Private (Admin)
const getAllNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find()
    .populate('sender', 'username avatar')
    .populate('recipient', 'username avatar')
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: notifications });
});

// @desc    Delete notification
// @route   DELETE /api/admin/notifications/:id
// @access  Private (Admin)
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid notification ID');
  }

  const notification = await Notification.findById(id);
  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  await notification.deleteOne();
  res.status(200).json({ success: true, message: 'Notification deleted successfully' });
});

// @desc    API monitoring
// @route   GET /api/admin/api-metrics
// @access  Private (Admin)
const getApiMetrics = asyncHandler(async (req, res) => {
  const { period = '24h' } = req.query;
  const now = new Date();
  let startTime;

  // Set time range based on period
  switch (period) {
    case '1h':
      startTime = new Date(now - 60 * 60 * 1000);
      break;
    case '24h':
      startTime = new Date(now - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      res.status(400);
      throw new Error('Invalid period. Use 1h, 24h, or 7d');
  }

  // Updated apiCategories to cover all routes
  const apiCategories = {
    auth: ['/api/auth', '/api/auth/login', '/api/auth/register', '/api/auth/verify-token'],
    posts: ['/api/posts', '/api/posts/:id', '/api/posts\\?search=.*'],
    products: ['/api/products', '/api/products/:id', '/api/products\\?search=.*'],
    events: ['/api/events', '/api/events/:id', '/api/events\\?search=.*'],
    stories: ['/api/stories', '/api/stories/:id', '/api/stories\\?search=.*'],
    users: ['/api/users', '/api/users/:id', '/api/users\\?search=.*'],
    feed: ['/api/feed', '/api/feed\\?search=.*'],
    messages: ['/api/messages', '/api/messages/:id', '/api/messages\\?search=.*'],
    notifications: ['/api/notifications', '/api/notifications/:id', '/api/notifications\\?search=.*'],
    savedItems: ['/api/saved-items', '/api/saved-items/:id', '/api/saved-items\\?search=.*'],
    search: ['/api/search', '/api/search\\?search=.*'],
    adminAuth: ['/api/admin/login', '/api/admin/verify-token'],
    adminAnalytics: ['/api/admin/analytics'],
    adminPosts: [
      '/api/admin/posts',
      '/api/admin/posts/:id',
      '/api/admin/posts/:id/likes',
      '/api/admin/posts\\?search=.*',
      '/api/admin/likes/post/:id',
      '/api/admin/posts\\?search=&status=.*',
    ],
    adminProducts: ['/api/admin/products', '/api/admin/products/:id', '/api/admin/products\\?search=.*'],
    adminEvents: ['/api/admin/events', '/api/admin/events/:id', '/api/admin/events\\?search=.*'],
    adminStories: ['/api/admin/stories', '/api/admin/stories/:id', '/api/admin/stories\\?search=.*'],
    adminUsers: ['/api/admin/users', '/api/admin/users/:id', '/api/admin/users\\?search=.*'],
    adminMetrics: ['/api/admin/api-metrics', '/api/admin/api-metrics\\?period=.*'],
  };

  // Create switch branches for $switch in aggregation
  const switchBranches = Object.entries(apiCategories).flatMap(([category, endpoints]) =>
    endpoints.map(endpoint => ({
      case: {
        $regexMatch: {
          input: {
            $let: {
              vars: { baseEndpoint: { $arrayElemAt: [{ $split: ['$endpoint', '?'] }, 0] } },
              in: '$$baseEndpoint',
            },
          },
          regex: `^${endpoint.replace(/:[^/]+/g, '[^/]+').replace('\\?', '?')}$`,
        },
      },
      then: category,
    }))
  );

  // Aggregation pipeline for historical metrics
  const metrics = await ApiMetrics.aggregate([
    // Match documents within the specified time period
    {
      $match: {
        timestamp: { $gte: startTime, $lte: now },
      },
    },
    // Group by endpoint to calculate totals
    {
      $group: {
        _id: '$endpoint',
        totalRequests: { $sum: '$totalRequests' },
        errorCount: { $sum: '$errorCount' },
        lastCalled: { $max: '$timestamp' },
      },
    },
    // Calculate error rate and format output
    {
      $project: {
        endpoint: '$_id',
        totalRequests: 1,
        errorRate: {
          $cond: [
            { $eq: ['$totalRequests', 0] },
            0,
            { $divide: ['$errorCount', '$totalRequests'] },
          ],
        },
        lastCalled: 1,
        _id: 0,
      },
    },
    // Group by category using $switch
    {
      $group: {
        _id: {
          $switch: {
            branches: switchBranches,
            default: 'unknown',
          },
        },
        endpoints: {
          $push: {
            endpoint: '$endpoint',
            totalRequests: '$totalRequests',
            errorRate: '$errorRate',
            lastCalled: '$lastCalled',
          },
        },
        totalRequests: { $sum: '$totalRequests' },
        errorCount: { $sum: '$errorCount' },
      },
    },
    // Final projection to format category metrics
    {
      $project: {
        category: '$_id',
        totalRequests: 1,
        errorRate: {
          $cond: [
            { $eq: ['$totalRequests', 0] },
            0,
            { $divide: ['$errorCount', '$totalRequests'] },
          ],
        },
        endpoints: 1,
        _id: 0,
      },
    },
  ]);

  // Calculate uptime percentages
  const uptimeMetrics = metrics.map(metric => ({
    ...metric,
    uptimePercentage: metric.totalRequests
      ? metric.errorRate > 0.5
        ? 0
        : Math.round((1 - metric.errorRate) * 100 * 100) / 100
      : 100,
    endpoints: metric.endpoints.map(endpoint => ({
      ...endpoint,
      uptimePercentage: endpoint.totalRequests
        ? endpoint.errorRate > 0.5
          ? 0
          : Math.round((1 - endpoint.errorRate) * 100 * 100) / 100
        : 100,
    })),
  }));

  // Map endpoints to categories
  const endpointToCategory = Object.entries(apiCategories).reduce((acc, [category, endpoints]) => {
    endpoints.forEach(endpoint => {
      const regexPattern = `^${endpoint.replace(/:[^/]+/g, '[^/]+').replace('\\?', '?')}$`;
      acc.push({ pattern: new RegExp(regexPattern), category });
    });
    return acc;
  }, []);

  const getCategory = endpoint => {
    const normalizedEndpoint = endpoint.replace(/^[^:]+:/, '').replace(/\?.*$/, '');
    const match = endpointToCategory.find(({ pattern }) => pattern.test(normalizedEndpoint));
    return match ? match.category : 'unknown';
  };

  // Process real-time metrics from cache
  const realTimeMetrics = Array.from(apiRequestCache.entries()).reduce((acc, [endpoint, data]) => {
    const category = getCategory(endpoint);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push({
      endpoint: endpoint.replace(/\?.*$/, ''),
      requestCount: data.count || 0,
      lastRequest: data.lastRequest || null,
    });
    return acc;
  }, {});

  const realTimeMetricsArray = Object.entries(realTimeMetrics).map(([category, endpoints]) => ({
    category,
    endpoints: endpoints.filter(metric => metric.requestCount > 0),
  }));

  // Warn about unmatched endpoints
  if (uptimeMetrics.some(metric => metric.category === 'unknown')) {
    console.warn(
      'Unmatched endpoints found:',
      uptimeMetrics
        .filter(metric => metric.category === 'unknown')
        .flatMap(metric => metric.endpoints.map(e => e.endpoint))
    );
  }

  res.status(200).json({
    success: true,
    data: {
      historical: uptimeMetrics,
      realTime: realTimeMetricsArray,
      period,
      timestamp: now,
    },
  });
});


// @desc    Request admin password reset
// @route   POST /api/admin/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error('Email is required');
  }

  const normalizedEmail = email.toLowerCase();
  const admin = await User.findOne({ email: normalizedEmail, isAdmin: true });
  if (!admin) {
    res.status(404);
    throw new Error('No admin found with this email');
  }

  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const resetToken = crypto.createHash('sha256').update(verificationCode).digest('hex');

  admin.resetPasswordToken = resetToken;
  admin.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
  await admin.save();

  const message = `You requested an admin password reset. Use this verification code to reset your password: ${verificationCode}\n\nThis code expires in 10 minutes.`;
  try {
    await sendEmail(admin.email, 'Admin Password Reset Verification Code', message);
    res.status(200).json({ message: 'Verification code sent to your email' });
  } catch (error) {
    admin.resetPasswordToken = null;
    admin.resetPasswordExpires = null;
    await admin.save();
    res.status(500);
    throw new Error('Error sending verification code');
  }
});

// @desc    Verify code and reset admin password
// @route   POST /api/admin/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const { email, verificationCode, newPassword, confirmPassword } = req.body;

  if (!email || !verificationCode || !newPassword || !confirmPassword) {
    res.status(400);
    throw new Error('All fields are required');
  }

  if (newPassword !== confirmPassword) {
    res.status(400);
    throw new Error('Passwords do not match');
  }

  const normalizedEmail = email.toLowerCase();
  const resetToken = crypto.createHash('sha256').update(verificationCode).digest('hex');

  const admin = await User.findOne({
    email: normalizedEmail,
    isAdmin: true,
    resetPasswordToken: resetToken,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!admin) {
    res.status(400);
    throw new Error('Invalid or expired verification code');
  }

  admin.password = await bcrypt.hash(newPassword, 10);
  admin.resetPasswordToken = null;
  admin.resetPasswordExpires = null;
  await admin.save();

  res.status(200).json({ message: 'Admin password reset successfully' });
});

// @desc    Middleware to log API metrics
const logApiMetrics = asyncHandler(async (req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;

  res.send = function (body) {
    const responseTime = Date.now() - start;
    const endpoint = req.originalUrl;
    const method = req.method;
    const status = res.statusCode;

    ApiMetrics.create({
      endpoint,
      method,
      status,
      responseTime,
    }).catch(err => console.error('Error logging API metrics:', err));

    const cacheKey = `${method}:${endpoint}`;
    const existing = apiRequestCache.get(cacheKey) || { count: 0, lastRequest: new Date() };
    apiRequestCache.set(cacheKey, {
      count: existing.count + 1,
      lastRequest: new Date(),
    });

    return originalSend.call(this, body);
  };

  next();
});

// @desc    Get users who liked a post, product, or event
// @route   GET /api/admin/likes/:type/:id
// @access  Private (Admin only)
const getLikes = asyncHandler(async (req, res) => {
  const { type, id } = req.params;

  // Check if req.admin is defined (set by verifyAdmin middleware)
  if (!req.admin) {
    res.status(401);
    throw new Error('Unauthorized: No admin authenticated');
  }

  // Verify admin exists in Admin model
  const admin = await Admin.findById(req.admin._id);
  if (!admin) {
    res.status(403);
    throw new Error('Not authorized: Admin not found');
  }

  // Validate type
  const validTypes = ['post', 'product', 'event'];
  if (!validTypes.includes(type)) {
    res.status(400);
    throw new Error('Invalid type: Must be post, product, or event');
  }

  // Validate ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid ID format');
  }

  let item;
  // Fetch the item based on type
  if (type === 'post') {
    item = await Post.findById(id)
      .select('likes')
      .populate('likes', '_id username name email firstname lastname avatar');
  } else if (type === 'product') {
    item = await Product.findById(id)
      .select('likes')
      .populate('likes', '_id username name email firstname lastname avatar');
  } else if (type === 'event') {
    item = await Event.findById(id)
      .select('likes')
      .populate('likes', '_id username name email firstname lastname avatar');
  }

  if (!item) {
    res.status(404);
    throw new Error(`${type.charAt(0).toUpperCase() + type.slice(1)} not found`);
  }

  // Format the response
  const likedUsers = (item.likes || []).map((user) => ({
    _id: user._id.toString(),
    username: user.username || 'unknown',
    name: user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim() || user.username || 'Unknown',
    email: user.email || '',
    firstname: user.firstname || '',
    lastname: user.lastname || '',
    avatar: user.avatar || '',
  }));

  res.status(200).json({
    success: true,
    message: `Users who liked the ${type} retrieved successfully`,
    data: likedUsers,
  });
});
module.exports = {
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
  // Export multer for use in routes
  uploadPosts,
  uploadProducts,
  uploadEvents,
  uploadStories,
  getLikes,
};