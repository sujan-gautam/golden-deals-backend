const mongoose = require('mongoose');
const bcrypt = require('bcrypt');


const userSchema = mongoose.Schema({
  username: {
    type: String,
    required: [false, "Please enter your username"], // Optional field, no error if missing
    unique: true,
  },
  email: {
    type: String,
    required: [true, "Please enter your email"], // Fixed message to "email"
    unique: true,
  },
  firstname: {
    type: String,
    required: [true, "Please enter your firstname"],
  },
  lastname: {
    type: String,
    required: [false, "Please enter your lastname"], // Optional field
  },
  password: {
    type: String,
    required: [false, 'Please enter a valid password'],
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true, // Allows null values while maintaining uniqueness
  },
  avatar: {
    type: String,
    default: null, // Matches postController expectation
  },
  location: {
    type: String,
    default: null,
  },
  website: {
    type: String,
    required: false, // No required message needed since it's optional
  },
  bio: {
    type: String,
    required: false, // No required message needed since it's optional
  },
}, {
  timestamps: true,
});
userSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});
// Register the model with name 'User' (capitalized to match ref in other models)
const User = mongoose.model('User', userSchema);

module.exports = User;
