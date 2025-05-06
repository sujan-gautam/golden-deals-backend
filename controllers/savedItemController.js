const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const SavedItem = require('../models/savedItemModel');
const Post = require('../models/postModel');
const Product = require('../models/productModel');
const Event = require('../models/eventModel');

// @desc    Save an item (post, product, or event)
// @route   POST /api/saved-items
// @access  Private
const saveItem = asyncHandler(async (req, res) => {
  const { item_type, item_id } = req.body;

  // Validate user
  if (!req.user?.id) {
    console.error('No user ID found in request');
    return res.status(401).json({ message: 'Not authorized, user not found' });
  }
  const user_id = req.user.id;

  // Validate item_type
  if (!['post', 'product', 'event'].includes(item_type)) {
    return res.status(400).json({ message: 'Invalid item type' });
  }

  // Validate item_id
  if (!mongoose.Types.ObjectId.isValid(item_id)) {
    return res.status(400).json({ message: 'Invalid item ID' });
  }

  // Check if the item exists
  let item;
  if (item_type === 'post') {
    item = await Post.findById(item_id);
  } else if (item_type === 'product') {
    item = await Product.findById(item_id);
  } else if (item_type === 'event') {
    item = await Event.findById(item_id);
  }

  if (!item) {
    return res.status(404).json({ message: `${item_type.charAt(0).toUpperCase() + item_type.slice(1)} not found` });
  }

  // Check if already saved
  const existingSavedItem = await SavedItem.findOne({ user_id, item_type, item_id });
  if (existingSavedItem) {
    return res.status(400).json({ message: 'Item already saved' });
  }

  // Save the item
  const savedItem = await SavedItem.create({ user_id, item_type, item_id });

  // Manually populate item_id
  let populatedItem;
  try {
    const modelMap = {
      post: Post,
      product: Product,
      event: Event
    };
    const Model = modelMap[item_type];
    if (!Model) {
      console.error(`No model found for item_type: ${item_type}`);
      throw new Error('Invalid item type for population');
    }
    populatedItem = await SavedItem.findById(savedItem._id).populate({
      path: 'item_id',
      model: Model,
      populate: { path: 'user_id', select: 'name avatar username' }
    });
  } catch (popError) {
    console.error(`Error populating saved item ${savedItem._id}:`, popError);
    // Return without population if it fails
    populatedItem = savedItem;
  }

  res.status(201).json({
    message: 'Item saved successfully',
    data: populatedItem || savedItem
  });
});

// @desc    Unsave an item
// @route   DELETE /api/saved-items/:id
// @access  Private
const unsaveItem = asyncHandler(async (req, res) => {
  const savedItem = await SavedItem.findById(req.params.id);

  if (!savedItem) {
    return res.status(404).json({ message: 'Saved item not found' });
  }

  if (savedItem.user_id.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized to unsave this item' });
  }

  await savedItem.deleteOne();

  res.status(200).json({ message: 'Item unsaved successfully' });
});

// @desc    Get all saved items for a user
// @route   GET /api/saved-items
// @access  Private
const getSavedItems = asyncHandler(async (req, res) => {
  try {
    const savedItems = await SavedItem.find({ user_id: req.user.id });

    const formattedItems = await Promise.all(
      savedItems.map(async (savedItem) => {
        let item;
        try {
          const modelMap = {
            post: Post,
            product: Product,
            event: Event
          };
          const Model = modelMap[savedItem.item_type];
          if (!Model) {
            console.error(`Invalid item_type: ${savedItem.item_type}`);
            return null;
          }
          item = await Model.findById(savedItem.item_id)
            .populate('user_id', 'name avatar username')
            .lean();
          if (!item) {
            console.warn(`Item not found: ${savedItem.item_type} ${savedItem.item_id}`);
            return null;
          }
          return {
            _id: savedItem._id,
            item_type: savedItem.item_type,
            item,
            createdAt: savedItem.createdAt,
          };
        } catch (error) {
          console.error(`Error populating item ${savedItem.item_type} ${savedItem.item_id}:`, error);
          return null;
        }
      })
    );

    const validItems = formattedItems.filter(item => item !== null);

    res.status(200).json({
      message: 'Saved items retrieved successfully',
      data: validItems,
    });
  } catch (error) {
    console.error('Error fetching saved items:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = {
  saveItem,
  unsaveItem,
  getSavedItems,
};