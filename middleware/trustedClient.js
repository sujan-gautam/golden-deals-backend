// middleware/trustedClient.js
const trustedClient = (req, res, next) => {
  const clientToken = req.header('x-api-key');
  const expectedToken = process.env.TRUSTED_CLIENT_TOKEN;

  // Debug logs
  console.log('Trusted Client Middleware Triggered');
  console.log('Received x-api-key:', clientToken);
  console.log('Expected x-api-key:', expectedToken);

  if (!clientToken || clientToken !== expectedToken) {
    console.warn('Unauthorized client access attempt');
    return res.status(403).json({ message: 'Forbidden: Unauthorized client' });
  }

  next();
};

module.exports = trustedClient;
