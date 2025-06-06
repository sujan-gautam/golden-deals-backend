const express = require('express');
const asyncHandler = require('express-async-handler');
const Product = require('../models/productModel');
const Users = require('../models/userModel');
const Post = require('../models/postModel');
const Event = require('../models/eventModel');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


//@desc: Get All Users
//@api : API/USERS
//@method : get, private
const getUsers = asyncHandler(async (req, res) => {
  const users = await Users.find().select('username firstname lastname email');
  if (!users) {
    res.status(400).json({ message: "No users Found!" });
  }
  res.status(200).json(users);
});

//@desc: Get All Users
//@api : API/USERS
//@method : get, private
const getHomeUsers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const query = search
    ? {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { firstname: { $regex: search, $options: 'i' } },
          { lastname: { $regex: search, $options: 'i' } },
        ],
      }
    : {};
  const users = await Users.find(query).select('username firstname lastname avatar bio');
  if (!users.length) {
    res.status(400).json({ message: 'No users found!' });
  }
  res.status(200).json(users);
});

//@desc: Get Home User By ID
//@api : API/USERS/:id
//@method : get, private
const getHomeUserById = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }

  const user = await Users.findById(id).select('username firstname lastname avatar bio');;
  if (!user) {
    res.status(404);
    throw new Error('No user with this ID found!');
  }

  res.status(200).json(user);
});
//@desc: Get User By ID
//@api : API/USERS/:id
//@method : get, private
const getUserById = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }

  const user = await Users.findById(id);
  if (!user) {
    res.status(404);
    throw new Error('No user with this ID found!');
  }

  res.status(200).json(user);
});

//@desc: Create New User
//@api: API/USERS
//@method: post, private
const createUser = asyncHandler(async (req, res) => {
  const { username, firstname, lastname, email, password, confirm_password } = req.body;


  if (!username || !firstname || !lastname || !email || !password || !confirm_password) {
    console.log('Missing required fields');
    return res.status(400).json({ message: "All fields are mandatory!" });
  }

  if (password.startsWith('$2b$')) {
    return res.status(400).json({ message: "Password must be plaintext, not a hash." });
  }

  const normalizedEmail = email.toLowerCase();
  const registeredEmail = await Users.findOne({ email: normalizedEmail });
  const registeredUsername = await Users.findOne({ username });

  if (registeredUsername) {
    console.log('Username already taken:', username);
    return res.status(400).json({ message: "Username already used. Try another one!" });
  }
  if (registeredEmail) {
    console.log('Email already in use:', normalizedEmail);
    return res.status(400).json({ message: "Email already in use." });
  }
  if (password !== confirm_password) {
    console.log('Password mismatch');
    return res.status(400).json({ message: "Password should match!" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = new Users({
    username,
    firstname,
    lastname,
    email: normalizedEmail,
    password: hashedPassword,
  });

  await user.save();

  if (!user) {
    console.log('Failed to create user');
    return res.status(400).json({ message: "Can't create user!" });
  }

  res.status(201).json({
    _id: user._id,
    username: user.username,
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email,
  });
});
//@desc: Verify Token
//@api: API/USERS/VERIFY-TOKEN
//@method: get, private
const verifyLoginToken = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.SECRECT_KEY);
    const user = await Users.findById(decoded.user.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Token is valid",
      user: {
        id: user._id,
        username: user.username,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
      },
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token has expired" });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: "Invalid token" });
    }
    res.status(500).json({ message: "Server error verifying token" });
  }
});

//@desc: Login User
//@api: API/LOGIN
//@method: post,private
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;


  if (!email || !password) {
    console.log('Missing email or password');
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalizedEmail = email.toLowerCase();

  const user = await Users.findOne({ email: normalizedEmail }).select('+password');
  if (!user) {
    return res.status(400).json({ message: "No users with this email found." });
  }


  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return res.status(400).json({ message: "Email or Password Incorrect." });
  }

  const accessToken = jwt.sign(
    {
      user: {
        username: user.username,
        firstname: user.firstname,
        lastname: user.lastname,
        id: user._id,
      },
    },
    process.env.SECRECT_KEY,
    { expiresIn: "7d" }
  );


  res.status(200).json({
    accesstoken: accessToken,
    user: {
      id: user._id,
      username: user.username,
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      avatar: user.avatar,
    },
  });
});

//@desc: Get current user
//@api: API/CURRENT
//@method: get, private
const currentUser = asyncHandler(async (req, res) => {
  const user = await Users.findById(req.user.id).select('-password');
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  res.status(200).json({
    id: user._id,
    username: user.username,
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio || '',
    location: user.location || '',
    website: user.website || '',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

// @desc: Update user profile
// @api: PUT /api/users/current
// @method: private
const updateProfile = asyncHandler(async (req, res) => {
  const { firstname, lastname, username, bio, location, website } = req.body;
  // Validate username if provided
  if (username) {
    const existingUser = await Users.findOne({ username });
    if (existingUser && existingUser._id.toString() !== req.user.id) {
      res.status(400);
      throw new Error("Username is already taken");
    }
  }
  const updatedUser = await Users.findByIdAndUpdate(
    req.user.id,
    { firstname, lastname, username, bio, location, website },
    { new: true, select: "-password" }
  );
  if (!updatedUser) {
    return res.status(404).json({ message: "User not found" });
  }
  res.status(200).json(updatedUser);
});


// @desc: Upload profile picture
// @api: POST /api/users/upload-profile
// @method: private
const uploadProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const avatarUrl = `/storage/profile-pictures/${req.file.filename}`;

  try {
    const updatedUser = await Users.findByIdAndUpdate(
      req.user.id,
      { avatar: avatarUrl },
      { new: true, select: '-password' }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }


    res.status(200).json({
      message: "Profile picture uploaded successfully",
      avatarUrl: updatedUser.avatar,
    });
  } catch (error) {
    console.error('Error updating user avatar:', error);
    res.status(500).json({ message: "Server error updating profile picture" });
  }
});

// New controllers with validation
const getUserPosts = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }

  const posts = await Post.find({ user_id: userId });
  res.status(200).json(posts);
});

const getUserProducts = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }

  const products = await Product.find({ user_id: userId });
  res.status(200).json(products);
});

const getUserEvents = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }

  const events = await Event.find({ user_id: userId });
  res.status(200).json(events);
});

//@desc: Check Username Availability
//@api: POST /api/users/check-username
//@method: private
const checkUsername = asyncHandler(async (req, res) => {
  const { username } = req.body;
  if (!username || username.trim() === "") {
    res.status(400);
    throw new Error("Username is required and cannot be empty");
  }
  // Optional: Validate format (adjust regex as needed)
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username)) {
    res.status(400);
    throw new Error("Username must be 3-20 characters, alphanumeric or underscore only");
  }
  const currentUser = await Users.findById(req.user.id);
  if (currentUser.username === username) {
    return res.status(200).json({ available: true, message: "This is your current username" });
  }
  const existingUser = await Users.findOne({ username });
  if (existingUser) {
    res.status(200).json({ available: false, message: "Username is already taken" }); // Changed to 200
  } else {
    res.status(200).json({ available: true, message: "Username is available" });
  }
});

const getUserIdByUsername = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const user = await User.findOne({ username }).select('_id');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.status(200).json({ userId: user._id });
});

module.exports = {
  getUsers,
  createUser,
  loginUser,
  currentUser,
  verifyLoginToken,
  updateProfile,
  uploadProfilePicture,
  getUserById,
  getUserPosts,
  getUserProducts,
  getUserEvents,
  getHomeUsers,
  getHomeUserById,
  checkUsername,
  getUserIdByUsername
};
