// routes/feedRoutes.js
const express = require('express');
const router = express.Router();
const { getFeed } = require('../controllers/feedController');
const verifyToken = require('../middleware/verifyTokenHandler'); // Assuming this is your auth middleware

// Apply token verification to all feed routes
router.use(verifyToken);

// Feed route to get all posts, products, and events
router.route('/')
  .get(getFeed);

module.exports = router;