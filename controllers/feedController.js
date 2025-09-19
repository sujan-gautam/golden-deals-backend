// controllers/feedController.js
const asyncHandler = require('express-async-handler');
const Post = require('../models/postModel');
const Product = require('../models/productModel');
const Event = require('../models/eventModel');

// @desc    GET combined feed of posts, products, and events
// @route   GET /api/feed
// @access  Private
const getFeed = asyncHandler(async (req, res) => {
  // Fetch all data in parallel
  const [posts, products, events] = await Promise.all([
    Post.find()
      .populate('user_id', 'username name avatar')
      .populate('comments.user_id', 'username name avatar'),
    Product.find()
      .populate('user_id', 'username name avatar'),
    Event.find()
      .populate('user_id', 'username name avatar')
      .populate('comments.user_id', 'username name avatar'),
  ]);

  // Normalize posts
  const normalizedPosts = posts.map(post => ({
    _id: post._id,
    type: 'post',
    content: post.content,
    image: post.image,
    likes: post.likes.length,
    liked: post.likes.includes(req.user.id),
    shares: post.shares || 0,
    comments: post.comments.map(comment => ({
      _id: comment._id,
      user: comment.user_id, // Already populated
      content: comment.content,
      createdAt: comment.createdAt,
    })),
    user: post.user_id, // Populated with username, name, avatar
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  }));

  // Normalize products
  const normalizedProducts = products.map(product => ({
    _id: product._id,
    type: 'product',
    title: product.title,
    content: product.description, // Map description to content for consistency
    price: product.price,
    category: product.category,
    condition: product.condition,
    status: product.status,
    image: product.image,
    likes: product.likes ? product.likes.length : 0, // Assuming likes added to model
    liked: product.likes ? product.likes.includes(req.user.id) : false,
    shares: product.shares || 0,
    comments: product.comments || [], // Add comments to model if needed
    user: product.user_id, // Populated with username, name, avatar
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }));

  // Normalize events
  const normalizedEvents = events.map(event => ({
    _id: event._id,
    type: 'event',
    event_title: event.event_title,
    content: event.event_details, // Map details to content
    event_date: event.event_date,
    event_location: event.event_location,
    image: event.image,
    likes: event.interested.length, // Using interested as likes for consistency
    liked: event.interested.includes(req.user.id), // Map interested to liked
    interested: event.interested.length,
    isInterested: event.interested.includes(req.user.id),
    shares: event.shares || 0,
    comments: event.comments.map(comment => ({
      _id: comment._id,
      user: comment.user_id, // Already populated
      content: comment.content,
      createdAt: comment.createdAt,
    })),
    user: event.user_id, // Populated with username, name, avatar
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  }));

  // Combine and sort by createdAt (newest first)
  const feed = [...normalizedPosts, ...normalizedProducts, ...normalizedEvents]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (feed.length === 0) {
    return res.status(404).json({ message: "No items found for the feed." });
  }

  res.status(200).json(feed);
});

module.exports = { getFeed };