const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Post = require('../models/postModel');
const Product = require('../models/productModel');
const Event = require('../models/eventModel');
const Story = require('../models/storiesModel');
const User = require('../models/userModel');

// @desc    Get personalized feed for a user
// @route   POST /api/feed
// @access  Private
const feedAlgo = asyncHandler(async (req, res) => {
  const { user_id } = req.body;

  if (!mongoose.Types.ObjectId.isValid(user_id)) {
    return res.status(400).json({ message: 'Invalid user ID' });
  }

  const user = await User.findById(user_id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  try {
    // Fetch content from different models
    const posts = await Post.find()
      .populate('user_id', 'username name avatar')
      .populate('comments.user_id', 'username name avatar')
      .lean();

    const products = await Product.find()
      .populate('user_id', 'username name avatar')
      .populate('comments.user_id', 'username name avatar')
      .lean();

    const events = await Event.find()
      .populate('user_id', 'username name avatar')
      .populate('comments.user_id', 'username name avatar')
      .populate('interested', '_id')
      .lean();

    const stories = await Story.find({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Stories from last 24 hours
    })
      .populate('user_id', 'username name avatar')
      .lean();

    // Combine all content
    const allContent = [
      ...posts.map(item => ({ ...item, type: 'post' })),
      ...products.map(item => ({ ...item, type: 'product' })),
      ...events.map(item => ({ ...item, type: 'event' })),
      ...stories.map(item => ({ ...item, type: 'story' })),
    ];

    // Fetch user's interaction history
    const userPosts = await Post.find({ user_id }).lean();
    const userEvents = await Event.find({ user_id }).lean();
    const userProducts = await Product.find({ user_id }).lean();
    const userInterestedEvents = await Event.find({ interested: user_id }).lean();

    // Extract user interests based on interactions
    const userInteractions = [
      ...userPosts.map(p => p.content),
      ...userEvents.map(e => e.event_details + ' ' + e.event_title),
      ...userProducts.map(p => p.description + ' ' + p.title),
      ...userInterestedEvents.map(e => e.event_details + ' ' + e.event_title),
    ].join(' ').toLowerCase().split(/\s+/);

    const userInterests = [...new Set(userInteractions.filter(word => word.length > 3))];

    // Scoring function for content relevance
    const scoreContent = (item, user) => {
      let score = 0;

      // Recency: Prioritize newer content
      const timeDiff = (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60); // Hours since creation
      const recencyScore = Math.max(0, 1 - timeDiff / 168); // Decay over 7 days
      score += recencyScore * 30; // Weight recency heavily

      // Engagement: Likes, comments, shares
      const engagementScore =
        (item.likes?.length || 0) * 2 +
        (item.comments?.length || 0) * 3 +
        (item.shares || 0) * 5 +
        (item.type === 'event' ? (item.interested?.length || 0) * 4 : 0);
      score += engagementScore;

      // User connection: Boost content from followed users or friends (assuming a follow system)
      const isOwnContent = item.user_id._id.toString() === user_id;
      const isInterested = item.type === 'event' && item.interested?.some(id => id.toString() === user_id);
      if (isOwnContent) score += 50; // Boost user's own content
      if (isInterested) score += 30; // Boost events user is interested in

      // Content relevance: Match with user interests
      const contentText = (
        (item.type === 'post' ? item.content :
        item.type === 'product' ? item.title + ' ' + item.description :
        item.type === 'event' ? item.event_title + ' ' + item.event_details :
        item.text || '') + ' ' + (item.user_id.username || '')
      ).toLowerCase();

      const relevanceScore = userInterests.reduce((acc, interest) => {
        return acc + (contentText.includes(interest) ? 10 : 0);
      }, 0);
      score += relevanceScore;

      // Boost stories for freshness
      if (item.type === 'story') score += 20;

      return { ...item, score };
    };

    // Score and sort content
    const scoredContent = allContent
      .map(item => scoreContent(item, user))
      .sort((a, b) => b.score - a.score);

    // Limit to top 50 items
    const feed = scoredContent.slice(0, 50);

    res.status(200).json({
      message: 'Feed generated successfully',
      data: feed,
    });
  } catch (error) {
    console.error('Error generating feed:', error);
    res.status(500).json({ message: 'Server error generating feed' });
  }
});

// @desc    Suggest content for a user
// @route   POST /api/suggest-content
// @access  Private
const suggestContent = asyncHandler(async (req, res) => {
  const { user_id } = req.body;

  if (!mongoose.Types.ObjectId.isValid(user_id)) {
    return res.status(400).json({ message: 'Invalid user ID' });
  }

  const user = await User.findById(user_id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  try {
    // Fetch recent content not created by the user
    const posts = await Post.find({ user_id: { $ne: user_id } })
      .populate('user_id', 'username name avatar')
      .populate('comments.user_id', 'username name avatar')
      .limit(10)
      .lean();

    const products = await Product.find({ user_id: { $ne: user_id } })
      .populate('user_id', 'username name avatar')
      .populate('comments.user_id', 'username name avatar')
      .limit(10)
      .lean();

    const events = await Event.find({ user_id: { $ne: user_id } })
      .populate('user_id', 'username name avatar')
      .populate('comments.user_id', 'username name avatar')
      .populate('interested', '_id')
      .limit(10)
      .lean();

    const allContent = [
      ...posts.map(item => ({ ...item, type: 'post' })),
      ...products.map(item => ({ ...item, type: 'product' })),
      ...events.map(item => ({ ...item, type: 'event' })),
    ];

    // Fetch user's interaction history
    const userPosts = await Post.find({ user_id }).lean();
    const userEvents = await Event.find({ user_id }).lean();
    const userProducts = await Product.find({ user_id }).lean();
    const userInterestedEvents = await Event.find({ interested: user_id }).lean();

    // Extract user interests
    const userInteractions = [
      ...userPosts.map(p => p.content),
      ...userEvents.map(e => e.event_details + ' ' + e.event_title),
      ...userProducts.map(p => p.description + ' ' + p.title),
      ...userInterestedEvents.map(e => e.event_details + ' ' + e.event_title),
    ].join(' ').toLowerCase().split(/\s+/);

    const userInterests = [...new Set(userInteractions.filter(word => word.length > 3))];

    // Scoring function for suggestions
    const scoreSuggestion = (item) => {
      let score = 0;

      // Engagement score
      const engagementScore =
        (item.likes?.length || 0) * 2 +
        (item.comments?.length || 0) * 3 +
        (item.shares || 0) * 5 +
        (item.type === 'event' ? (item.interested?.length || 0) * 4 : 0);
      score += engagementScore;

      // Relevance to user interests
      const contentText = (
        (item.type === 'post' ? item.content :
        item.type === 'product' ? item.title + ' ' + item.description :
        item.type === 'event' ? item.event_title + ' ' + item.event_details : '')
      ).toLowerCase();

      const relevanceScore = userInterests.reduce((acc, interest) => {
        return acc + (contentText.includes(interest) ? 15 : 0);
      }, 0);
      score += relevanceScore;

      // Boost unexplored content
      const isNotInteracted = !(
        item.likes?.includes(user_id) ||
        item.comments?.some(c => c.user_id.toString() === user_id) ||
        (item.type === 'event' && item.interested?.includes(user_id))
      );
      if (isNotInteracted) score += 20;

      return { ...item, score };
    };

    // Score and sort suggestions
    const scoredSuggestions = allContent
      .map(item => scoreSuggestion(item))
      .sort((a, b) => b.score - a.score);

    // Limit to top 10 suggestions
    const suggestions = scoredSuggestions.slice(0, 10);

    res.status(200).json({
      message: 'Content suggestions generated successfully',
      data: suggestions,
    });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({ message: 'Server error generating suggestions' });
  }
});

module.exports = {
  feedAlgo,
  suggestContent,
};