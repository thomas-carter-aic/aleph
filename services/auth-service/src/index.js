const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'aleph-super-secret-key';

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use(limiter);

// JWT Strategy
passport.use(new JwtStrategy({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: JWT_SECRET
}, async (payload, done) => {
  try {
    // In production, fetch user from database
    const user = { id: payload.sub, email: payload.email, role: payload.role };
    return done(null, user);
  } catch (error) {
    return done(error, false);
  }
}));

// Mock user database (replace with real database)
const users = [
  {
    id: '1',
    email: 'admin@aleph.ai',
    password: '$2a$10$8K1p/a0dURXAMy.nnQX.XeN5XHb9c7qgKJ5VvCxrpQf5dQXrIFOjG', // 'admin123'
    role: 'admin',
    permissions: ['read', 'write', 'admin']
  },
  {
    id: '2', 
    email: 'developer@aleph.ai',
    password: '$2a$10$8K1p/a0dURXAMy.nnQX.XeN5XHb9c7qgKJ5VvCxrpQf5dQXrIFOjG', // 'dev123'
    role: 'developer',
    permissions: ['read', 'write']
  }
];

// Authentication routes
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { 
        sub: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, role = 'user' } = req.body;
    
    // Check if user exists
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const newUser = {
      id: String(users.length + 1),
      email,
      password: hashedPassword,
      role,
      permissions: role === 'admin' ? ['read', 'write', 'admin'] : ['read']
    };
    
    users.push(newUser);
    
    // Generate JWT
    const token = jwt.sign(
      {
        sub: newUser.id,
        email: newUser.email,
        role: newUser.role,
        permissions: newUser.permissions
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        permissions: newUser.permissions
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Token validation
app.get('/auth/validate', passport.authenticate('jwt', { session: false }), (req, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// OAuth2 endpoints (placeholder for future implementation)
app.get('/auth/oauth/google', (req, res) => {
  res.json({ message: 'Google OAuth integration coming soon' });
});

app.get('/auth/oauth/github', (req, res) => {
  res.json({ message: 'GitHub OAuth integration coming soon' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'aleph-auth-service',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🔐 Aleph Auth Service running on port ${PORT}`);
});

module.exports = app;
