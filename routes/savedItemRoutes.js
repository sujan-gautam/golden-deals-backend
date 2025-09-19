const express = require('express');
const router = express.Router();
const { saveItem, unsaveItem, getSavedItems } = require('../controllers/savedItemController');
const verifyToken = require('../middleware/verifyTokenHandler');

// Apply verifyToken middleware to all routes
router.use(verifyToken);

// Routes for saved items
router.route('/')
  .get(getSavedItems)
  .post(saveItem);

router.route('/:id')
  .delete(unsaveItem);

module.exports = router;