// productController.js
const express = require('express');
const asyncHandler = require('express-async-handler');
const Product = require('../models/productModel');
const upload = require('../config/multerProducts'); // Use the new products Multer config
const path = require('path');
const mongoose = require('mongoose');
const Notification = require('../models/notificationModel');

// @desc    GET all products
// @route   GET /api/products/all
// @access  Private
const getAllProducts = async (req, res) => {
  try {
    const userId = req.params.userId;
    const query = userId ? { user_id: userId } : {};
    const products = await Product.find(query)
      .populate('user_id', 'firstname lastname avatar')
      .lean();
    res.status(200).json({ data: products });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    GET all products of a user
// @route   GET /api/products
// @access  Private
const getProducts = asyncHandler(async (req, res) => {
    const products = await Product.find({ user_id: req.user.id });

    if (products.length === 0) {
        return res.status(404).json({ message: "No products found." });
    }

    res.status(200).json(products);
});

// @desc    ADD new product with optional image
// @route   POST /api/products
// @access  Private
const createProduct = asyncHandler(async (req, res) => {
    const user_id = req.user.id;
    const { title, description, price, category, condition, status } = req.body;

    if (!title || !price) {
        return res.status(400).json({ message: "Product name and price are mandatory!" });
    }

    const productData = {
        user_id,
        title,
        description: description || '',
        price: parseFloat(price),
        category: category || '',
        condition: condition || 'new',
        status: status || 'instock'
    };

    // If an image was uploaded, add it to the product data
    if (req.file) {
        productData.image = {
            filename: req.file.filename,
            path: `/storage/products-pictures/${req.file.filename}`,
            mimetype: req.file.mimetype
        };
    }

    const product = await Product.create(productData);

    res.status(201).json({
        message: "Product added successfully!",
        data: product
    });
});

// @desc    UPDATE product with optional image
// @route   PUT /api/products/:id
// @access  Private
// controllers/productController.js
const updateProduct = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id).populate('user_id', 'name avatar username');
  
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
  
    // Ensure both are strings for comparison
    const productUserId = product.user_id._id.toString(); // From populated user_id
    const requestingUserId = req.user.id.toString();
  
    console.log('Product user_id:', productUserId); // Debug
    console.log('Requesting user_id:', requestingUserId); // Debug
  
    if (productUserId !== requestingUserId) {
      return res.status(403).json({ message: "Not authorized to update this product" });
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
  
    res.status(200).json({
      message: "Product updated successfully",
      data: updated,
    });
  });

// @desc    DELETE product
// @route   DELETE /api/products/:id
// @access  Private
const deleteProduct = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (!product) {
        return res.status(404).json({ message: "Product not found" });
    }

    if (product.user_id.toString() !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this product" });
    }

    // Use findByIdAndDelete instead of remove
    await Product.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: "Product deleted successfully" });
});

// @desc    GET product image
// @route   GET /api/products/image/:filename
// @access  Public
const getProductImage = asyncHandler(async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../storage/products-pictures', filename);
    
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).json({ message: "Image not found" });
        }
    });
});
// @desc    Like a product
// @route   POST /api/products/:id/like
// @access  Private
const likeProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const userId = req.user.id;
  const isLiked = product.likes.includes(userId);

  if (isLiked) {
    product.likes = product.likes.filter((id) => id.toString() !== userId);
  } else {
    product.likes.push(userId);
  }

  await product.save();
  const populatedProduct = await Product.findById(product._id)
    .populate('user_id', 'name avatar username');

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
    const product = await Product.findById(req.params.id);

    if (!product) {
        return res.status(404).json({ message: "Product not found" });
    }

    // Increment the shares count (default to 0 if undefined)
    product.shares = (product.shares || 0) + 1;
    await product.save();

    const populatedProduct = await Product.findById(product._id)
        .populate('user_id', 'name avatar username');

    res.status(200).json({
        message: "Product shared successfully",
        data: populatedProduct,
    });
});

// @desc    Comment or reply on a product
// @route   POST /api/products/:id/comment
// @access  Private
// productController.js
const commentOnProduct = asyncHandler(async (req, res) => {
  console.log('Request body:', req.body);
  console.log('User:', req.user);
  console.log('Product ID:', req.params.id);

  const { content, parentId, mentions } = req.body;
  if (!content) {
    return res.status(400).json({ message: 'Comment content is required' });
  }

  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
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

  product.comments.push(comment);
  await product.save();

  // Create notification for product owner (if not the commenter)
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

  // Create notifications for mentioned users
  if (mentions && mentions.length > 0) {
    for (const username of mentions) {
      const mentionedUser = await User.findOne({ username });
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

  // Fetch the populated product
  const updatedProduct = await Product.findById(req.params.id)
    .populate('comments.user_id', 'name avatar username');

  const newComment = updatedProduct.comments.find((c) => c._id.toString() === comment._id.toString());

  res.status(201).json({ message: 'Comment added successfully', data: newComment });
});

// @desc    Like a comment on a product
// @route   POST /api/products/:productId/comments/:commentId/like
// @access  Private
const likeComment = asyncHandler(async (req, res) => {
  const { productId, commentId } = req.params;
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
  } else {
    comment.likes.push(userId);
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
    data: updatedComment,
  });
});

// @desc    GET a single product by ID
// @route   GET /api/products/:id
// @access  Private
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('user_id', 'name avatar username')
    .populate('comments.user_id', 'name avatar username');

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

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