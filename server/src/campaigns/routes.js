const express = require('express');
const cookieParser = require('cookie-parser');
const { ApiError } = require('./service');

/** Resolves the caller's workspace. Users without one are bound (once) to the oldest workspace, as the rest of the app already assumes. */
function createWorkspaceResolver(prisma) {
  return async function resolveWorkspaceId(user) {
    if (user.workspaceId) return user.workspaceId;
    const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!workspace) throw new ApiError(403, 'NO_WORKSPACE', 'No workspace is available for this account');
    await prisma.user.updateMany({ where: { id: user.id, workspaceId: null }, data: { workspaceId: workspace.id } });
    user.workspaceId = workspace.id;
    return workspace.id;
  };
}

function createCampaignsRouter({ service, authenticate, authorize, resolveWorkspaceId, jsonLimit = '5mb' }) {
  const router = express.Router();
  router.use(cookieParser());
  router.use(express.json({ limit: jsonLimit }));
  router.use(authenticate);
  if (authorize) router.use(authorize);

  const handler = (fn) => async (req, res) => {
    try {
      const workspaceId = await resolveWorkspaceId(req.user);
      await fn(req, res, workspaceId);
    } catch (error) {
      if (error instanceof ApiError) {
        return res.status(error.status).json({ error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) });
      }
      console.error('[Campaigns] Request failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
  const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

  router.get('/connections', handler(async (req, res, ws) => res.json({ connections: await service.listConnections(ws) })));
  router.get('/connections/:id/templates', handler(async (req, res, ws) => res.json({ templates: await service.listTemplates(ws, req.params.id) })));
  router.post('/preview-recipients', handler(async (req, res, ws) => res.json(await service.previewRecipients(ws, { ...body(req).recipients, connectionId: body(req).connectionId }))));
  router.post('/preview-message', handler(async (req, res, ws) => res.json(await service.previewMessage(ws, body(req)))));
  router.post('/', handler(async (req, res, ws) => {
    const result = await service.createCampaign(ws, req.user, body(req));
    res.status(result.existing ? 200 : 201).json({ id: result.campaign.id, existing: result.existing, summary: result.summary });
  }));
  router.get('/', handler(async (req, res, ws) => res.json(await service.listCampaigns(ws, req.query))));
  router.get('/:id', handler(async (req, res, ws) => res.json(await service.getStatus(ws, req.params.id))));
  router.get('/:id/config', handler(async (req, res, ws) => res.json(await service.getConfig(ws, req.params.id))));
  router.post('/:id/update', handler(async (req, res, ws) => res.json(await service.updateCampaign(ws, req.params.id, body(req)))));
  router.get('/:id/recipients', handler(async (req, res, ws) => res.json(await service.listRecipients(ws, req.params.id, req.query))));
  router.post('/:id/launch', handler(async (req, res, ws) => res.json(await service.launch(ws, req.params.id, body(req)))));
  router.post('/:id/pause', handler(async (req, res, ws) => res.json(await service.pause(ws, req.params.id))));
  router.post('/:id/resume', handler(async (req, res, ws) => res.json(await service.resume(ws, req.params.id))));
  router.post('/:id/cancel', handler(async (req, res, ws) => res.json(await service.cancel(ws, req.params.id))));
  router.get('/:id/report', handler(async (req, res, ws) => {
    if (req.query.format === 'csv') {
      const csv = await service.reportCsv(ws, req.params.id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.params.id}.csv"`);
      return res.send(csv);
    }
    return res.json(await service.report(ws, req.params.id));
  }));

  return router;
}

module.exports = { createCampaignsRouter, createWorkspaceResolver };
