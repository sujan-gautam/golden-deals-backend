// routes/eventRoutes.js
const express = require('express');
const router = express.Router();
const { 
  getAllEvents, 
  getEvents, 
  getEventById,
  createEvent, 
  updateEvent, 
  deleteEvent,
  interestedInEvent,
  likeEvent,
  commentOnEvent,
  shareEvent,
  likeComment,
  getInterestedEvents,
  getUsersInterestedInMyEvents
} = require('../controllers/eventController');
const verifyToken = require('../middleware/verifyTokenHandler');
const upload = require('../config/multerEvents');


router.route('/all')
  .get(getAllEvents); 

router.use(verifyToken);


router.route('/')
  .get(getEvents)
  .post(upload.single('image'), createEvent);

router.route('/interested')
  .get(getInterestedEvents);

router.route('/:id')
  .get(getEventById)
  .put(upload.single('image'), updateEvent)
  .delete(deleteEvent);

router.route('/:id/interested')
  .post(interestedInEvent);

router.route('/:id/like')
  .post(likeEvent);

router.route('/:id/comment')
  .post(verifyToken, commentOnEvent);

router.route('/:id/share')
  .post(shareEvent);

router.route('/:eventId/comments/:commentId/like').post(likeComment);

router.route('/authored/interested')
  .get(getUsersInterestedInMyEvents);


module.exports = router;
