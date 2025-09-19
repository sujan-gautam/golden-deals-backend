const express = require('express');
const router = express.Router();
const { feedAlgo, suggestContent } = require('../controllers/algorithmController');
const verifyToken = require('../middleware/verifyTokenHandler');middleware

router.post('/feed', verifyToken, feedAlgo);
router.post('/suggest-content', verifyToken, suggestContent);

module.exports = router;