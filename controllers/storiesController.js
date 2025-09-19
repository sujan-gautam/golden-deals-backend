const asyncHandler = require('express-async-handler');
const Story = require('../models/storiesModel');

// Get all stories (for all users)
const getAllStories = asyncHandler(async (req, res) => {
  const stories = await Story.find()
    .populate('user_id', 'name avatar username')
    .sort({ createdAt: -1 }); // Sort by newest first
  if (!stories.length) {
    return res.status(404).json({ message: 'No stories found.' });
  }
  res.status(200).json(stories);
});

// Create a new story
const createStory = asyncHandler(async (req, res) => {

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

  const populatedStory = await Story.findById(story._id).populate('user_id', 'name avatar username');
  res.status(201).json(populatedStory);
});

// Edit a story
const editStory = asyncHandler(async (req, res) => {
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
  const populatedStory = await Story.findById(updatedStory._id).populate(
    'user_id',
    'username avatar'
  );

  res.status(200).json(populatedStory);
});


// Delete a story
const deleteStory = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);

  if (!story) {
    return res.status(404).json({ message: 'Story not found' });
  }

  if (story.user_id.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized to delete this story' });
  }

  await story.deleteOne();
  res.status(200).json({ message: 'Story deleted successfully' });
});

// View a story (track views)
const viewStory = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);

  if (!story) {
    return res.status(404).json({ message: 'Story not found' });
  }

  const userId = req.user.id;
  if (!story.views.includes(userId)) {
    story.views.push(userId);
    await story.save();
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

