// controllers/eventController.js
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Event = require('../models/eventModel');
const Notification = require('../models/notificationModel'); 

// @desc    GET all events
// @route   GET /api/events/all
// @access  Private
const getAllEvents = async (req, res) => {
  try {
    const events = await Event.find()
      .populate('user_id', 'name avatar') // Populate user details
      .populate('likes', '_id') // Populate likes as user IDs
      .populate('interested', '_id'); // Populate interested as user IDs
    res.status(200).json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    GET all events of a user
// @route   GET /api/events
// @access  Private
const getEvents = asyncHandler(async (req, res) => {
  const events = await Event.find({ user_id: req.user.id })
    .populate('user_id', 'name avatar username'); // Added username
  if (events.length === 0) {
    return res.status(404).json({ message: "No events found." });
  }
  res.status(200).json(events);
});

// @desc    ADD new event with optional image
// @route   POST /api/events
// @access  Private
const createEvent = asyncHandler(async (req, res) => {
  const user_id = req.user.id;


  const { event_title, event_details, event_date, event_location } = req.body;

  if (!event_title || !event_details || !event_date || !event_location) {
    return res.status(400).json({ message: "Event title, details, date, and location are required!" });
  }

  const eventData = {
    user_id,
    event_title,
    event_details,
    event_date,
    event_location,
  };

  if (req.file) {
    eventData.image = {
      filename: req.file.filename,
      path: `/storage/events-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const event = await Event.create(eventData);
  const populatedEvent = await Event.findById(event._id)
  .populate('user_id', 'name avatar username'); // Add username

  res.status(201).json({
    message: "Event added successfully!",
    data: populatedEvent,
  });
});

// @desc    UPDATE event with optional image
// @route   PUT /api/events/:id
// @access  Private
const updateEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  if (event.user_id.toString() !== req.user.id) {
    return res.status(403).json({ message: "Not authorized to update this event" });
  }

  const updateData = {
    event_title: req.body.event_title,
    event_details: req.body.event_details,
    event_date: req.body.event_date,
    event_location: req.body.event_location,
  };

  if (req.file) {
    updateData.image = {
      filename: req.file.filename,
      path: `/storage/events-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const updated = await Event.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true }
  ).populate('user_id', 'name avatar');

  res.status(200).json({
    message: "Event updated successfully",
    data: updated,
  });
});

// @desc    DELETE event
// @route   DELETE /api/events/:id
// @access  Private
const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  if (event.user_id.toString() !== req.user.id) {
    return res.status(403).json({ message: "Not authorized to delete this event" });
  }

  await event.deleteOne();

  res.status(200).json({ message: "Event deleted successfully" });
});

// @desc    Mark interest in an event
// @route   POST /api/events/:id/interested
// @access  Private
const interestedInEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    return res.status(404).json({ message: 'Event not found' });
  }

  const userId = req.user.id;
  const isInterested = event.interested.includes(userId);

  if (isInterested) {
    event.interested = event.interested.filter((id) => id.toString() !== userId);
  } else {
    event.interested.push(userId);
  }

  await event.save();

  // Create notification if marking interest (not removing) and not the user's own event
  if (!isInterested && event.user_id.toString() !== userId) {
    await Notification.create({
      recipient: event.user_id,
      sender: userId,
      type: 'event_interested',
      event: event._id,
      content: `${req.user.username || 'A user'} is interested in your event "${event.event_title}".`,
    });
  }

  res.status(200).json({
    message: isInterested ? 'Removed interest in event' : 'Marked interest in event',
    data: event,
  });
});

// @desc    Like an event
// @route   POST /api/events/:id/like
// @access  Private
// @desc    Like an event
// @route   POST /api/events/:id/like
// @access  Private
const likeEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    return res.status(404).json({ message: 'Event not found' });
  }

  const userId = req.user.id;
  const isLiked = event.likes.includes(userId);

  if (isLiked) {
    event.likes = event.likes.filter((id) => id.toString() !== userId);
  } else {
    event.likes.push(userId);
  }

  await event.save();

  const populatedEvent = await Event.findById(event._id)
    .populate('user_id', 'name avatar username')
    .populate('comments.user_id', 'name avatar username');

  // Create notification if liking (not unliking) and not the user's own event
  if (!isLiked && event.user_id.toString() !== userId) {
    await Notification.create({
      recipient: event.user_id,
      sender: userId,
      type: 'event_like',
      event: event._id,
      content: `${req.user.username || 'A user'} liked your event "${event.event_title}".`,
    });
  }

  res.status(200).json({
    message: isLiked ? 'Event unliked' : 'Event liked',
    data: populatedEvent,
  });
});


// @desc    Comment or reply on an event
// @route   POST /api/events/:id/comment
// @access  Private
const commentOnEvent = asyncHandler(async (req, res) => {

  const { content, parentId, mentions } = req.body;
  if (!content) {
    return res.status(400).json({ message: 'Comment content is required' });
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid event ID' });
  }

  const event = await Event.findById(req.params.id);
  if (!event) {
    return res.status(404).json({ message: 'Event not found' });
  }

  const comment = {
    _id: new mongoose.Types.ObjectId(), 
    user_id: req.user.id,
    content,
    parentId: parentId || null,
    mentions: mentions || [],
    createdAt: new Date(),
    likes: [],
  };

  event.comments.push(comment);
  await event.save();

  if (event.user_id.toString() !== req.user.id) {
    await Notification.create({
      recipient: event.user_id,
      sender: req.user.id,
      type: 'event_comment',
      event: event._id,
      comment: comment._id,
      content: `${req.user.username || 'A user'} commented on your event "${event.event_title}".`,
    });
  }

  // Create notifications for mentioned users
  if (mentions && mentions.length > 0) {
    for (const username of mentions) {
      const mentionedUser = await User.findOne({ username });
      if (
        mentionedUser &&
        mentionedUser._id.toString() !== req.user.id &&
        mentionedUser._id.toString() !== event.user_id.toString()
      ) {
        await Notification.create({
          recipient: mentionedUser._id,
          sender: req.user.id,
          type: 'event_comment_mention',
          event: event._id,
          comment: comment._id,
          content: `${req.user.username || 'A user'} mentioned you in a comment on "${event.event_title}".`,
        });
      }
    }
  }

  // Populate user data for the response
  const updatedEvent = await Event.findById(req.params.id)
    .populate('comments.user_id', 'name avatar username');

  const newComment = updatedEvent.comments.find((c) => c._id.toString() === comment._id.toString());

  res.status(201).json({ message: 'Comment added successfully', data: newComment });
});


// @desc    Like a comment on an event
// @route   POST /api/events/:eventId/comments/:commentId/like
// @access  Private
const likeComment = asyncHandler(async (req, res) => {
  const { eventId, commentId } = req.params;
  const userId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(commentId)) {
    console.log('Invalid eventId or commentId:', { eventId, commentId });
    return res.status(400).json({ message: 'Invalid event or comment ID' });
  }

  const event = await Event.findById(eventId);
  if (!event) {
    console.log('Event not found:', eventId);
    return res.status(404).json({ message: 'Event not found' });
  }

  const comment = event.comments.id(commentId);
  if (!comment) {
    console.log('Comment not found:', commentId);
    return res.status(404).json({ message: 'Comment not found' });
  }

  // Initialize likes array if undefined
  if (!Array.isArray(comment.likes)) {
    comment.likes = [];
  }

  const isLiked = comment.likes.some((id) => id.toString() === userId);

  if (isLiked) {
    comment.likes = comment.likes.filter((id) => id.toString() !== userId);
  } else {
    comment.likes.push(userId);
  }

  await event.save();

  // Create notification if liking (not unliking) and not the user's own comment
  if (!isLiked && comment.user_id.toString() !== userId) {
    await Notification.create({
      recipient: comment.user_id,
      sender: userId,
      type: 'comment_like',
      event: event._id,
      comment: commentId,
      content: `${req.user.username || 'A user'} liked your comment on "${event.event_title}".`,
    });
  }

  // Populate user_id for the comment
  const updatedEvent = await Event.findById(eventId).populate(
    'comments.user_id',
    'name avatar username'
  );
  const updatedComment = updatedEvent.comments.id(commentId);

  res.status(200).json({
    message: isLiked ? 'Comment unliked' : 'Comment liked',
    data: {
      _id: updatedComment._id,
      user_id: updatedComment.user_id,
      content: updatedComment.content,
      likes: updatedComment.likes.map((id) => id.toString()),
      createdAt: updatedComment.createdAt,
      parentId: updatedComment.parentId || null,
      mentions: updatedComment.mentions || [],
    },
  });
});



// @desc    Share an event
// @route   POST /api/events/:id/share
// @access  Private
const shareEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }

  event.shares = (event.shares || 0) + 1;
  await event.save();

  res.status(200).json({
    message: "Event shared",
    data: event,
  });
});
// @desc    GET a single event by ID
// @route   GET /api/events/:id
// @access  Private
const getEventById = asyncHandler(async (req, res) => {

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    console.log('Invalid event ID:', req.params.id);
    return res.status(400).json({ message: 'Invalid event ID' });
  }

  try {
    const event = await Event.findById(req.params.id)
      .populate('user_id', 'name avatar username')
      .populate('likes', '_id')
      .populate('interested', '_id')
      .populate('comments.user_id', 'name avatar username');

    if (!event) {
      console.log('Event not found for ID:', req.params.id);
      return res.status(404).json({ message: 'Event not found' });
    }

    res.status(200).json({ message: 'Event retrieved successfully', data: event });
  } catch (error) {
    console.error('Error in getEventById:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// @desc    GET events user is interested in
// @route   GET /api/events/interested
// @access  Private
const getInterestedEvents = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const events = await Event.find({ interested: userId })
    .populate('user_id', 'name avatar username')
    .populate('likes', '_id')
    .populate('interested', '_id')
    .populate('comments.user_id', 'name avatar username');

  res.status(200).json({
    message: 'Interested events retrieved successfully',
    data: events,
  });
});

// @desc    GET users interested in authored events
// @route   GET /api/events/authored/interested
// @access  Private

const getUsersInterestedInMyEvents = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const events = await Event.find({ user_id: userId })
    .populate('user_id', 'name avatar username _id')
    .populate('interested', 'name avatar username _id email firstname lastname');

  const result = events
    .map((event) => {
      // Validate event
      if (!event._id || !event.event_title || !event.user_id) {
        console.warn(`Invalid event skipped: ${JSON.stringify(event)}`);
        return null;
      }

      // Filter and validate interested users
      const validInterestedUsers = (event.interested || []).filter(
        (user) => user && user._id && user._id.toString() !== 'undefined' && user.username
      );
      if (event.interested.length !== validInterestedUsers.length) {
        
      }

      return {
        event,
        interestedUsers: validInterestedUsers.map((user) => ({
          _id: user._id.toString(), // Use _id to match User interface
          username: user.username || 'unknown',
          name: user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim() || user.username || 'Unknown',
          avatar: user.avatar || '',
          email: user.email || '',
          firstname: user.firstname || '',
          lastname: user.lastname || '',
        })),
      };
    })
    .filter((item) => item !== null); // Remove invalid events

  res.status(200).json({
    message: 'Interested users for authored events retrieved successfully',
    data: result,
  });
});


module.exports = {
  getAllEvents,
  getEventById,
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  interestedInEvent,
  likeEvent,
  commentOnEvent,
  shareEvent,
  likeComment,
  getUsersInterestedInMyEvents,
  getInterestedEvents
};
