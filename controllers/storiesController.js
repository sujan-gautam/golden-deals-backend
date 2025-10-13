const asyncHandler = require('express-async-handler');
const Story = require('../models/storiesModel');
const { logActivity } = require('../utils/activityLogger');

// @desc    Get all stories (for all users)
// @route   GET /api/stories
// @access  Private
const getAllStories = asyncHandler(async (req, res) => {
  const stories = await Story.find()
    .populate('user_id', 'name avatar username')
    .sort({ createdAt: -1 }); // Sort by newest first
  if (!stories.length) {
    return res.status(404).json({ message: 'No stories found.' });
  }

  // Log activity only if user is authenticated
  if (req.user && req.user.id) {
    await logActivity(req.user.id, 'view_stories', null, null, {
      action: 'view_all_stories',
      stories_count: stories.length,
    });
  }

  res.status(200).json(stories);
});

// @desc    Create a new story
// @route   POST /api/stories
// @access  Private
const createStory = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('No user ID found in request');
    return res.status(401).json({ message: 'Not authorized, user not found' });
  }

  const user_id = req.user.id;
  const { text, textColor } = req.body;

  if (!req.file) {
    console.log('No file uploaded, rejecting request');
    return res.status(400).json({ message: 'An image is required for a story!' });
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
  if (!story) {
    return res.status(500).json({ message: 'Failed to save story' });
  }

  // Log activity
  await logActivity(user_id, 'create_story', story._id, 'Story', {
    text_snippet: story.text ? story.text.substring(0, 50) : '',
    has_image: !!req.file,
    text_color: story.textColor,
  });

  const populatedStory = await Story.findById(story._id).populate('user_id', 'name avatar username');
  res.status(201).json(populatedStory);
});

// @desc    Edit a story
// @route   PUT /api/stories/:id
// @access  Private
const editStory = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('No user ID found in request');
    return res.status(401).json({ message: 'Not authorized, user not found' });
  }

  const story = await Story.findById(req.params.id);

  if (!story) {
    return res.status(404).json({ message: 'Story not found' });
  }

  if (story.user_id.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized to edit this story' });
  }

  const { text, textColor } = req.body;

  // Update fields
  story.text = text !== undefined ? text : story.text;
  story.textColor = textColor !== undefined ? textColor : story.textColor;
  story.updatedAt = Date.now();

  const updatedStory = await story.save();

  // Log activity
  await logActivity(req.user.id, 'edit_story', story._id, 'Story', {
    text_snippet: updatedStory.text ? updatedStory.text.substring(0, 50) : '',
    text_color: updatedStory.textColor,
  });

  const populatedStory = await Story.findById(updatedStory._id).populate(
    'user_id',
    'name avatar username'
  );

  res.status(200).json(populatedStory);
});

// @desc    Delete a story
// @route   DELETE /api/stories/:id
// @access  Private
const deleteStory = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('No user ID found in request');
    return res.status(401).json({ message: 'Not authorized, user not found' });
  }

  const story = await Story.findById(req.params.id);

  if (!story) {
    return res.status(404).json({ message: 'Story not found' });
  }

  if (story.user_id.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized to delete this story' });
  }

  // Log activity
  await logActivity(req.user.id, 'delete_story', story._id, 'Story', {
    text_snippet: story.text ? story.text.substring(0, 50) : '',
  });

  await story.deleteOne();
  res.status(200).json({ message: 'Story deleted successfully' });
});

// @desc    View a story (track views)
// @route   POST /api/stories/:id/view
// @access  Private
const viewStory = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('No user ID found in request');
    return res.status(401).json({ message: 'Not authorized, user not found' });
  }

  const story = await Story.findById(req.params.id);

  if (!story) {
    return res.status(404).json({ message: 'Story not found' });
  }

  const userId = req.user.id;
  let isNewView = false;
  if (!story.views.includes(userId)) {
    story.views.push(userId);
    await story.save();
    isNewView = true;
  }

  // Log activity only for new views
  if (isNewView) {
    await logActivity(userId, 'view_story', story._id, 'Story', {
      text_snippet: story.text ? story.text.substring(0, 50) : '',
      view_count: story.views.length,
    });
  }

  const populatedStory = await Story.findById(story._id).populate(
    'user_id',
    'name avatar username'
  );
  res.status(200).json(populatedStory);
});

module.exports = {
  getAllStories,
  createStory,
  editStory,
  deleteStory,
  viewStory,
};