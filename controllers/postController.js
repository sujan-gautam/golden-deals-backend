const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Post = require('../models/postModel');
const Notification = require('../models/notificationModel');

// @desc    GET all posts
// @route   GET /api/posts/all
// @access  Private
const getAllPosts = asyncHandler(async (req, res) => {
  const posts = await Post.find()
  .populate('user_id', 'name avatar username') 
    .populate('comments.user_id', 'name avatar'); 
  if (posts.length === 0) {
    return res.status(404).json({ message: "No posts found." });
  }
  res.status(200).json(posts);
});

// @desc    GET all posts of a user
// @route   GET /api/posts
// @access  Private
const getPosts = asyncHandler(async (req, res) => {
  const posts = await Post.find({ user_id: req.user.id })
    .populate('user_id', 'name avatar')
    .populate('comments.user_id', 'name avatar');
  if (posts.length === 0) {
    return res.status(404).json({ message: "No posts found." });
  }
  res.status(200).json(posts);
});

// @desc    ADD new post with optional image
// @route   POST /api/posts
// @access  Private
const createPost = asyncHandler(async (req, res) => {
  const user_id = req.user.id;


  let content;
  if (req.is('multipart/form-data') || req.is('application/json')) {
    content = req.body.content;
  } else {
    return res.status(400).json({ message: "Unsupported Content-Type. Use application/json or multipart/form-data." });
  }

  if (!content) {
    return res.status(400).json({ message: "Content is required!" });
  }

  const postData = {
    user_id,
    content,
  };

  if (req.file) {
    postData.image = {
      filename: req.file.filename,
      path: `/storage/posts-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const post = await Post.create(postData);
  const populatedPost = await Post.findById(post._id)
  .populate('user_id', 'name avatar username') // Add username
    .populate('comments.user_id', 'name avatar');

  res.status(201).json({
    message: "Post added successfully!",
    data: populatedPost,
  });
});

// @desc    GET a single post by ID
// @route   GET /api/posts/:id
// @access  Private
const getPostById = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    console.log(`Post not found for ID: ${req.params.id}`);
    return res.status(404).json({ message: "Post not found" });
  }


  const populatedPost = await Post.findById(req.params.id)
    .populate('user_id', 'name avatar username')
    .populate('comments.user_id', 'name avatar username'); // Add username


  res.status(200).json({
    message: "Post retrieved successfully",
    data: populatedPost,
  });
});

// @desc    UPDATE post with optional image
// @route   PUT /api/posts/:id
// @access  Private
const updatePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  if (post.user_id.toString() !== req.user.id) {
    return res.status(403).json({ message: "Not authorized to update this post" });
  }

  const updateData = { content: req.body.content || post.content };

  if (req.file) {
    updateData.image = {
      filename: req.file.filename,
      path: `/storage/posts-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const updated = await Post.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true }
  ).populate('user_id', 'name avatar')
   .populate('comments.user_id', 'name avatar');

  res.status(200).json({
    message: "Post updated successfully",
    data: updated,
  });
});

// @desc    DELETE post
// @route   DELETE /api/posts/:id
// @access  Private
const deletePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  if (post.user_id.toString() !== req.user.id) {
    return res.status(403).json({ message: "Not authorized to delete this post" });
  }

  await post.deleteOne();

  res.status(200).json({ message: "Post deleted successfully" });
});

// @desc    Like a post
// @route   POST /api/posts/:id/like
// @access  Private
const likePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({ message: 'Post not found' });
  }

  const userId = req.user.id;
  const isLiked = post.likes.includes(userId);

  if (isLiked) {
    post.likes = post.likes.filter((id) => id.toString() !== userId);
  } else {
    post.likes.push(userId);
  }

  await post.save();
  const populatedPost = await Post.findById(post._id)
    .populate('user_id', 'name avatar username')
    .populate('comments.user_id', 'name avatar username');

  // Create notification if liking (not unliking) and not the user's own post
  if (!isLiked && post.user_id.toString() !== userId) {
    await Notification.create({
      recipient: post.user_id,
      sender: userId,
      type: 'post_like',
      post: post._id,
      content: `${req.user.username || 'A user'} liked your post.`,
    });
  }

  res.status(200).json({
    message: isLiked ? 'Post unliked' : 'Post liked',
    data: populatedPost,
  });
});


// @desc    Comment on a post
// @route   POST /api/posts/:id/comment
// @access  Private
// postController.js
const commentOnPost = asyncHandler(async (req, res) => {
  const { content, parentId, mentions } = req.body;
  if (!content) {
    return res.status(400).json({ message: 'Comment content is required' });
  }

  const post = await Post.findById(req.params.id);
  if (!post) {
    return res.status(404).json({ message: 'Post not found' });
  }

  const comment = {
    _id: new mongoose.Types.ObjectId(), // Explicitly generate _id
    user_id: req.user.id,
    content,
    parentId: parentId || null,
    mentions: mentions || [],
    createdAt: new Date(),
    likes: [],
  };

  post.comments.push(comment);
  await post.save();

  // Create notification for post owner (if not the commenter)
  if (post.user_id.toString() !== req.user.id) {
    await Notification.create({
      recipient: post.user_id,
      sender: req.user.id,
      type: 'post_comment',
      post: post._id,
      comment: comment._id,
      content: `${req.user.username || 'A user'} commented on your post.`,
    });
  }

  // Create notifications for mentioned users
  if (mentions && mentions.length > 0) {
    for (const username of mentions) {
      const mentionedUser = await User.findOne({ username });
      if (
        mentionedUser &&
        mentionedUser._id.toString() !== req.user.id &&
        mentionedUser._id.toString() !== post.user_id.toString()
      ) {
        await Notification.create({
          recipient: mentionedUser._id,
          sender: req.user.id,
          type: 'post_comment_mention',
          post: post._id,
          comment: comment._id,
          content: `${req.user.username || 'A user'} mentioned you in a comment on a post.`,
        });
      }
    }
  }

  // Fetch the populated post
  const updatedPost = await Post.findById(req.params.id)
    .populate('comments.user_id', 'name avatar username');
  
  const newComment = updatedPost.comments.find((c) => c._id.toString() === comment._id.toString());

  res.status(201).json({ message: 'Comment added successfully', data: newComment });
});


// @desc    Like a comment on a post
// @route   POST /api/posts/:postId/comments/:commentId/like
// @access  Private
const likeComment = asyncHandler(async (req, res) => {
  const { postId, commentId } = req.params;
  const userId = req.user.id;


  if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
    console.log('Invalid postId or commentId:', { postId, commentId });
    return res.status(400).json({ message: 'Invalid post or comment ID' });
  }

  const post = await Post.findById(postId);
  if (!post) {
    console.log('Post not found:', postId);
    return res.status(404).json({ message: 'Post not found' });
  }

  const comment = post.comments.id(commentId);
  if (!comment) {
    console.log('Comment not found:', commentId);
    return res.status(404).json({ message: 'Comment not found' });
  }

  if (!Array.isArray(comment.likes)) {
    comment.likes = [];
  }

  const isLiked = comment.likes.includes(userId);

  if (isLiked) {
    comment.likes = comment.likes.filter((id) => id.toString() !== userId);
  } else {
    comment.likes.push(userId);
  }

  await post.save();

  // Create notification if liking (not unliking) and not the user's own comment
  if (!isLiked && comment.user_id.toString() !== userId) {
    await Notification.create({
      recipient: comment.user_id,
      sender: userId,
      type: 'comment_like',
      post: post._id,
      comment: commentId,
      content: `${req.user.username || 'A user'} liked your comment on a post.`,
    });
  }

  const updatedPost = await Post.findById(postId)
    .populate('comments.user_id', 'name avatar username');
  const updatedComment = updatedPost.comments.id(commentId);

  res.status(200).json({
    message: isLiked ? 'Comment unliked' : 'Comment liked',
    data: updatedComment,
  });
});


// @desc    Share a post (increment shares count)
// @route   POST /api/posts/:id/share
// @access  Private
const sharePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  // Increment the shares count 
  post.shares = (post.shares || 0) + 1;
  await post.save();

  const populatedPost = await Post.findById(post._id).populate('user_id', 'name avatar username');
  res.status(200).json({
    message: "Post shared successfully",
    data: populatedPost,
  });
});

module.exports = {
  getAllPosts,
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  likePost,
  commentOnPost,
  sharePost,
  likeComment,
};
