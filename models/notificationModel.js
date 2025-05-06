// models/notificationModel.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Must match the model name in userModel.js
    required: true,
    index: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Must match the model name in userModel.js
    required: true,
  },
  type: {
    type: String,
    enum: [
      'post_like',
      'post_comment',
      'post_comment_mention',
      'event_like',
      'event_comment',
      'event_interested',
      'event_comment_mention',
      'product_like',
      'product_comment',
      'product_comment_mention',
      'comment_like',
      'new_message',
    ],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: false,
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: false,
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false,
  },
  comment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    required: false,
  },
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: false,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: { expires: '30d' },
  },
});

module.exports = mongoose.model('Notification', notificationSchema);