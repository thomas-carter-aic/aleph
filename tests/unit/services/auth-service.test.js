// Unit Tests for Authentication Service
// Comprehensive testing with advanced pattern validation

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock the auth service
const app = require('../../../services/auth-service/src/index');

describe('Authentication Service', () => {
  describe('POST /auth/login', () => {
    it('should authenticate valid user and return JWT token', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'admin@aleph.ai',
          password: 'admin123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('admin@aleph.ai');
      expect(response.body.user.role).toBe('admin');
      
      // Verify JWT token structure
      const decoded = jwt.decode(response.body.token);
      expect(decoded).toHaveProperty('sub');
      expect(decoded).toHaveProperty('email');
      expect(decoded).toHaveProperty('role');
      expect(decoded).toHaveProperty('permissions');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'admin@aleph.ai',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@aleph.ai',
          password: 'password'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('POST /auth/register', () => {
    it('should register new user successfully', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'newuser@aleph.ai',
          password: 'newpassword123',
          role: 'user'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('newuser@aleph.ai');
      expect(response.body.user.role).toBe('user');
    });

    it('should reject duplicate email registration', async () => {
      // First registration
      await request(app)
        .post('/auth/register')
        .send({
          email: 'duplicate@aleph.ai',
          password: 'password123'
        });

      // Second registration with same email
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'duplicate@aleph.ai',
          password: 'password456'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('User already exists');
    });
  });

  describe('GET /auth/validate', () => {
    it('should validate valid JWT token', async () => {
      // First login to get token
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: 'admin@aleph.ai',
          password: 'admin123'
        });

      const token = loginResponse.body.token;

      // Validate token
      const response = await request(app)
        .get('/auth/validate')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body).toHaveProperty('user');
    });

    it('should reject invalid JWT token', async () => {
      const response = await request(app)
        .get('/auth/validate')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('Security Features', () => {
    it('should hash passwords securely', async () => {
      const password = 'testpassword123';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50);
      
      const isValid = await bcrypt.compare(password, hashedPassword);
      expect(isValid).toBe(true);
    });

    it('should include security headers', async () => {
      const response = await request(app).get('/health');
      
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should enforce rate limiting', async () => {
      // Make multiple rapid requests
      const promises = Array(10).fill().map(() => 
        request(app)
          .post('/auth/login')
          .send({ email: 'test@test.com', password: 'test' })
      );

      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('aleph-auth-service');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });
  });
});
