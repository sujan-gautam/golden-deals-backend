const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');

const router = express.Router();

// Initiate Google OAuth
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

// Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/signin' }),
  asyncHandler(async (req, res) => {
    const user = req.user;

    // Generate JWT
    const accessToken = jwt.sign(
      {
        user: {
          username: user.username,
          firstname: user.firstname,
          lastname: user.lastname,
          id: user.id,
        },
      },
      process.env.SECRECT_KEY, // Make sure your env variable is correct
      { expiresIn: '7d' }
    );

    // Ensure the frontend URL is correct
    const frontendURL = process.env.FRONTEND_APP_URL ;
    res.redirect(`${frontendURL}/auth/google/callback?token=${accessToken}`);
  })
);

module.exports = router;
