// middleware/trustedClient.js
const trustedClient = (req, res, next) => {
    const clientToken = req.header('x-api-key'); // or any custom header you prefer
    const expectedToken = process.env.TRUSTED_CLIENT_TOKEN;
  
    if (!clientToken || clientToken !== expectedToken) {
      return res.status(403).json({ message: 'Forbidden: Unauthorized client' });
    }
  
    next();
  };
  
  module.exports = trustedClient;
  