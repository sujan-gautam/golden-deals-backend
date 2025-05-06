const express = require('express');
const router = express.Router();
const {
  getAllStories,
  createStory,
  editStory,
  deleteStory,
  viewStory,
} = require('../controllers/storiesController');
const verifyToken = require('../middleware/verifyTokenHandler');
const upload = require('../config/multerStories');

router.use(verifyToken);

router.route('/all').get(getAllStories);
router.route('/').post(upload.single('image'), createStory);
router
  .route('/:id')
  .put(upload.single('image'), editStory) // Add multer to handle FormData
  .delete(deleteStory);
router.route('/:id/view').get(viewStory);

module.exports = router;