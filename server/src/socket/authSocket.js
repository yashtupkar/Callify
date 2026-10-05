/**
 * Socket auth helpers — used by the /wa-live WebSocket.
 *
 * Reads the same `callify_token` cookie as REST auth. Verifies against
 * JWT_SECRET, looks up the user, and returns it.
 */

const jwt = require('jsonwebtoken');
const { dbService } = require('../services/DatabaseService');
const { JWT_SECRET } = require('../middleware/auth');

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

async function authenticateSocket(ws, req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.callify_token;
  if (!token) throw new Error('No auth cookie');
  const payload = jwt.verify(token, JWT_SECRET);
  const user = await dbService.prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new Error('User not found');
  return user;
}

function requireRoleSocket(user, roles) {
  return roles.includes(user.role);
}

module.exports = { authenticateSocket, requireRoleSocket };
