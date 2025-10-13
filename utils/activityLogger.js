const Activity = require('../models/activityModel');

const logActivity = async (userId, action, targetId = null, targetType = null, metadata = {}) => {
  try {
    await Activity.create({
      user_id: userId,
      action,
      target_id: targetId,
      target_type: targetType,
      metadata,
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

module.exports = { logActivity };