const asyncHandler = require('express-async-handler');
const Notification = require('../models/notificationModel');
const { logActivity } = require('../utils/activityLogger');

// @desc    Create a notification
// @route   POST /api/notifications
// @access  Private
const createNotification = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('No user ID found in request');
    res.status(401);
    throw new Error('Not authorized, user not found');
  }

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

  // Log activity only for specific notification types to avoid redundant logging
  const loggableTypes = ['follow', 'message']; // Types not triggered by other controllers
  if (loggableTypes.includes(type)) {
    await logActivity(req.user.id, `create_notification_${type}`, notification._id, 'Notification', {
      notification_type: type,
      recipient_id: recipient,
    });
  }

  const io = req.app.get('io');
  if (io) {
    io.to(`user:${recipient}`).emit(`notification:user:${recipient}`, formattedNotification);
    console.log(`Emitted notification to user:${recipient}`);
  } else {
    console.warn('Socket.IO not initialized');
  }

  res.status(201).json({ message: 'Notification created', data: formattedNotification });
});

// @desc    Get notifications for a user
// @route   GET /api/notifications
// @access  Private
const getNotifications = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('No user ID found in request');
    res.status(401);
    throw new Error('Not authorized, user not found');
  }

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

  // Log activity
  await logActivity(req.user.id, 'view_notifications', null, null, {
    action: 'view_notifications',
    notifications_count: notifications.length,
    unread_only: unread === 'true',
  });

  res.status(200).json({
    message: 'Notifications retrieved successfully',
    data: notifications,
  });
});

// @desc    Mark a notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markNotificationAsRead = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('No user ID found in request');
    res.status(401);
    throw new Error('Not authorized, user not found');
  }

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

  // Log activity
  await logActivity(req.user.id, 'mark_notification_read', notification._id, 'Notification', {
    notification_type: notification.type,
  });

  res.status(200).json({
    message: 'Notification marked as read',
    data: notification,
  });
});

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('No user ID found in request');
    res.status(401);
    throw new Error('Not authorized, user not found');
  }

  const updateResult = await Notification.updateMany(
    { recipient: req.user.id, isRead: false },
    { $set: { isRead: true } }
  );

  // Log activity
  await logActivity(req.user.id, 'mark_all_notifications_read', null, null, {
    action: 'mark_all_notifications_read',
    modified_count: updateResult.modifiedCount,
  });

  res.status(200).json({
    message: 'All notifications marked as read',
  });
});

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('No user ID found in request');
    res.status(401);
    throw new Error('Not authorized, user not found');
  }

  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  if (notification.recipient.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to delete this notification');
  }

  // Log activity
  await logActivity(req.user.id, 'delete_notification', notification._id, 'Notification', {
    notification_type: notification.type,
  });

  await notification.deleteOne();

  res.status(200).json({
    message: 'Notification deleted successfully',
  });
});

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    console.error('No user ID found in request');
    res.status(401);
    throw new Error('Not authorized, user not found');
  }

  const count = await Notification.countDocuments({
    recipient: req.user.id,
    isRead: false,
  });

  // Log activity
  await logActivity(req.user.id, 'view_unread_notification_count', null, null, {
    action: 'view_unread_notification_count',
    unread_count: count,
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