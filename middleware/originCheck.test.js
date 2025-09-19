const originCheck = require('./originCheck');
const axios = require('axios');
const fs = require('fs').promises;

// Mock axios and fs
jest.mock('axios');
jest.mock('fs', () => ({
  promises: {
    appendFile: jest.fn()
  }
}));

// Helper to create mock req, res, next
const mockReqRes = (headers = {}, ip = '127.0.0.1') => {
  const req = {
    get: (key) => headers[key.toLowerCase()],
    headers,
    ip,
    connection: { remoteAddress: ip },
    originalUrl: '/test-url'
  };

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };

  const next = jest.fn();

  return { req, res, next };
};

describe('originCheck middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_APP_URL = 'http://localhost:8080';
    process.env.API_URL = 'http://localhost:5000';
  });

  it('should call next() if origin is allowed', async () => {
    const { req, res, next } = mockReqRes({
      origin: 'http://localhost:8080'
    });

    axios.get.mockResolvedValue({ data: { city: 'City', country_name: 'Country' } });

    await originCheck(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 403 if origin is missing', async () => {
    const { req, res, next } = mockReqRes({});

    axios.get.mockResolvedValue({ data: {} });

    await originCheck(req, res, next);

    expect(fs.appendFile).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'IP and Location sent to the server! Red Alert Initiated.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if origin is not allowed', async () => {
    const { req, res, next } = mockReqRes({
      origin: 'http://evil-site.com'
    });

    axios.get.mockResolvedValue({ data: { city: 'X', country_name: 'Y' } });

    await originCheck(req, res, next);

    expect(fs.appendFile).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Request origin not allowed' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should still call next() if axios fails but origin is allowed', async () => {
    const { req, res, next } = mockReqRes({
      origin: 'http://localhost:8080'
    });

    axios.get.mockRejectedValue(new Error('Network error'));

    await originCheck(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(fs.appendFile).not.toHaveBeenCalled();
  });
});
