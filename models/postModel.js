// models/postModel.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Add likes for comments
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null }, // Support replies
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Users mentioned in the comment
});

const postSchema = mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
  },
  image: {
    type: {
      filename: String,
      path: String,
      mimetype: String,
    },
    required: false,
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  comments: [commentSchema],
  shares: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Post', postSchema);