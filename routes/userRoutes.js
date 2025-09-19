const express = require('express');
const { getUsers, createUser, loginUser, currentUser, verifyLoginToken, uploadProfilePicture, updateProfile, getUserById, getUserPosts,getUserEvents, getUserProducts, getHomeUsers, getHomeUserById, checkUsername,getUserIdByUsername,forgotPassword,resetPassword,changePassword  } = require('../controllers/userController');
const verifyToken = require('../middleware/verifyTokenHandler');
const upload = require('../config/multer');  
const router = express.Router();

router.route('/')
  .get(getUsers);

router.route('/home')
  .get(getHomeUsers);

router.route('/home/:id')
  .get(getHomeUserById);
router.route('/register')
  .post(createUser);

router.route('/login')
  .post(loginUser);

router.route('/current')
  .get(verifyToken, currentUser);

router.route('/verify-token')
  .get(verifyToken, verifyLoginToken);

router.route('/current')
  .put(verifyToken, updateProfile);

router.route('/upload-profile')
  .post(verifyToken, upload.single('profile'), uploadProfilePicture); 

router.route("/check-username").post(verifyToken, checkUsername);

router.route('/:id')
  .get(verifyToken,getUserById)

router.get('/:id/posts',verifyToken, getUserPosts);
router.get('/:id/products',verifyToken, getUserProducts);
router.get('/:id/events',verifyToken, getUserEvents);
router.post('/change-password',verifyToken,changePassword);

router.route('/username/:username').get(getUserIdByUsername);

router.route('/forgot-password').post(forgotPassword);
router.route('/reset-password').post(resetPassword);

module.exports = router;
