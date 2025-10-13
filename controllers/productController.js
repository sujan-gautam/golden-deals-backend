const express = require('express');
const asyncHandler = require('express-async-handler');
const Product = require('../models/productModel');
const User = require('../models/userModel');
const upload = require('../config/multerProducts'); // Use the new products Multer config
const path = require('path');
const mongoose = require('mongoose');
const Notification = require('../models/notificationModel');
const { logActivity } = require('../utils/activityLogger');

// Helper function for error handling
const handleError = (res, error) => {
  console.error('Error:', error);
  res.status(500).json({ message: 'Server error', error: error.message });
};

// @desc    GET all products
// @route   GET /api/products/all
// @access  Private
const getAllProducts = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const query = userId ? { user_id: userId } : {};
    const products = await Product.find(query)
      .populate('user_id', 'firstname lastname avatar')
      .lean();

    // Log activity only if user is authenticated
    if (req.user && req.user.id) {
      await logActivity(req.user.id, 'view_product', null, null, {
        action: userId ? 'view_user_products' : 'view_all_products',
        user_id_filter: userId || null,
      });
    }

    res.status(200).json({ data: products });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    GET all products of a user
// @route   GET /api/products
// @access  Private
const getProducts = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Unauthorized: No user authenticated' });
  }

  const products = await Product.find({ user_id: req.user.id });

  if (products.length === 0) {
    return res.status(404).json({ message: 'No products found.' });
  }

  await logActivity(req.user.id, 'view_product', null, null, { action: 'view_user_products' });
  res.status(200).json(products);
});

// @desc    ADD new product with optional image
// @route   POST /api/products
// @access  Private
const createProduct = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Unauthorized: No user authenticated' });
  }

  const user_id = req.user.id;
  const { title, description, price, category, condition, status } = req.body;

  if (!title || !price) {
    return res.status(400).json({ message: 'Product name and price are mandatory!' });
  }

  const productData = {
    user_id,
    title,
    description: description || '',
    price: parseFloat(price),
    category: category || '',
    condition: condition || 'new',
    status: status || 'instock',
  };

  if (req.file) {
    productData.image = {
      filename: req.file.filename,
      path: `/storage/products-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const product = await Product.create(productData);

  await logActivity(user_id, 'create_product', product._id, 'Product', {
    title,
    has_image: !!req.file,
    price,
  });

  res.status(201).json({
    message: 'Product added successfully!',
    data: product,
  });
});

// @desc    UPDATE product with optional image
// @route   PUT /api/products/:id
// @access  Private
const updateProduct = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Unauthorized: No user authenticated' });
  }

  const product = await Product.findById(req.params.id).populate('user_id', 'name avatar username');

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const productUserId = product.user_id._id.toString();
  const requestingUserId = req.user.id.toString();

  if (productUserId !== requestingUserId) {
    return res.status(403).json({ message: 'Not authorized to update this product' });
  }

  const updateData = { ...req.body };

  if (req.file) {
    updateData.image = {
      filename: req.file.filename,
      path: `/storage/products-pictures/${req.file.filename}`,
      mimetype: req.file.mimetype,
    };
  }

  const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });

  await logActivity(req.user.id, 'update_product', product._id, 'Product', {
    title: updateData.title || product.title,
    has_image_updated: !!req.file,
    price: updateData.price || product.price,
  });

  res.status(200).json({
    message: 'Product updated successfully',
    data: updated,
  });
});

// @desc    DELETE product
// @route   DELETE /api/products/:id
// @access  Private
const deleteProduct = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Unauthorized: No user authenticated' });
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  if (product.user_id.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized to delete this product' });
  }

  await logActivity(req.user.id, 'delete_product', product._id, 'Product', {
    title: product.title,
  });

  await Product.findByIdAndDelete(req.params.id);

  res.status(200).json({ message: 'Product deleted successfully' });
});

// @desc    GET product image
// @route   GET /api/products/image/:filename
// @access  Public
const getProductImage = asyncHandler(async (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../storage/products-pictures', filename);

  // Log activity only if user is authenticated
  if (req.user && req.user.id) {
    await logActivity(req.user.id, 'view_product_image', null, null, {
      action: 'view_product_image',
      filename,
    });
  }

  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ message: 'Image not found' });
    }
  });
});

// @desc    Like a product
// @route   POST /api/products/:id/like
// @access  Private
const likeProduct = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Unauthorized: No user authenticated' });
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const userId = req.user.id;
  const isLiked = product.likes.includes(userId);

  if (isLiked) {
    product.likes = product.likes.filter((id) => id.toString() !== userId);
    await logActivity(userId, 'unlike_product', product._id, 'Product', {
      title: product.title,
    });
  } else {
    product.likes.push(userId);
    await logActivity(userId, 'like_product', product._id, 'Product', {
      title: product.title,
    });
  }

  await product.save();
  const populatedProduct = await Product.findById(product._id).populate('user_id', 'name avatar username');

  // Create notification if liking (not unliking) and not the user's own product
  if (!isLiked && product.user_id.toString() !== userId) {
    await Notification.create({
      recipient: product.user_id,
      sender: userId,
      type: 'product_like',
      product: product._id,
      content: `${req.user.username || 'A user'} liked your product "${product.title}".`,
    });
  }

  res.status(200).json({
    message: isLiked ? 'Product unliked' : 'Product liked',
    data: populatedProduct,
  });
});

// @desc    Share a product (increment shares count)
// @route   POST /api/products/:id/share
// @access  Private
const shareProduct = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Unauthorized: No user authenticated' });
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  product.shares = (product.shares || 0) + 1;
  await product.save();

  await logActivity(req.user.id, 'share_product', product._id, 'Product', {
    title: product.title,
  });

  const populatedProduct = await Product.findById(product._id).populate('user_id', 'name avatar username');

  res.status(200).json({
    message: 'Product shared successfully',
    data: populatedProduct,
  });
});

// @desc    Comment or reply on a product
// @route   POST /api/products/:id/comment
// @access  Private
const commentOnProduct = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Unauthorized: No user authenticated' });
  }

  const { content, parentId, mentions } = req.body;

  // Validate content
  if (!content || !content.trim()) {
    return res.status(400).json({ message: 'Comment content is required' });
  }

  // Validate product ID
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid product ID' });
  }

  // Validate product existence
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  // Process mentions: ensure they’re valid usernames
  let mentionIds = [];
  if (mentions && Array.isArray(mentions)) {
    const mentionedUsers = await User.find({ username: { $in: mentions } }).select('_id username');
    console.log('Found mentioned users:', mentionedUsers);

    if (mentionedUsers.length !== mentions.length) {
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
    parentComment = product.comments.id(parentId);
    if (!parentComment) {
      return res.status(404).json({ message: 'Parent comment not found' });
    }
  }

  // Create new comment
  const comment = {
    _id: new mongoose.Types.ObjectId(),
    user_id: req.user.id,
    content: content.trim(),
    parentId: parentId && mongoose.isValidObjectId(parentId) ? parentId : null,
    mentions: mentionIds,
    createdAt: new Date(),
    likes: [],
  };

  product.comments.push(comment);
  await product.save();

  await logActivity(req.user.id, 'comment_product', product._id, 'Product', {
    comment_id: comment._id,
    content_snippet: content.substring(0, 50),
    is_reply: !!parentId,
    mentions_count: mentionIds.length,
    title: product.title,
  });

  // Notify product owner
  if (product.user_id.toString() !== req.user.id) {
    await Notification.create({
      recipient: product.user_id,
      sender: req.user.id,
      type: 'product_comment',
      product: product._id,
      comment: comment._id,
      content: `${req.user.username || 'A user'} commented on your product "${product.title}".`,
    });
  }

  // Notify mentioned users
  if (mentionIds.length > 0) {
    for (const mentionedUserId of mentionIds) {
      const mentionedUser = await User.findById(mentionedUserId);
      if (
        mentionedUser &&
        mentionedUser._id.toString() !== req.user.id &&
        mentionedUser._id.toString() !== product.user_id.toString()
      ) {
        await Notification.create({
          recipient: mentionedUser._id,
          sender: req.user.id,
          type: 'product_comment_mention',
          product: product._id,
          comment: comment._id,
          content: `${req.user.username || 'A user'} mentioned you in a comment on "${product.title}".`,
        });
      }
    }
  }

  // Re-fetch with populated user + mentions
  const updatedProduct = await Product.findById(req.params.id).populate([
    { path: 'comments.user_id', select: 'name username avatar' },
    { path: 'comments.mentions', select: 'username' },
  ]);

  const newComment = updatedProduct.comments.find(
    (c) => c._id.toString() === comment._id.toString()
  );

  if (!newComment) {
    return res.status(500).json({ message: 'Failed to retrieve newly created comment' });
  }

  // Format response same as event/post controllers
  const formattedComment = {
    _id: newComment._id.toString(),
    postId: updatedProduct._id.toString(), // Keeping `postId` naming consistent
    userId: newComment.user_id._id.toString(),
    user: {
      _id: newComment.user_id._id.toString(),
      name: newComment.user_id.name || '',
      username: newComment.user_id.username || 'anonymous',
      avatar: newComment.user_id.avatar || '',
    },
    content: newComment.content,
    parentId: newComment.parentId ? newComment.parentId.toString() : null,
    mentions: Array.isArray(newComment.mentions)
      ? newComment.mentions.map((m) => (m.username ? m.username : m.toString()))
      : [],
    likes: newComment.likes.map((id) => id.toString()),
    createdAt: newComment.createdAt.toISOString(),
  };

  res.status(201).json({ message: 'Comment added successfully', data: formattedComment });
});

// @desc    Like a comment on a product
// @route   POST /api/products/:productId/comments/:commentId/like
// @access  Private
const likeComment = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Unauthorized: No user authenticated' });
  }

  const { productId, commentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(commentId)) {
    console.log('Invalid productId or commentId:', { productId, commentId });
    return res.status(400).json({ message: 'Invalid product or comment ID' });
  }

  const product = await Product.findById(productId);

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const comment = product.comments.id(commentId);
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }

  const userId = req.user.id;
  const isLiked = comment.likes.includes(userId);

  if (isLiked) {
    comment.likes = comment.likes.filter((id) => id.toString() !== userId);
    await logActivity(userId, 'unlike_comment_product', product._id, 'Product', {
      comment_id: commentId,
      title: product.title,
    });
  } else {
    comment.likes.push(userId);
    await logActivity(userId, 'like_comment_product', product._id, 'Product', {
      comment_id: commentId,
      title: product.title,
    });
  }

  await product.save();

  // Create notification if liking (not unliking) and not the user's own comment
  if (!isLiked && comment.user_id.toString() !== userId) {
    await Notification.create({
      recipient: comment.user_id,
      sender: userId,
      type: 'comment_like',
      product: product._id,
      comment: commentId,
      content: `${req.user.username || 'A user'} liked your comment on "${product.title}".`,
    });
  }

  const populatedProduct = await Product.findById(product._id)
    .populate('user_id', 'name avatar username')
    .populate('comments.user_id', 'name avatar username');

  const updatedComment = populatedProduct.comments.id(commentId);

  res.status(200).json({
    message: isLiked ? 'Comment unliked' : 'Comment liked',
    data: {
      _id: updatedComment._id,
      user_id: updatedComment.user_id,
      content: updatedComment.content,
      likes: updatedComment.likes.map((id) => id.toString()),
      createdAt: updatedComment.createdAt,
      parentId: updatedComment.parentId || null,
      mentions: Array.isArray(updatedComment.mentions)
        ? updatedComment.mentions.map((m) => (m.username ? m.username : m.toString()))
        : [],
    },
  });
});

// @desc    GET a single product by ID
// @route   GET /api/products/:id
// @access  Private
const getProductById = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Unauthorized: No user authenticated' });
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    console.log('Invalid product ID:', req.params.id);
    return res.status(400).json({ message: 'Invalid product ID' });
  }

  const product = await Product.findById(req.params.id)
    .populate('user_id', 'name avatar username')
    .populate('comments.user_id', 'name avatar username');

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  await logActivity(req.user.id, 'view_product', product._id, 'Product', {
    title: product.title,
  });

  res.status(200).json({
    message: 'Product retrieved successfully',
    data: product,
  });
});

module.exports = {
  getAllProducts,
  getProducts,
  createProduct: [upload.single('image'), createProduct],
  updateProduct: [upload.single('image'), updateProduct],
  deleteProduct,
  getProductImage,
  likeProduct,
  shareProduct,
  commentOnProduct,
  likeComment,
  getProductById,
};