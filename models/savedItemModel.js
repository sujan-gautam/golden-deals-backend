const mongoose = require('mongoose');

const savedItemSchema = mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  item_type: {
    type: String,
    required: true,
    enum: ['post', 'product', 'event'],
  },
  item_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    // Use dynamic refPath or explicit validation
    refPath: 'item_type',
  },
}, {
  timestamps: true,
});

// Validate item_type and item_id during save
savedItemSchema.pre('save', async function (next) {
  const validTypes = ['post', 'product', 'event'];
  if (!validTypes.includes(this.item_type)) {
    return next(new Error('Invalid item type'));
  }
  next();
});

module.exports = mongoose.model('SavedItem', savedItemSchema);