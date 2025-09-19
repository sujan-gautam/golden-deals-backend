// models/productModel.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Likes for comments
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null }, // Support replies
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Users mentioned in the comment
});

const productSchema = mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  title: {
    type: String,
    required: [true, 'Product name is required'],
  },
  description: {
    type: String,
    default: '',
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
  },
  category: {
    type: String,
    default: '',
  },
  condition: {
    type: String,
    enum: ['new', 'likenew', 'good', 'fair', 'poor'],
    default: 'new',
  },
  status: {
    type: String,
    enum: ['instock', 'lowstock', 'soldout'],
    default: 'instock',
  },
  image: {
    filename: String,
    path: String,
    mimetype: String,
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

module.exports = mongoose.model('Product', productSchema);