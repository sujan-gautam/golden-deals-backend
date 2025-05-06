// routes/postRoutes.js
const express = require('express');
const router = express.Router();
const { 
  getAllPosts, 
  getPosts, 
  getPostById,
  createPost, 
  updatePost, 
  likePost,
  deletePost,
  sharePost,
  commentOnPost,
  likeComment,
} = require('../controllers/postController');
const verifyToken = require('../middleware/verifyTokenHandler');
const upload = require('../config/multerPosts');

// Apply verifyToken middleware to all routes
router.use(verifyToken);

// Routes for getting all posts and user-specific posts
router.route('/all')
  .get(getAllPosts);

router.route('/:id')
  .get(getPostById);
  
router.route('/')
  .get(getPosts)
  .post(upload.single('image'), createPost);

router.route('/:id/share') // Share post (new route)
  .post(sharePost);

router.route('/:id/like') // Add this route
  .post(likePost);

router.route('/:id')
  .put(upload.single('image'), updatePost)
  .delete(deletePost);

router.route('/:id/comment').post( commentOnPost);
  
router.route('/:postId/comments/:commentId/like').post(likeComment); 

module.exports = router;