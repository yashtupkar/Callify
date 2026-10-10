/**
 * WhatsAppAutomationLogService
 *
 * Centralized, structured logging service for WhatsApp automations.
 * Writes to the WhatsAppAutomationLog table and broadcasts live events
 * over WebSocket so the admin UI can show real-time logs.
 */

const { dbService } = require('../services/DatabaseService');

// In-memory ring buffer for fast recent-log retrieval (last 500 entries per automation)
const RECENT_LOG_LIMIT = 500;
const recentLogs = new Map(); // automationId -> array

// WebSocket broadcast callback (set by server startup)
let broadcastFn = null;

function setBroadcast(fn) {
  broadcastFn = fn;
}

function getRecentLogs(automationId, limit = 100) {
  const list = recentLogs.get(automationId) || [];
  return list.slice(-limit);
}

/**
 * Internal write: persist to DB, keep in-memory, broadcast.
 */
async function _write({ automationId, connectionId, contactWaId, sessionId, level = 'info', category = 'system', event, message, metadata }) {
  const entry = {
    automationId,
    connectionId: connectionId || null,
    contactWaId: contactWaId || null,
    sessionId: sessionId || null,
    level,
    category,
    event,
    message,
    metadata: metadata || null,
    createdAt: new Date(),
  };

  // In-memory ring buffer
  let list = recentLogs.get(automationId);
  if (!list) {
    list = [];
    recentLogs.set(automationId, list);
  }
  list.push(entry);
  if (list.length > RECENT_LOG_LIMIT) list.splice(0, list.length - RECENT_LOG_LIMIT);

  // Broadcast to WebSocket listeners
  if (broadcastFn) {
    try {
      broadcastFn({ type: 'automation_log', log: entry });
    } catch (e) {
      // broadcast errors must not break logging
    }
  }

  // Persist to DB (fire-and-forget so it never blocks message handling)
  try {
    await dbService.prisma.whatsAppAutomationLog.create({
      data: {
        automationId: entry.automationId,
        connectionId: entry.connectionId,
        contactWaId: entry.contactWaId,
        sessionId: entry.sessionId,
        level: entry.level,
        category: entry.category,
        event: entry.event,
        message: entry.message,
        metadata: entry.metadata,
      },
    });
  } catch (err) {
    console.error('[WhatsAppAutomationLogService] DB persist failed:', err.message);
  }

  return entry;
}

function build(automationId, ctx = {}) {
  return {
    async info(category, event, message, metadata) {
      return _write({ automationId, ...ctx, level: 'info', category, event, message, metadata });
    },
    async warn(category, event, message, metadata) {
      return _write({ automationId, ...ctx, level: 'warn', category, event, message, metadata });
    },
    async error(category, event, message, metadata) {
      return _write({ automationId, ...ctx, level: 'error', category, event, message, metadata });
    },
    async debug(category, event, message, metadata) {
      if (process.env.WA_AUTOMATION_DEBUG !== '1') return null;
      return _write({ automationId, ...ctx, level: 'debug', category, event, message, metadata });
    },
  };
}

async function query(automationId, filters = {}) {
  try {
    const where = { automationId };
    if (filters.category) where.category = filters.category;
    if (filters.level) where.level = filters.level;
    if (filters.sessionId) where.sessionId = filters.sessionId;
    if (filters.since) where.createdAt = { gte: new Date(filters.since) };
    if (filters.limit) {
      const rows = await dbService.prisma.whatsAppAutomationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(filters.limit, 500),
      });
      return rows.reverse();
    }
    return dbService.prisma.whatsAppAutomationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  } catch (err) {
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return [];
    }
    throw err;
  }
}

async function stats(automationId) {
  try {
    const base = await dbService.prisma.whatsAppAutomationLog.groupBy({
      by: ['category', 'level'],
      where: { automationId },
      _count: { _all: true },
    });

    const summary = { total: 0, byCategory: {}, byLevel: {} };
    for (const row of base) {
      summary.total += row._count._all;
      summary.byCategory[row.category] = (summary.byCategory[row.category] || 0) + row._count._all;
      summary.byLevel[row.level] = (summary.byLevel[row.level] || 0) + row._count._all;
    }
    return summary;
  } catch (err) {
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return { total: 0, byCategory: {}, byLevel: {} };
    }
    throw err;
  }
}

module.exports = {
  WhatsAppAutomationLogService: {
    build,
    query,
    stats,
    getRecentLogs,
    setBroadcast,
  },
};