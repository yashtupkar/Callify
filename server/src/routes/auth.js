const express = require('express');
const bcrypt = require('bcryptjs');
const { dbService } = require('../services/DatabaseService');
const { signToken, setAuthCookie, clearAuthCookie, authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
// Body: { email, password, name, role? }
// First user is automatically promoted to admin. Subsequent users default to 'user'.
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await dbService.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const userCount = await dbService.prisma.user.count();
    const assignedRole = userCount === 0 ? 'admin' : (role === 'admin' ? 'admin' : 'user');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await dbService.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name || null,
        role: assignedRole,
      },
    });

    const token = signToken(user);
    setAuthCookie(res, token);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('[Auth] register error:', err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// POST /api/auth/login
// Body: { email, password }
// Returns 200 only if the user is allowed: either role=admin OR has any agent.allowedEmails entry.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await dbService.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Admins are always allowed. Users must be invited via agent.allowedEmails.
    if (user.role !== 'admin') {
      const allowedCount = await dbService.prisma.agent.count({
        where: { allowedEmails: { has: normalizedEmail } },
      });
      if (allowedCount === 0) {
        return res.status(403).json({
          error: 'Access denied. Your email has not been added to any agent. Please contact an admin.',
        });
      }
    }

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('[Auth] login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

// GET /api/auth/me — returns current user + (for users) list of accessible agent IDs
router.get('/me', authenticate, async (req, res) => {
  try {
    let agentIds = [];
    if (req.user.role !== 'admin') {
      const agents = await dbService.prisma.agent.findMany({
        where: { allowedEmails: { has: req.user.email } },
        select: { id: true, name: true },
      });
      agentIds = agents;
    } else {
      const agents = await dbService.prisma.agent.findMany({ select: { id: true, name: true } });
      agentIds = agents;
    }
    res.json({ user: publicUser(req.user), agents: agentIds });
  } catch (err) {
    console.error('[Auth] me error:', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

// PUT /api/auth/password — current user changes their own password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }
    const ok = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await dbService.prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[Auth] change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
