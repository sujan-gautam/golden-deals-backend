const asyncHandler = require('express-async-handler');
const Post = require('../models/postModel');
const Product = require('../models/productModel');
const Event = require('../models/eventModel');
const Notification = require('../models/notificationModel');
const Conversation = require('../models/conversationModel');
const SavedItem = require('../models/savedItemModel');
const Activity = require('../models/activityModel');
const { logActivity } = require('../utils/activityLogger');

// @desc    Get personalized feed
// @route   GET /api/feed
// @access  Private
const getFeed = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('getFeed - No user ID found');
    res.status(401).json({ message: 'Unauthorized: No user ID found' });
    return;
  }

  const userId = req.user.id;
  const { tab = 'all', sort = 'latest', limit = 20, skip = 0 } = req.query;

  // Validate query parameters
  if (!['all', 'post', 'product', 'event'].includes(tab)) {
    res.status(400).json({ message: 'Invalid tab value' });
    return;
  }
  if (!['latest', 'trending'].includes(sort)) {
    res.status(400).json({ message: 'Invalid sort value' });
    return;
  }
  const parsedLimit = parseInt(limit, 10);
  const parsedSkip = parseInt(skip, 10);
  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
    res.status(400).json({ message: 'Limit must be a number between 1 and 50' });
    return;
  }
  if (isNaN(parsedSkip) || parsedSkip < 0) {
    res.status(400).json({ message: 'Skip must be a non-negative number' });
    return;
  }

  try {
    console.log(`getFeed - Fetching feed for user: ${userId}, tab: ${tab}, sort: ${sort}`);

    // Step 1: Fetch base content
    const posts = await Post.find({})
      .populate('user_id', 'username firstname lastname avatar')
      .lean()
      .limit(50);
    const products = await Product.find({})
      .populate('user_id', 'username firstname lastname avatar')
      .lean()
      .limit(50);
    const events = await Event.find({})
      .populate('user_id', 'username firstname lastname avatar')
      .lean()
      .limit(50);

    let content = tab === 'all' ? [...posts, ...products, ...events] :
                  tab === 'post' ? posts :
                  tab === 'product' ? products : events;

    // Step 2: Fetch personalization data
    const activities = await Activity.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
    const followedUsers = await Notification.find({ recipient: userId, type: 'follow' })
      .distinct('sender')
      .lean();
    const conversations = await Conversation.find({ participants: userId })
      .distinct('_id')
      .lean();
    const savedItems = await SavedItem.find({ user_id: userId })
      .lean();
    const popularCreators = await Activity.aggregate([
      { $match: { action: { $in: ['create_post', 'create_product', 'create_event'] } } },
      { $group: { _id: '$user_id', contentCount: { $sum: 1 } } },
      { $sort: { contentCount: -1 } },
      { $limit: 10 },
    ]).then(results => results.map(r => r._id.toString()));

    // Step 3: Calculate personalization scores
    const scoredContent = content.map(item => {
      let personalizationScore = 0;
      const itemType = item.type || (item.title ? 'product' : item.event_title ? 'event' : 'post');
      const itemId = item._id.toString();

      // User interactions
      if (activities.some(a => a.action === `like_${itemType}` && a.target_id.toString() === itemId)) {
        personalizationScore += 0.2;
      }
      if (activities.some(a => a.action === `comment_${itemType}` && a.target_id.toString() === itemId)) {
        personalizationScore += 0.3;
      }
      if (activities.some(a => a.action === `share_${itemType}` && a.target_id.toString() === itemId)) {
        personalizationScore += 0.25;
      }
      if (savedItems.some(s => s.item_id.toString() === itemId && s.item_type === itemType)) {
        personalizationScore += 0.15;
      }
      if (item.conversationId && conversations.some(c => c.toString() === item.conversationId.toString())) {
        personalizationScore += 0.4;
      }

      // Social connections
      if (followedUsers.some(f => f.toString() === item.user_id?._id.toString())) {
        personalizationScore += 0.5;
      }
      if (popularCreators.includes(item.user_id?._id.toString())) {
        personalizationScore += 0.3;
      }

      // Content relevance
      if (itemType === 'event' && new Date(item.event_date) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) {
        personalizationScore += 0.25;
      }

      return { ...item, personalizationScore, type: itemType };
    });

    // Step 4: Sort and rank
    let sortedContent;
    if (sort === 'latest') {
      sortedContent = scoredContent.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || 
        b.personalizationScore - a.personalizationScore
      );
    } else {
      sortedContent = scoredContent.sort((a, b) => {
        const aEngagement = ((Array.isArray(a.likes) ? a.likes.length : a.likes || 0) * 0.4) +
                           (a.comments?.length || 0) * 0.5 +
                           (a.shares || 0) * 0.3 +
                           (a.type === 'event' ? (Array.isArray(a.interested) ? a.interested.length : a.interested || 0) * 0.4 : 0);
        const bEngagement = ((Array.isArray(b.likes) ? b.likes.length : b.likes || 0) * 0.4) +
                           (b.comments?.length || 0) * 0.5 +
                           (b.shares || 0) * 0.3 +
                           (b.type === 'event' ? (Array.isArray(b.interested) ? b.interested.length : b.interested || 0) * 0.4 : 0);
        const aFinalScore = aEngagement + a.personalizationScore;
        const bFinalScore = bEngagement + b.personalizationScore;
        return bFinalScore - aFinalScore;
      });
    }

    // Step 5: Diversity adjustment (for 'all' tab)
    if (tab === 'all') {
      const typeCounts = { post: 0, product: 0, event: 0 };
      sortedContent.forEach(item => typeCounts[item.type]++);
      const total = sortedContent.length;
      if (total > 0 && (typeCounts.post / total > 0.5 || typeCounts.product / total > 0.5 || typeCounts.event / total > 0.5)) {
        sortedContent = balanceContentTypes(sortedContent, { post: 0.4, product: 0.3, event: 0.3 }, parsedLimit);
      }
    }

    // Step 6: Paginate and format
    const paginatedContent = sortedContent.slice(parsedSkip, parsedSkip + parsedLimit).map(item => ({
      _id: item._id.toString(),
      type: item.type,
      user_id: item.user_id?._id?.toString() || item.user_id || 'unknown',
      user: {
        _id: item.user_id?._id?.toString() || item.user_id || 'unknown',
        name: `${item.user_id?.firstname || ''} ${item.user_id?.lastname || ''}`.trim() || item.user_id?.username || 'Unknown',
        avatar: item.user_id?.avatar ? `${process.env.API_URL}${item.user_id.avatar}` : '',
      },
      content: item.content || item.description || item.event_details || '',
      image: item.image ? {
        filename: item.image.filename || '',
        path: item.image.path?.startsWith('http') ? item.image.path : `${process.env.API_URL}${item.image.path || ''}`,
        mimetype: item.image.mimetype || '',
      } : undefined,
      likes: Array.isArray(item.likes) ? item.likes : item.likes || [],
      comments: item.comments || [],
      shares: item.shares || 0,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
      ...(item.type === 'product' && {
        title: item.title || 'Untitled',
        price: item.price || 0,
        category: item.category || '',
        condition: item.condition || 'new',
        status: item.status || 'instock',
      }),
      ...(item.type === 'event' && {
        event_title: item.event_title || 'Untitled Event',
        event_date: item.event_date || new Date().toISOString(),
        event_location: item.event_location || 'Unknown Location',
        interested: Array.isArray(item.interested) ? item.interested : item.interested || [],
      }),
    }));

    // Step 7: Log activity
    await logActivity(userId, 'view_feed', null, null, {
      action: 'view_feed',
      tab,
      sort,
      content_count: paginatedContent.length,
    });

    console.log(`getFeed - Returning ${paginatedContent.length} items for user: ${userId}`);
    res.status(200).json({
      data: paginatedContent,
      total: sortedContent.length,
      skip: parsedSkip,
      limit: parsedLimit,
    });
  } catch (error) {
    console.error('getFeed - Error:', error.message);
    res.status(500).json({ message: 'Server error while fetching feed' });
  }
});

// Helper function to balance content types
function balanceContentTypes(content, targetRatios, maxItems) {
  const result = [];
  const typeCounts = { post: 0, product: 0, event: 0 };

  content.forEach(item => {
    if (result.length < maxItems) {
      const currentRatio = result.length > 0 ? typeCounts[item.type] / result.length : 0;
      if (currentRatio < targetRatios[item.type]) {
        result.push(item);
        typeCounts[item.type]++;
      }
    }
  });

  // Fill remaining slots with highest-scored items
  while (result.length < maxItems && content.length > result.length) {
    const remaining = content.filter(item => !result.includes(item));
    if (remaining.length > 0) {
      result.push(remaining[0]);
      typeCounts[remaining[0].type]++;
    }
  }

  return result;
}

module.exports = {
  getFeed,
};