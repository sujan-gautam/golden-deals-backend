const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = mongoose.Schema({
  username: {
    type: String,
    required: [false, "Please enter your username"],
    unique: true,
  },
  email: {
    type: String,
    required: [true, "Please enter your email"],
    unique: true,
  },
  firstname: {
    type: String,
    required: [true, "Please enter your firstname"],
  },
  lastname: {
    type: String,
    required: [false, "Please enter your lastname"],
  },
  password: {
    type: String,
    required: [false, 'Please enter a valid password'],
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  avatar: {
    type: String,
    default: null,
  },
  location: {
    type: String,
    default: null,
  },
  website: {
    type: String,
    required: false,
  },
  bio: {
    type: String,
    required: false,
  },
  resetPasswordToken: {
    type: String,
    default: null,
  },
  resetPasswordExpires: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password && !this.password.startsWith('$2b$')) {
    console.log('Pre-save hook: Hashing password');
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    console.log('Pre-save hook: Hashed password:', this.password);
  } else {
    console.log('Pre-save hook: Skipping hashing (password already hashed or unchanged)');
  }
  next();
});
const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;
