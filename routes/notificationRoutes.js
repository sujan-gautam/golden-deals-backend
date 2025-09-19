// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getUnreadCount,
} = require('../controllers/notificationController');
const  verifyToken  = require('../middleware/verifyTokenHandler'); // Same auth middleware as others

router.use(verifyToken); // Protect all routes

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/:id/read', markNotificationAsRead);
router.patch('/read-all', markAllNotificationsAsRead);
router.delete('/:id', deleteNotification);

module.exports = router;