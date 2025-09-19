const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/userModel');

describe('Auth Endpoints', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.CONNECTION_STRING);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should create a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('token');
    });
  });
}); 