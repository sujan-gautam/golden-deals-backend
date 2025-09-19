// models/storiesModel.js
const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  image: {
    filename: String,
    path: String,
    mimetype: String,
  },
  text: { type: String, default: '' }, // Check for maxlength here
  textColor: { type: String, default: '#ffffff' },
  views: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  __v: { type: Number },
});

module.exports = mongoose.model('Story', storySchema);