const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  action: {
    type: String,
    required: true,
    enum: [
      'view_event', 'create_event', 'update_event', 'delete_event', 'like_event', 'unlike_event', 'comment_event', 'like_comment_event', 'unlike_comment_event', 'interest_event', 'uninterest_event', 'share_event',
      'view_post', 'create_post', 'update_post', 'delete_post', 'like_post', 'unlike_post', 'comment_post', 'like_comment_post', 'unlike_comment_post', 'share_post',
      'view_product', 'create_product', 'update_product', 'delete_product', 'like_product', 'unlike_product', 'comment_product', 'like_comment_product', 'unlike_comment_product', 'share_product',
      'send_message', 'view_messages', 'create_conversation', 'view_conversations', 'mark_messages_read', 'delete_message', 'react_message', 'search_messages', 'pin_message', 'unpin_message',
    ],
  },
  target_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: false, // Optional, as some actions (e.g., view_all) may not have a specific target
  },
  target_type: {
    type: String,
    enum: ['Event', 'Post', 'Product', 'Comment', 'Conversation', 'Message', null],
    required: false,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // Flexible field for additional data (e.g., comment content, emoji, etc.)
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Activity', activitySchema);