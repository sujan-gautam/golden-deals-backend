const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Post = require('../models/postModel');
const Notification = require('../models/notificationModel');
const User = require('../models/userModel');

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
  console.log('Received request:', { content, parentId, mentions });

  // Validate comment content
  if (!content) {
    return res.status(400).json({ message: 'Comment content is required' });
  }

  // Validate post ID
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid post ID' });
  }

  // Find the post
  const post = await Post.findById(req.params.id);
  if (!post) {
    return res.status(404).json({ message: 'Post not found' });
  }

  // Process mentions: ensure they’re valid user IDs
  let mentionIds = [];
  if (mentions && Array.isArray(mentions)) {
    mentionIds = mentions.filter((id) => mongoose.isValidObjectId(id));
    console.log('Filtered mentionIds:', mentionIds);

    if (mentionIds.length !== mentions.length) {
      return res.status(400).json({ message: 'Invalid mention user IDs' });
    }

    const mentionedUsers = await User.find({ _id: { $in: mentionIds } }).select('_id username');
    console.log('Found mentioned users:', mentionedUsers);

    if (mentionedUsers.length !== mentionIds.length) {
      return res.status(400).json({ message: 'One or more mentioned users not found' });
    }

    mentionIds = mentionedUsers.map((user) => user._id.toString());
  }

  // Validate parent comment if provided
  let parentComment = null;
  if (parentId) {
    if (!mongoose.isValidObjectId(parentId)) {
      return res.status(400).json({ message: 'Invalid parent comment ID' });
    }
    parentComment = post.comments.id(parentId);
    if (!parentComment) {
      return res.status(404).json({ message: 'Parent comment not found' });
    }
  }

  // Create the comment object
  const comment = {
    _id: new mongoose.Types.ObjectId(),
    user_id: req.user.id,
    content,
    parentId: parentId && mongoose.isValidObjectId(parentId) ? parentId : null,
    mentions: mentionIds,
    createdAt: new Date(),
    likes: [],
  };

  // Add comment to post and save
  post.comments.push(comment);
  await post.save();
  console.log('Saved comment:', comment);

  // Notify post owner (if not the commenter)
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
  if (mentionIds.length > 0) {
    for (const mentionedUserId of mentionIds) {
      const mentionedUser = await User.findById(mentionedUserId);
      console.log('Mentioned user:', mentionedUser);

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

  // Populate user + mentions for response
  const updatedPost = await Post.findById(req.params.id).populate([
    { path: 'comments.user_id', select: 'name username avatar' },
    { path: 'comments.mentions', select: 'username' },
  ]);

  const newComment = updatedPost.comments.find(
    (c) => c._id.toString() === comment._id.toString()
  );
  if (!newComment) {
    return res.status(500).json({ message: 'Failed to retrieve newly created comment' });
  }

  // Format response to match frontend expectations
  const formattedComment = {
    _id: newComment._id.toString(),
    postId: updatedPost._id.toString(),
    userId: newComment.user_id._id.toString(),
    user: {
      _id: newComment.user_id._id.toString(),
      name: newComment.user_id.name || '',
      username: newComment.user_id.username || 'anonymous',
      avatar: newComment.user_id.avatar || '',
    },
    content: newComment.content,
    parentId: newComment.parentId ? newComment.parentId.toString() : null,
    mentions: newComment.mentions.map((m) => m.username || ''),
    likes: newComment.likes.map((id) => id.toString()),
    createdAt: newComment.createdAt.toISOString(),
  };

  console.log('Formatted comment:', formattedComment);

  res.status(201).json({ message: 'Comment added successfully', data: formattedComment });
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

  // Initialize likes array if undefined
  if (!Array.isArray(comment.likes)) {
    comment.likes = [];
  }

  const isLiked = comment.likes.some((id) => id.toString() === userId);

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

  // Populate user_id and mentions for the comment
  const updatedPost = await Post.findById(postId).populate([
    { path: 'comments.user_id', select: 'name avatar username' },
    { path: 'comments.mentions', select: 'username' },
  ]);
  const updatedComment = updatedPost.comments.id(commentId);

  res.status(200).json({
    message: isLiked ? 'Comment unliked' : 'Comment liked',
    data: {
      _id: updatedComment._id,
      user_id: updatedComment.user_id,
      content: updatedComment.content,
      likes: updatedComment.likes.map((id) => id.toString()),
      createdAt: updatedComment.createdAt,
      parentId: updatedComment.parentId || null,
      mentions: updatedComment.mentions.map((m) => m.username || ''),
    },
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
