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

//  NEW CONTROLLERS 
// @desc    Get users with more than 1 post/product/event
// @route   GET /api/users/active-creators
// @access  Private
const getActiveCreators = asyncHandler(async (req, res) => {
  try {
    // Get all users
    const allUsers = await User.find().select('_id username firstname lastname avatar bio');

    // Get counts for each content type
    const postCounts = await Post.aggregate([
      { $group: { _id: '$user_id', count: { $sum: 1 } } }
    ]);

    const productCounts = await Product.aggregate([
      { $group: { _id: '$user_id', count: { $sum: 1 } } }
    ]);

    const eventCounts = await Event.aggregate([
      { $group: { _id: '$user_id', count: { $sum: 1 } } }
    ]);

    // Convert counts to maps for easy lookup
    const postCountMap = new Map(postCounts.map(item => [item._id.toString(), item.count]));
    const productCountMap = new Map(productCounts.map(item => [item._id.toString(), item.count]));
    const eventCountMap = new Map(eventCounts.map(item => [item._id.toString(), item.count]));

    // Filter users who have more than 1 post, product, or event
    const activeCreators = allUsers.filter(user => {
      const userId = user._id.toString();
      const postCount = postCountMap.get(userId) || 0;
      const productCount = productCountMap.get(userId) || 0;
      const eventCount = eventCountMap.get(userId) || 0;

      return postCount > 1 || productCount > 1 || eventCount > 1;
    });

    // Add content counts to each user
    const creatorsWithCounts = activeCreators.map(user => {
      const userId = user._id.toString();
      return {
        ...user.toObject(),
        postCount: postCountMap.get(userId) || 0,
        productCount: productCountMap.get(userId) || 0,
        eventCount: eventCountMap.get(userId) || 0,
        totalContent: (postCountMap.get(userId) || 0) + 
                     (productCountMap.get(userId) || 0) + 
                     (eventCountMap.get(userId) || 0)
      };
    });

    // Sort by total content count (descending)
    creatorsWithCounts.sort((a, b) => b.totalContent - a.totalContent);

    res.status(200).json({
      success: true,
      count: creatorsWithCounts.length,
      data: creatorsWithCounts
    });

  } catch (error) {
    console.error('Error fetching active creators:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching active creators',
      error: error.message
    });
  }
});

// @desc    Get users with content counts (all users)
// @route   GET /api/users/with-content-counts
// @access  Private
const getUsersWithContentCounts = asyncHandler(async (req, res) => {
  try {
    const allUsers = await User.find().select('_id username firstname lastname avatar bio');

    const postCounts = await Post.aggregate([
      { $group: { _id: '$user_id', count: { $sum: 1 } } }
    ]);

    const productCounts = await Product.aggregate([
      { $group: { _id: '$user_id', count: { $sum: 1 } } }
    ]);

    const eventCounts = await Event.aggregate([
      { $group: { _id: '$user_id', count: { $sum: 1 } } }
    ]);

    const postCountMap = new Map(postCounts.map(item => [item._id.toString(), item.count]));
    const productCountMap = new Map(productCounts.map(item => [item._id.toString(), item.count]));
    const eventCountMap = new Map(eventCounts.map(item => [item._id.toString(), item.count]));

    const usersWithCounts = allUsers.map(user => {
      const userId = user._id.toString();
      const postCount = postCountMap.get(userId) || 0;
      const productCount = productCountMap.get(userId) || 0;
      const eventCount = eventCountMap.get(userId) || 0;

      return {
        ...user.toObject(),
        postCount,
        productCount,
        eventCount,
        totalContent: postCount + productCount + eventCount
      };
    });

    // Sort by total content count (descending)
    usersWithCounts.sort((a, b) => b.totalContent - a.totalContent);

    res.status(200).json({
      success: true,
      count: usersWithCounts.length,
      data: usersWithCounts
    });

  } catch (error) {
    console.error('Error fetching users with content counts:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users with content counts',
      error: error.message
    });
  }
});

// @desc    Search users by username for mention autocomplete
// @route   GET /api/search/mentioned-user?query=:query
// @access  Private
const searchUsersForMentions = asyncHandler(async (req, res) => {
  try {
    const { query } = req.query;

    if (!query?.trim()) {
      return res.status(200).json([]); // Return empty array for empty query
    }

    // Create regex for partial matching (case-insensitive, starts with query)
    const regexQuery = new RegExp(`^${query}`, 'i');

    // Search users by username, include avatar, limit to 10 results for performance
    const users = await User.find({
      username: regexQuery,
    })
      .select('_id username avatar') // Include avatar field
      .limit(10);

    res.status(200).json(users);
  } catch (error) {
    console.error('Error searching users for mentions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during user search',
      error: error.message,
    });
  }
});

module.exports = {
  searchAll,
  advancedSearch,
  getUsersWithContentCounts,
  getActiveCreators,
  searchUsersForMentions
};