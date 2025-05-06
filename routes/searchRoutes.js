const express = require('express');
const router = express.Router();
const { searchAll, advancedSearch } = require('../controllers/searchController');
const verifyToken = require('../middleware/verifyTokenHandler');

// Apply verifyToken middleware to all search routes
router.use(verifyToken);

// Basic search route
router.route('/')
  .get(searchAll); // GET /api/search?q=:query

// Advanced search route
router.route('/advanced')
  .post(advancedSearch); // POST /api/search/advanced

module.exports = router;