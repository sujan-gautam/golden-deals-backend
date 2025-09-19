const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductImage,
  likeProduct,
  shareProduct,
  commentOnProduct,
  likeComment,
  getProductById
} = require('../controllers/productController');
const verifyToken = require('../middleware/verifyTokenHandler');

// Routes for getting all products (public or admin)
router.route('/all').get(getAllProducts); // GET /api/products/all - Get all products

// Apply verifyToken middleware to all routes
router.use(verifyToken);
router
  .route('/')
  .get(getProducts) // GET /api/products - Get authenticated user's products
  .post(createProduct); // POST /api/products - Create a new product

// Routes for specific product operations
router
  .route('/:id')
  .get(getProductById) 
  .put(updateProduct) // PUT /api/products/:id - Update a product
  .delete(deleteProduct); // DELETE /api/products/:id - Delete a product

router.route('/:id/like').post(likeProduct); // POST /api/products/:id/like - Like a product
router.route('/:id/share').post(shareProduct); // POST /api/products/:id/share - Share a product
router.route('/:id/comment').post(commentOnProduct); // POST /api/products/:id/comment - Comment or reply on a product
router.route('/:productId/comments/:commentId/like').post(likeComment); // POST /api/products/:productId/comments/:commentId/like - Like a comment

// Route for getting product images
router.route('/image/:filename').get(getProductImage); // GET /api/products/image/:filename - Get product image

module.exports = router;