const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const User = require('../models/userModel');
const Post = require('../models/postModel');
const Product = require('../models/productModel');
const Event = require('../models/eventModel');

// @desc    Search across all entities (users, posts, products, events)
// @route   GET /api/search?q=:query
// @access  Private
const searchAll = async (req, res) => {
  try {
    const query = req.query.q?.trim();
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    // Create regex for partial matching (case-insensitive)
    const regexQuery = new RegExp(query, 'i');

    // Search users
    const users = await User.find({
      $or: [
        { username: regexQuery },
        { firstname: regexQuery },
        { lastname: regexQuery },
        { bio: regexQuery },
      ],
    }).select('username firstname lastname avatar bio');

    // Search posts
    const posts = await Post.find({
      content: regexQuery,
    }).populate('user_id', 'username avatar');

    // Search products
    const products = await Product.find({
      $or: [
        { title: regexQuery },
        { description: regexQuery },
        { category: regexQuery },
      ],
    }).populate('user_id', 'username avatar');

    // Search events
    const events = await Event.find({
      $or: [
        { event_title: regexQuery },
        { event_details: regexQuery },
        { event_location: regexQuery },
      ],
    }).populate('user_id', 'username avatar');

    res.status(200).json({
      users: users || [],
      posts: posts || [],
      products: products || [],
      events: events || [],
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      users: [],
      posts: [],
      products: [],
      events: [],
      message: 'Server error during search',
    });
  }
};
  
// @desc    Advanced search with filters
// @route   POST /api/search/advanced
// @access  Private
const advancedSearch = async (req, res) => {
  try {
    const {
      query,
      type,
      userId,
      minPrice,
      maxPrice,
      category,
      condition,
      eventDateFrom,
      eventDateTo,
      location,
    } = req.body;

    if (!query?.trim()) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const regexQuery = new RegExp(query, 'i');
    let users = [];
    let posts = [];
    let products = [];
    let events = [];

    if (!type || type === 'users') {
      users = await User.find({
        $or: [
          { username: regexQuery },
          { firstname: regexQuery },
          { lastname: regexQuery },
          { bio: regexQuery },
        ],
        ...(userId && { _id: userId }),
      }).select('username firstname lastname avatar bio');
    }

    if (!type || type === 'posts') {
      posts = await Post.find({
        content: regexQuery,
        ...(userId && { user_id: userId }),
      }).populate('user_id', 'username avatar');
    }

    if (!type || type === 'products') {
      products = await Product.find({
        $or: [
          { title: regexQuery },
          { description: regexQuery },
          { category: regexQuery },
        ],
        ...(userId && { user_id: userId }),
        ...(minPrice && { price: { $gte: minPrice } }),
        ...(maxPrice && { price: { $lte: maxPrice } }),
        ...(category && { category }),
        ...(condition && { condition }),
      }).populate('user_id', 'username avatar');
    }

    if (!type || type === 'events') {
      events = await Event.find({
        $or: [
          { event_title: regexQuery },
          { event_details: regexQuery },
          { event_location: regexQuery },
        ],
        ...(userId && { user_id: userId }),
        ...(eventDateFrom && { event_date: { $gte: new Date(eventDateFrom) } }),
        ...(eventDateTo && { event_date: { $lte: new Date(eventDateTo) } }),
        ...(location && { event_location: regexQuery }),
      }).populate('user_id', 'username avatar');
    }

    res.status(200).json({
      users: users || [],
      posts: posts || [],
      products: products || [],
      events: events || [],
    });
  } catch (error) {
    console.error('Advanced search error:', error);
    res.status(500).json({
      users: [],
      posts: [],
      products: [],
      events: [],
      message: 'Server error during advanced search',
    });
  }
};
module.exports = {
  searchAll,
  advancedSearch,
};