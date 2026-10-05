const jwt = require('jsonwebtoken');
const { dbService } = require('../services/DatabaseService');

const JWT_SECRET = process.env.JWT_SECRET || 'callify-dev-secret-change-me';
const JWT_EXPIRES_IN = '7d';

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function setAuthCookie(res, token) {
  res.cookie('callify_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie('callify_token');
}

function extractToken(req) {
  const cookieToken = req.cookies?.callify_token;
  if (cookieToken) return cookieToken;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

async function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await dbService.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

module.exports = {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  authenticate,
  authMiddleware: authenticate,
  requireRole,
  requireAdmin: requireRole('admin'),
  JWT_SECRET,
};
