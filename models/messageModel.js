// backend/models/messageModel.js
const mongoose = require('mongoose');

const messageSchema = mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    product: {
      _id: String,
      title: String,
      price: Number,
      image: String,
      condition: String,
      category: String,
    },
    event: {
      _id: String,
      title: String,
      date: String,
      location: String,
      image: String,
    },
    isAIResponse: {
      type: Boolean,
      default: false,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
    reactions: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        emoji: { type: String, required: true },
      },
    ],
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    pinnedBy: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Message', messageSchema);