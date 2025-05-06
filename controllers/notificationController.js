const asyncHandler = require('express-async-handler');
const Notification = require('../models/notificationModel');

const createNotification = asyncHandler(async (req, res) => {
  const { recipient, sender, type, content, product } = req.body;

  if (!recipient || !sender || !type || !content) {
    res.status(400);
    throw new Error('Missing required fields');
  }

  const notification = await Notification.create({
    recipient,
    sender,
    type,
    content,
    product: product || null,
    isRead: false,
  });

  await notification.populate('sender', 'username avatar');
  await notification.populate('product', 'title');
  await notification.populate('conversation', 'participants');

  const formattedNotification = {
    _id: notification._id,
    recipient: notification.recipient,
    sender: notification.sender,
    type: notification.type,
    content: notification.content,
    product: notification.product,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
  };

  const io = req.app.get('io');
  if (io) {
    io.to(`user:${recipient}`).emit(`notification:user:${recipient}`, formattedNotification);
    console.log(`Emitted notification to user:${recipient}`);
  } else {
    console.warn('Socket.IO not initialized');
  }

  res.status(201).json({ message: 'Notification created', data: formattedNotification });
});

// Other controllers remain unchanged
const getNotifications = asyncHandler(async (req, res) => {
  const { unread } = req.query;
  const query = { recipient: req.user.id };
  if (unread === 'true') {
    query.isRead = false;
  }

  const notifications = await Notification.find(query)
    .populate('sender', 'username avatar')
    .populate('post', 'content')
    .populate('event', 'event_title')
    .populate('product', 'title')
    .populate('conversation', 'participants')
    .sort({ createdAt: -1 })
    .limit(50);

  res.status(200).json({
    message: 'Notifications retrieved successfully',
    data: notifications,
  });
});

const markNotificationAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  if (notification.recipient.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to mark this notification as read');
  }

  notification.isRead = true;
  await notification.save();

  res.status(200).json({
    message: 'Notification marked as read',
    data: notification,
  });
});

const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user.id, isRead: false },
    { $set: { isRead: true } }
  );

  res.status(200).json({
    message: 'All notifications marked as read',
  });
});

const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  if (notification.recipient.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to delete this notification');
  }

  await notification.deleteOne();

  res.status(200).json({
    message: 'Notification deleted successfully',
  });
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    recipient: req.user.id,
    isRead: false,
  });

  res.status(200).json({
    message: 'Unread notification count retrieved',
    data: { count },
  });
});

module.exports = {
  createNotification,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getUnreadCount,
};