const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
});

const eventSchema = mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  event_title: {
    type: String,
    required: [true, 'Event title is required'],
  },
  event_details: {
    type: String,
    required: [true, 'Event details are required'],
  },
  event_date: {
    type: Date,
    required: [true, 'Event date is required'],
  },
  event_location: {
    type: String,
    required: [true, 'Event location is required'],
  },
  image: {
    filename: String,
    path: String,
    mimetype: String,
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: [],
  }],
  interested: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: [],
  }],
  comments: [commentSchema],
  shares: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

// Validate ObjectIDs before saving
eventSchema.pre('save', function (next) {
  // Validate interested array
  if (this.interested) {
    this.interested = this.interested.filter(id => mongoose.isValidObjectId(id));
  }
  // Validate likes array
  if (this.likes) {
    this.likes = this.likes.filter(id => mongoose.isValidObjectId(id));
  }
  // Validate comments array
  if (this.comments) {
    this.comments.forEach(comment => {
      if (!mongoose.isValidObjectId(comment.user_id)) {
        throw new Error(`Invalid user_id in comment: ${comment.user_id}`);
      }
      if (comment.likes) {
        comment.likes = comment.likes.filter(id => mongoose.isValidObjectId(id));
      }
      if (comment.mentions) {
        comment.mentions = comment.mentions.filter(id => mongoose.isValidObjectId(id));
      }
      if (comment.parentId && !mongoose.isValidObjectId(comment.parentId)) {
        comment.parentId = null;
      }
    });
  }
  next();
});

module.exports = mongoose.model('Event', eventSchema);