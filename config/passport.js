const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userModel');

module.exports = function configurePassport() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.API_URL}/api/auth/google/callback`,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            const email = profile.emails[0].value;
            user = await User.findOne({ email });

            if (user) {
              // Link Google account to existing user
              user.googleId = profile.id;
              user.firstname = user.firstname || profile.name.givenName || 'User';
              user.lastname = user.lastname || profile.name.familyName || '';
              user.avatar = user.avatar || profile.photos[0].value;
              user.lastLogin = new Date();
              await user.save();
            } else {
              // Create new user with unique username
              let username = profile.displayName.replace(/\s/g, '').toLowerCase();
              const usernameExists = await User.findOne({ username });
              if (usernameExists) {
                // Append random string to avoid duplicates
                username = `${username}_${Math.random().toString(36).substr(2, 5)}`;
              }

              user = await User.create({
                googleId: profile.id,
                email,
                username,
                firstname: profile.name.givenName || 'User',
                lastname: profile.name.familyName || '',
                avatar: profile.photos[0].value,
                lastLogin: new Date(),
              });
            }
          } else {
            // Update existing user
            user.firstname = user.firstname || profile.name.givenName || 'User';
            user.lastname = user.lastname || profile.name.familyName || '';
            user.avatar = user.avatar || profile.photos[0].value;
            user.lastLogin = new Date();
            await user.save();
          }

          return done(null, user);
        } catch (error) {
          console.error('Google Strategy error:', error);
          return done(error, null);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      console.error('Deserialize error:', error);
      done(error, null);
    }
  });
};
