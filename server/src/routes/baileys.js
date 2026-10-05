const express = require("express");
const router = express.Router();
const {
  baileysInstanceManager,
} = require("../services/BaileysInstanceManager");

// POST /api/baileys/instance - Create new Baileys instance
router.post("/instance", async (req, res) => {
  try {
    const { instanceId } = req.body;

    if (!instanceId) {
      return res.status(400).json({ error: "instanceId is required" });
    }

    const provider = baileysInstanceManager.createInstance(instanceId);
    res.status(201).json({
      instanceId,
      status: provider.getStatus(),
    });
  } catch (err) {
    console.error("[Baileys API] Error creating instance:", err);
    res.status(500).json({ error: err.message || "Failed to create instance" });
  }
});

// POST /api/baileys/instance/:id/reconnect - Reconnect a persisted instance
router.post("/instance/:id/reconnect", async (req, res) => {
  try {
    const provider = baileysInstanceManager.reconnectInstance(req.params.id);
    res.json({
      instanceId: req.params.id,
      status: provider.getStatus(),
    });
  } catch (err) {
    console.error("[Baileys API] Error reconnecting instance:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to reconnect instance" });
  }
});

// GET /api/baileys/public-numbers - Public, minimal list for the citizen contact page
router.get("/public-numbers", async (req, res) => {
  try {
    const numbers = baileysInstanceManager
      .getAllInstances()
      .filter((instance) => {
        const status =
          typeof instance.status === "object"
            ? instance.status?.status || instance.status?.connection
            : instance.status;
        return (
          (status === "connected" || status === "open") && instance.phoneNumber
        );
      })
      .map(({ instanceId, phoneNumber }) => ({
        instanceId,
        phoneNumber,
        status: "connected",
      }));

    res.json(numbers);
  } catch (err) {
    console.error("[Baileys API] Error fetching public WhatsApp numbers:", err);
    res.status(500).json({ error: "Failed to fetch WhatsApp numbers" });
  }
});

// GET /api/baileys/instances - List all instances
router.get("/instances", async (req, res) => {
  try {
    const instances = baileysInstanceManager.getAllInstances();
    res.json(instances);
  } catch (err) {
    console.error("[Baileys API] Error fetching instances:", err);
    res.status(500).json({ error: "Failed to fetch instances" });
  }
});

// GET /api/baileys/instance/:id/status - Get instance status
router.get("/instance/:id/status", async (req, res) => {
  try {
    const status = baileysInstanceManager.getInstanceStatus(req.params.id);

    if (!status) {
      return res.status(404).json({ error: "Instance not found" });
    }

    res.json(status);
  } catch (err) {
    console.error("[Baileys API] Error fetching instance status:", err);
    res.status(500).json({ error: "Failed to fetch instance status" });
  }
});

// DELETE /api/baileys/instance/:id - Remove instance
router.delete("/instance/:id", async (req, res) => {
  try {
    await baileysInstanceManager.removeInstance(req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error("[Baileys API] Error removing instance:", err);
    res.status(500).json({ error: "Failed to remove instance" });
  }
});

// POST /api/baileys/instance/:id/send - Send message
router.post("/instance/:id/send", async (req, res) => {
  try {
    const { to, type, body, url, caption, filename } = req.body;

    if (!to || !type) {
      return res.status(400).json({ error: "to and type are required" });
    }

    await baileysInstanceManager.sendMessage(req.params.id, to, type, {
      body,
      url,
      caption,
      filename,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("[Baileys API] Error sending message:", err);
    res.status(500).json({ error: err.message || "Failed to send message" });
  }
});

// PUT /api/baileys/instance/:id/agent - Map instance to an agent
router.put("/instance/:id/agent", async (req, res) => {
  try {
    const { agentId } = req.body;
    if (!agentId) {
      return res.status(400).json({ error: "agentId is required" });
    }
    baileysInstanceManager.setAgentMapping(req.params.id, agentId);
    res.json({ success: true, instanceId: req.params.id, agentId });
  } catch (err) {
    console.error("[Baileys API] Error mapping agent:", err);
    res.status(500).json({ error: err.message || "Failed to map agent" });
  }
});

module.exports = router;

