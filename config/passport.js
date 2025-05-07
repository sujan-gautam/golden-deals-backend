const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userModel');

module.exports = function configurePassport() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.API_URL}/auth/google/callback`,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            user = await User.findOne({ email: profile.emails[0].value });

            if (user) {
              user.googleId = profile.id;
              await user.save();
            } else {
              user = await User.create({
                googleId: profile.id,
                email: profile.emails[0].value,
                username: profile.displayName.replace(/\s/g, '').toLowerCase(),
                firstname: profile.name.givenName || 'User',
                lastname: profile.name.familyName || '',
                avatar: profile.photos[0].value,
              });
            }
          }

          return done(null, user);
        } catch (error) {
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
      done(error, null);
    }
  });
};
