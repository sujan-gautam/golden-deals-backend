// backend/middleware/verifyTokenHandler.js
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

const verifyToken = asyncHandler(async (req, res, next) => {
  let token;
  const authorizationHeader = req.headers.authorization || req.headers.Authorization;

  console.log('Authorization header received:', authorizationHeader);

  if (authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    token = authorizationHeader.split(' ')[1];
    console.log('Extracted token:', token);

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.SECRECT_KEY);
      console.log('Decoded token:', decoded);

      // Fetch user from database
      const user = await User.findById(decoded.user.id).select('+password');
      if (!user) {
        console.log('User not found for ID:', decoded.user.id);
        res.status(401);
        throw new Error('Token unauthorized: User not found');
      }

      req.user = user; // Set req.user to database user object
      console.log('req.user set:', { id: user._id, hasPassword: !!user.password });
      next();
    } catch (err) {
      console.error('Token verification failed:', err.name, err.message);
      res.status(401).json({ message: 'Token unauthorized' });
    }
  } else {
    console.log('No token provided');
    res.status(401).json({ message: 'No token provided' });
  }
});

module.exports = verifyToken;