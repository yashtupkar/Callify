import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Sparkles,
  GitBranch,
  Plus,
  Trash2,
  Copy,
  Eye,
  Check,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  CornerDownRight,
  ArrowRight,
  ExternalLink,
  Layers,
  HelpCircle,
  FileText,
  MousePointer,
  Hash,
  Smile,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Link as LinkIcon,
  Unlink,
  Edit2,
  Workflow,
  List,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Lock,
  Unlock,
  Move,
  GripVertical,
  Clock,
  Send,
  MoreVertical,
  X,
} from "lucide-react";

const BUTTON_COLORS = [
  "#059669", // Emerald
  "#0284c7", // Sky Blue
  "#7c3aed", // Violet
  "#d97706", // Amber
  "#db2777", // Rose
];

export default function VisualFlowBuilder({
  config,
  update,
  updateRule,
  updateRuleResponse,
  testRule,
  onOpenAiModal,
  onSwitchToList,
}) {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 60, y: 50 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [isLocked, setIsLocked] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [draggedNode, setDraggedNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [nodePositions, setNodePositions] = useState({});
  const [flowActive, setFlowActive] = useState(true);
  const [activeConnectPort, setActiveConnectPort] = useState(null);

  // Active rules
  const rules = useMemo(() => (Array.isArray(config.rules) ? config.rules : []), [config.rules]);

  // Identify Start / Root Node
  const rootIndex = useMemo(() => {
    const idx = rules.findIndex((r) => r.triggerType === "first_message");
    return idx !== -1 ? idx : 0;
  }, [rules]);

  const rootRule = rules[rootIndex];

  // Map button IDs to their child rule indices (supports comma-separated triggers)
  const buttonMap = useMemo(() => {
    const map = {};
    rules.forEach((rule, idx) => {
      if (
        idx !== rootIndex &&
        (rule.triggerType === "button_press" || rule.triggerType === "list_row") &&
        rule.triggerValue
      ) {
        const ids = String(rule.triggerValue)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        ids.forEach((id) => {
          map[id] = { rule, index: idx };
        });
      }
    });
    return map;
  }, [rules, rootIndex]);

  // Escape key closes expanded view and connect popover
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (activeConnectPort) setActiveConnectPort(null);
        else if (isExpanded) setIsExpanded(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isExpanded, activeConnectPort]);

  // Default non-overlapping coordinate layout generator
  useEffect(() => {
    setNodePositions((prev) => {
      const next = { ...prev };
      const CARD_W = 300;
      const CARD_H = 520;
      const COL_GAP = 140;
      const ROW_GAP = 60;

      const col0X = 40;
      const col1X = col0X + CARD_W + COL_GAP; // 480
      const col2X = col1X + CARD_W + COL_GAP; // 920
      const col3X = col2X + CARD_W + COL_GAP; // 1360

      // Flow start node
      if (!next["flow_start"]) {
        next["flow_start"] = { x: col0X, y: 60 };
      }
      // Root message node
      if (!next[`rule_${rootIndex}`]) {
        next[`rule_${rootIndex}`] = { x: col1X, y: 60 };
      }

      // Branch nodes positioning in tiers
      const rootButtons = rootRule?.responseConfig?.buttons || [];
      const rootSections = rootRule?.responseConfig?.sections?.[0]?.rows || [];
      const allRootItems = [...rootButtons, ...rootSections];

      let tier1CurrentY = 60;
      let tier2CurrentY = 60;

      allRootItems.forEach((btn) => {
        const child = buttonMap[btn.id?.trim()];
        if (child) {
          const key = `rule_${child.index}`;
          if (!next[key]) {
            next[key] = {
              x: col2X,
              y: tier1CurrentY,
            };
          }
          tier1CurrentY += CARD_H + ROW_GAP;

          // Check sub-branches
          const subButtons = child.rule.responseConfig?.buttons || [];
          subButtons.forEach((subBtn) => {
            const grandChild = buttonMap[subBtn.id?.trim()];
            if (grandChild) {
              const subKey = `rule_${grandChild.index}`;
              if (!next[subKey]) {
                next[subKey] = {
                  x: col3X,
                  y: tier2CurrentY,
                };
              }
              tier2CurrentY += CARD_H + ROW_GAP;
            }
          });
        }
      });

      // Place keyword / unlinked rules below in Col 2
      const placed = new Set([
        rootIndex,
        ...Object.values(buttonMap).map((b) => b.index),
      ]);

      rules.forEach((_, idx) => {
        if (!placed.has(idx)) {
          const key = `rule_${idx}`;
          if (!next[key]) {
            next[key] = {
              x: col2X,
              y: tier1CurrentY,
            };
            tier1CurrentY += CARD_H + ROW_GAP;
          }
        }
      });

      // Anti-collision pass: ensure no cards in the same column overlap
      const keys = Object.keys(next);
      for (let i = 0; i < keys.length; i++) {
        for (let j = 0; j < keys.length; j++) {
          if (i === j) continue;
          const kA = keys[i];
          const kB = keys[j];
          const pA = next[kA];
          const pB = next[kB];
          if (!pA || !pB) continue;

          // If in the same horizontal column
          const inSameCol = Math.abs(pA.x - pB.x) < CARD_W + 40;
          if (inSameCol) {
            // If overlapping vertically
            if (pB.y >= pA.y && pB.y < pA.y + CARD_H + ROW_GAP) {
              next[kB] = { ...pB, y: pA.y + CARD_H + ROW_GAP };
            }
          }
        }
      }

      return next;
    });
  }, [rules, rootIndex, rootRule, buttonMap]);

  // Wheel zoom listener centered on cursor with controlled, smooth sensitivity
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();
      // Gentle, controlled sensitivity
      const clampedDelta = Math.max(-30, Math.min(30, e.deltaY));
      const zoomFactor = 1 - clampedDelta * 0.0015;

      setZoom((prevZoom) => {
        const nextZoom = Math.min(2.0, Math.max(0.3, Number((prevZoom * zoomFactor).toFixed(3))));
        if (Math.abs(nextZoom - prevZoom) < 0.001) return prevZoom;

        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setPan((prevPan) => ({
          x: Math.round(mouseX - (mouseX - prevPan.x) * (nextZoom / prevZoom)),
          y: Math.round(mouseY - (mouseY - prevPan.y) * (nextZoom / prevZoom)),
        }));

        return nextZoom;
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Pan handlers
  const handleMouseDown = (e) => {
    if (isLocked) return;
    if (e.target.closest(".flow-node-card") || e.target.closest("button") || e.target.closest("input") || e.target.closest("textarea")) {
      return;
    }
    // Clicking on canvas background closes any open connect popover
    if (activeConnectPort) setActiveConnectPort(null);
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    } else if (draggedNode) {
      const newX = (e.clientX - dragOffset.x) / zoom;
      const newY = (e.clientY - dragOffset.y) / zoom;
      setNodePositions((prev) => ({
        ...prev,
        [draggedNode]: { x: Math.max(0, newX), y: Math.max(0, newY) },
      }));
    }
  }, [isPanning, startPan, draggedNode, dragOffset, zoom]);

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNode(null);
  };

  // Node drag handlers
  const handleNodeDragStart = (nodeKey, e) => {
    if (isLocked) return;
    e.stopPropagation();
    const pos = nodePositions[nodeKey] || { x: 0, y: 0 };
    setDraggedNode(nodeKey);
    setDragOffset({
      x: e.clientX - pos.x * zoom,
      y: e.clientY - pos.y * zoom,
    });
  };

  // Center-focused Zoom controls (+ / - buttons) with gentle step
  const handleZoom = (delta) => {
    setZoom((prevZoom) => {
      const nextZoom = Math.min(2.0, Math.max(0.3, Number((prevZoom + delta).toFixed(2))));
      if (nextZoom === prevZoom) return prevZoom;

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        setPan((prevPan) => ({
          x: Math.round(centerX - (centerX - prevPan.x) * (nextZoom / prevZoom)),
          y: Math.round(centerY - (centerY - prevPan.y) * (nextZoom / prevZoom)),
        }));
      }
      return nextZoom;
    });
  };

  const handleResetView = () => {
    setZoom(0.85);
    setPan({ x: 60, y: 50 });
  };

  // Connect a button to an EXISTING message card (supports many-to-one connections)
  const handleConnectButtonToRule = (buttonId, targetRuleIndex) => {
    if (!buttonId || targetRuleIndex == null) return;
    const targetRule = rules[targetRuleIndex];
    if (!targetRule) return;

    const trimmedId = buttonId.trim();

    // 1. If this button was previously connected to another card, clean it up from that card
    const previousChild = buttonMap[trimmedId];
    if (previousChild && previousChild.index !== targetRuleIndex) {
      const oldRule = rules[previousChild.index];
      if (oldRule && oldRule.triggerValue) {
        const remainingOldIds = String(oldRule.triggerValue)
          .split(",")
          .map((s) => s.trim())
          .filter((id) => id && id !== trimmedId);
        if (remainingOldIds.length > 0) {
          updateRule(previousChild.index, {
            triggerValue: remainingOldIds.join(", "),
          });
        } else {
          updateRule(previousChild.index, {
            triggerType: "keyword",
            triggerValue: "unlinked",
          });
        }
      }
    }

    // 2. Append this buttonId to targetRule's triggerValue (comma-separated, no duplicates)
    let updatedTriggers = trimmedId;
    if (targetRule.triggerType === "button_press" && targetRule.triggerValue) {
      const existingIds = String(targetRule.triggerValue)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!existingIds.includes(trimmedId)) {
        existingIds.push(trimmedId);
      }
      updatedTriggers = existingIds.join(", ");
    }

    updateRule(targetRuleIndex, {
      triggerType: "button_press",
      triggerValue: updatedTriggers,
    });
    setActiveConnectPort(null);
  };

  // Disconnect button from a child message card
  const handleDisconnectButton = (buttonId, childRuleIndex) => {
    if (childRuleIndex == null) return;
    const targetRule = rules[childRuleIndex];
    if (!targetRule) return;

    const trimmedId = buttonId?.trim();
    if (trimmedId && targetRule.triggerValue) {
      const existingIds = String(targetRule.triggerValue)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const remainingIds = existingIds.filter((id) => id !== trimmedId);

      if (remainingIds.length > 0) {
        // Keep other buttons connected to this card!
        updateRule(childRuleIndex, {
          triggerValue: remainingIds.join(", "),
        });
        setActiveConnectPort(null);
        return;
      }
    }

    updateRule(childRuleIndex, {
      triggerType: "keyword",
      triggerValue: "unlinked",
    });
    setActiveConnectPort(null);
  };

  // Delete button from a message card
  const handleDeleteButton = (ruleIndex, buttonIndex, buttonId) => {
    const target = rules[ruleIndex];
    if (!target) return;
    const currentBtns = target.responseConfig?.buttons || [];
    const updatedButtons = currentBtns.filter((_, idx) => idx !== buttonIndex);

    if (activeConnectPort?.buttonId === buttonId) {
      setActiveConnectPort(null);
    }

    if (buttonId) {
      const child = buttonMap[buttonId.trim()];
      if (child) {
        handleDisconnectButton(buttonId, child.index);
      }
    }

    updateRule(ruleIndex, {
      responseConfig: {
        ...(target.responseConfig || {}),
        buttons: updatedButtons,
      },
    });
  };

  // Delete list row from a message card
  const handleDeleteRow = (ruleIndex, rowIndex, rowId) => {
    const target = rules[ruleIndex];
    if (!target) return;
    const sections = target.responseConfig?.sections || [];
    const currentRows = sections[0]?.rows || [];
    const updatedRows = currentRows.filter((_, idx) => idx !== rowIndex);

    if (activeConnectPort?.buttonId === rowId) {
      setActiveConnectPort(null);
    }

    if (rowId) {
      const child = buttonMap[rowId.trim()];
      if (child) {
        handleDisconnectButton(rowId, child.index);
      }
    }

    const updatedSections = [{ ...(sections[0] || {}), rows: updatedRows }];
    updateRule(ruleIndex, {
      responseConfig: {
        ...(target.responseConfig || {}),
        sections: updatedSections,
      },
    });
  };

  // Create a brand-new child branch card for a button
  const handleCreateChildBranch = (buttonTitle, buttonId, parentRuleIndex = rootIndex) => {
    const safeTitle = (buttonTitle || "Option").trim();
    const safeId = buttonId || `btn_${Date.now()}`;

    const newRule = {
      name: `Branch: ${safeTitle}`,
      triggerType: "button_press",
      triggerValue: safeId,
      matchMode: "exact",
      responseType: "button",
      responseConfig: {
        _type: "button",
        body: `Here are the details for *${safeTitle}*:\n\nSelect an option below to proceed:`,
        buttons: [
          { id: `sub_cont_${Date.now()}`, title: "Continue" },
          { id: `sub_back_${Date.now()}`, title: "Back to services" },
        ],
      },
      enabled: true,
      priority: rules.length,
    };

    update("rules", [...rules, newRule]);
    setActiveConnectPort(null);
  };

  // Add a button to a node (WITHOUT creating any new message card!)
  const handleAddButtonToNode = (ruleIndex) => {
    const target = rules[ruleIndex];
    if (!target) return;
    const currentBtns = target.responseConfig?.buttons || [];
    if (currentBtns.length >= 3) return;

    const num = currentBtns.length + 1;
    const btnId = `btn_${Date.now()}_${num}`;
    const btnTitle = `Button ${num}`;

    const updatedButtons = [...currentBtns, { id: btnId, title: btnTitle }];
    updateRule(ruleIndex, {
      responseType: "button",
      responseConfig: {
        ...(target.responseConfig || {}),
        _type: "button",
        body: target.responseConfig?.body || target.responseConfig?.text || "Select an option below:",
        buttons: updatedButtons,
      },
    });
    // NOTE: Does NOT spawn a new card! Only adds the button to this message.
  };

  // Add Content to a node
  const handleAddContent = (ruleIndex) => {
    const target = rules[ruleIndex];
    if (!target) return;
    const currentText = target.responseConfig?.body || target.responseConfig?.text || "";
    updateRuleResponse(ruleIndex, {
      body: currentText ? `${currentText}\n\n• Additional helpful information...` : "Additional helpful information...",
    });
  };

  // Add a brand-new message node to canvas
  const handleAddMessageNode = () => {
    const newIdx = rules.length;
    const newRule = {
      name: `Message ${newIdx + 1}`,
      triggerType: "keyword",
      triggerValue: "help, support",
      matchMode: "contains",
      responseType: "button",
      responseConfig: {
        _type: "button",
        body: "Hello! How can we assist you today?",
        buttons: [
          { id: `btn_${Date.now()}_1`, title: "Option 1" },
          { id: `btn_${Date.now()}_2`, title: "Option 2" },
        ],
      },
      enabled: true,
      priority: newIdx,
    };

    setNodePositions((prev) => ({
      ...prev,
      [`rule_${newIdx}`]: { x: 920, y: 150 + newIdx * 80 },
    }));

    update("rules", [...rules, newRule]);
  };

  // Delete node
  const handleDeleteNode = (ruleIndex) => {
    if (ruleIndex === rootIndex) {
      alert("The Flow Start / Welcome node cannot be deleted, but you can edit its messages.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this message node?")) return;

    // Disconnect any buttons belonging to this node
    const deletedRule = rules[ruleIndex];
    const buttons = deletedRule?.responseConfig?.buttons || [];
    buttons.forEach((btn) => {
      if (btn.id) {
        const child = buttonMap[btn.id.trim()];
        if (child) {
          handleDisconnectButton(btn.id, child.index);
        }
      }
    });

    update("rules", rules.filter((_, idx) => idx !== ruleIndex));
  };

  // Active / Inactive global toggle
  const handleToggleGlobalActive = () => {
    const nextState = !flowActive;
    setFlowActive(nextState);
    const updated = rules.map((r) => ({ ...r, enabled: nextState }));
    update("rules", updated);
  };

  // Calculate connection bezier paths with distinct starting point per button
  const connectionPaths = useMemo(() => {
    const paths = [];

    // Path 1: Flow Start to Root Welcome Message
    const startPos = nodePositions["flow_start"];
    const rootPos = nodePositions[`rule_${rootIndex}`];
    if (startPos && rootPos) {
      const x1 = startPos.x + 300;
      const y1 = startPos.y + 110;
      const x2 = rootPos.x;
      const y2 = rootPos.y + 90;
      const dx = Math.max(60, Math.abs(x2 - x1) * 0.45);
      paths.push({
        id: "start_to_root",
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        color: "#059669",
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2,
      });
    }

    // Paths from buttons/rows to child rules
    rules.forEach((rule, rIdx) => {
      const parentPos = nodePositions[`rule_${rIdx}`];
      if (!parentPos) return;

      const buttons = rule.responseConfig?.buttons || [];
      const rows = rule.responseConfig?.sections?.[0]?.rows || [];
      const isList = rule.responseType === "list" || rows.length > 0;
      const allItems = [...buttons, ...rows];

      allItems.forEach((item, itemIdx) => {
        const itemId = item.id?.trim();
        const child = itemId ? buttonMap[itemId] : null;
        if (child) {
          const childPos = nodePositions[`rule_${child.index}`];
          if (childPos) {
            // Anchor point strictly at the right edge of that specific button's row
            const x1 = parentPos.x + 300;
            const y1 = isList
              ? parentPos.y + 245 + itemIdx * 52
              : parentPos.y + 265 + itemIdx * 50;

            const x2 = childPos.x;
            const y2 = childPos.y + 90;
            const dx = Math.max(80, Math.abs(x2 - x1) * 0.48);

            paths.push({
              id: `${rIdx}_${itemId}_${child.index}`,
              d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
              color: BUTTON_COLORS[itemIdx % BUTTON_COLORS.length],
              midX: (x1 + x2) / 2,
              midY: (y1 + y2) / 2,
            });
          }
        }
      });
    });

    return paths;
  }, [nodePositions, rootIndex, rules, buttonMap]);

  return (
    <div
      className={`flex flex-col w-full bg-[#f8fafc] dark:bg-[#0b0c10] shadow-2xl overflow-hidden select-none font-sans transition-all duration-300 ${
        isExpanded
          ? "fixed inset-0 z-50 h-screen w-screen rounded-none border-0"
          : "relative h-[840px] max-h-[85vh] rounded-2xl border border-zinc-300 dark:border-zinc-800"
      }`}
    >
      {/* ───── Top Floating Controls Header ───── */}
      <div className="absolute top-4 left-4 right-4 z-30 flex flex-wrap items-center justify-between pointer-events-none gap-3">
        {/* Left: Info / Quick Actions */}
        <div className="flex items-center gap-2 pointer-events-auto bg-white/95 dark:bg-[#14151b]/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-lg">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
            <Workflow className="h-4 w-4" />
          </span>
          <div className="leading-tight pr-2">
            <span className="block text-xs font-bold text-zinc-800 dark:text-zinc-100">
              Visual Flow Designer
            </span>
            <span className="text-[10px] text-zinc-500">
              {rules.length} Flow Nodes · {connectionPaths.length} Active Connections
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenAiModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 active:scale-95 transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Flow Generator
          </button>

          <button
            type="button"
            onClick={handleAddMessageNode}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Message Node
          </button>

          <button
            type="button"
            onClick={onSwitchToList}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition"
            title="Switch to List view"
          >
            <List className="h-3.5 w-3.5" />
            List View
          </button>
        </div>

        {/* Right: Active/Inactive Toggle + Canvas Navigation Toolbar */}
        <div className="flex items-center gap-2.5 pointer-events-auto">
          {/* Expand Canvas Button */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold shadow-lg transition backdrop-blur-md ${
              isExpanded
                ? "bg-amber-500 text-black border-amber-400 hover:bg-amber-400"
                : "bg-white/95 dark:bg-[#14151b]/95 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100"
            }`}
            title={isExpanded ? "Exit Fullscreen (ESC)" : "Expand Canvas View for proper editing"}
          >
            {isExpanded ? (
              <>
                <Minimize2 className="h-4 w-4" />
                Exit Fullscreen
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4 text-emerald-600" />
                Expand Canvas
              </>
            )}
          </button>

          {/* Active / Inactive Pill Switch (Matching Screenshot) */}
          <div className="flex items-center gap-2.5 bg-white/95 dark:bg-[#14151b]/95 backdrop-blur-md px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-lg">
            <span
              className={`text-xs font-semibold ${
                !flowActive ? "text-zinc-800 dark:text-zinc-100" : "text-zinc-400"
              }`}
            >
              Inactive
            </span>
            <button
              type="button"
              onClick={handleToggleGlobalActive}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                flowActive ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  flowActive ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <span
              className={`text-xs font-semibold ${
                flowActive ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"
              }`}
            >
              Active
            </span>
          </div>

          {/* Canvas Zoom & Lock Toolbar (Matching Screenshot) */}
          <div className="flex items-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#14151b]/95 backdrop-blur-md p-1 shadow-lg divide-x divide-zinc-200 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
            <button
              type="button"
              onClick={() => handleZoom(0.08)}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-l-lg transition active:scale-95"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <span className="px-2 text-[11px] font-semibold tabular-nums text-zinc-600 dark:text-zinc-300 select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => handleZoom(-0.08)}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95"
              title="Fit to screen"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsLocked((v) => !v)}
              className={`p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-r-lg transition ${
                isLocked ? "text-emerald-500 font-bold" : ""
              }`}
              title={isLocked ? "Unlock Canvas" : "Lock Canvas"}
            >
              {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Connecting banner notification when a port is active */}
      {activeConnectPort && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-emerald-700 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-pulse">
          <LinkIcon className="h-4 w-4" />
          <span>Connecting "{activeConnectPort.buttonTitle}" — click any message card to connect, or select from menu</span>
          <button
            type="button"
            onClick={() => setActiveConnectPort(null)}
            className="ml-1 bg-black/20 hover:bg-black/40 rounded-full p-1"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* ───── Interactive Infinite Canvas Area ───── */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`relative flex-1 w-full h-full cursor-${
          isPanning ? "grabbing" : isLocked ? "default" : "grab"
        } overflow-hidden`}
        style={{
          backgroundColor: "#f4f5f8",
          backgroundImage: "radial-gradient(#cbd5e1 1.2px, transparent 1.2px)",
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Transformable Canvas Surface */}
        <div
          className="absolute inset-0 pointer-events-auto"
          style={{
            width: "5000px",
            height: "4000px",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* SVG Connecting Curves Layer */}
          <svg className="absolute inset-0 w-[5000px] h-[4000px] pointer-events-none z-10 overflow-visible">
            {connectionPaths.map((path) => (
              <g key={path.id}>
                {/* Outer shadow glow line */}
                <path
                  d={path.d}
                  fill="none"
                  stroke={path.color}
                  strokeWidth="4"
                  strokeOpacity="0.18"
                />
                {/* Main dotted bezier curve matching screenshot */}
                <path
                  d={path.d}
                  fill="none"
                  stroke={path.color}
                  strokeWidth="2.5"
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                />
                {/* Diamond/Circle Junction Checkpoint */}
                <circle
                  cx={path.midX}
                  cy={path.midY}
                  r="4"
                  fill="#ffffff"
                  stroke={path.color}
                  strokeWidth="2.5"
                />
              </g>
            ))}
          </svg>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* NODE 1: FLOW START NODE (Green Outline, Exactly like Screenshot) */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {(() => {
            const pos = nodePositions["flow_start"] || { x: 40, y: 60 };
            return (
              <div
                className="flow-node-card absolute z-20 w-[300px] rounded-2xl bg-white border-2 border-emerald-600 shadow-xl shadow-emerald-950/10 overflow-hidden"
                style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
              >
                {/* Header (Green Header Pill) */}
                <div
                  onMouseDown={(e) => handleNodeDragStart("flow_start", e)}
                  className="flex items-center justify-between bg-emerald-700 px-3.5 py-2.5 text-white cursor-move"
                >
                  <div className="flex items-center gap-2">
                    <Workflow className="h-4 w-4" />
                    <span className="text-xs font-bold tracking-wide">Flow Start</span>
                  </div>
                  <ChevronDown className="h-4 w-4 opacity-80" />
                </div>

                {/* Body Content */}
                <div className="p-3.5 space-y-3 text-zinc-700">
                  {/* Keyword Input */}
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-500 block mb-1">
                      Type, press enter to add AI keyword
                    </label>
                    <input
                      type="text"
                      placeholder="Enter keywords"
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 outline-none focus:border-emerald-600 focus:bg-white transition"
                    />
                  </div>

                  {/* Regex Trigger */}
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-2.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[10px] text-zinc-500 leading-snug">
                        Enter regex to match substring trigger. Enable toggle for case sensitive regex.
                      </p>
                      <input type="checkbox" className="rounded text-emerald-600 mt-0.5" />
                    </div>
                    <input
                      type="text"
                      placeholder="Enter Regex"
                      className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 placeholder:text-zinc-400 outline-none focus:border-emerald-600"
                    />
                  </div>

                  {/* Template Starter Button */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-500 block">
                      Add upto 1 template to begin flow
                    </span>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-zinc-300 bg-white py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 shadow-sm transition"
                    >
                      Choose Template
                    </button>
                  </div>

                  {/* Meta Ads Starter Button */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-500 block">
                      Add upto 20 Meta Ads to begin flow
                    </span>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-zinc-300 bg-white py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 shadow-sm transition"
                    >
                      Choose Facebook Ad
                    </button>
                  </div>
                </div>

                {/* Right Output Connector Handle Dot */}
                <div
                  className="absolute right-[-7px] top-[110px] h-3.5 w-3.5 rounded-full border-2 border-emerald-600 bg-white shadow hover:scale-125 transition"
                  title="Connects to initial message"
                />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* ALL MESSAGE NODES (Matching Style of Screenshot) */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {rules.map((rule, index) => {
            const key = `rule_${index}`;
            const pos = nodePositions[key] || { x: 480 + (index % 3) * 440, y: 60 + Math.floor(index / 3) * 580 };
            const isRoot = index === rootIndex;
            const buttons = rule.responseConfig?.buttons || [];
            const rows = rule.responseConfig?.sections?.[0]?.rows || [];
            const isList = rule.responseType === "list" || rows.length > 0;
            const bodyText = rule.responseConfig?.body || rule.responseConfig?.text || "";

            return (
              <div
                key={key}
                onClick={() => {
                  // If active connect port is waiting for target card click
                  if (activeConnectPort && activeConnectPort.ruleIndex !== index) {
                    handleConnectButtonToRule(activeConnectPort.buttonId, index);
                  }
                }}
                className={`flow-node-card absolute z-20 w-[300px] rounded-2xl bg-white border shadow-xl shadow-zinc-400/20 overflow-visible transition-all ${
                  activeConnectPort && activeConnectPort.ruleIndex !== index
                    ? "border-emerald-500 ring-2 ring-emerald-500/50 cursor-pointer hover:scale-[1.02]"
                    : "border-zinc-300/90"
                }`}
                style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
              >
                {/* Left Input Connector Handle Dot (Except root) */}
                {!isRoot && (
                  <div
                    className="absolute left-[-7px] top-[90px] h-3.5 w-3.5 rounded-full border-2 border-emerald-600 bg-white shadow hover:scale-125 transition"
                    title="Input trigger connection"
                  />
                )}

                {/* Click to connect header banner */}
                {activeConnectPort && activeConnectPort.ruleIndex !== index && (
                  <div className="bg-emerald-600 text-white text-[11px] font-bold py-1 px-3 text-center rounded-t-2xl flex items-center justify-center gap-1.5 animate-pulse">
                    <LinkIcon className="h-3 w-3" />
                    Connect "{activeConnectPort.buttonTitle}" Here
                  </div>
                )}

                {/* Card Header (Message with Icon & Title) */}
                <div
                  onMouseDown={(e) => handleNodeDragStart(key, e)}
                  className="flex items-center justify-between border-b border-zinc-100 bg-[#f8fafc] px-3.5 py-2.5 cursor-move rounded-t-2xl"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="grid h-6 w-6 place-items-center rounded bg-emerald-500/15 text-emerald-600">
                      <MessageSquare className="h-3.5 w-3.5" />
                    </span>
                    <input
                      type="text"
                      value={rule.name || (isRoot ? "Welcome Message" : `Message ${index + 1}`)}
                      onChange={(e) => updateRule(index, { name: e.target.value })}
                      className="bg-transparent text-xs font-bold text-zinc-800 outline-none truncate border-b border-transparent focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => testRule(rule)}
                      className="p-1 text-zinc-400 hover:text-emerald-600 transition"
                      title="Test this node in live phone"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNode(index)}
                      className="p-1 text-zinc-400 hover:text-red-500 transition"
                      title="Delete node"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-3.5 space-y-3 text-zinc-700">
                  {/* AI Keyword Input or Connected Triggers */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-semibold text-zinc-500">
                        {rule.triggerType === "button_press"
                          ? "Connected Triggers / Button IDs"
                          : "Type, press enter to add AI keyword"}
                      </label>
                      {rule.triggerType === "button_press" && (
                        <span className="text-[9px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                          Button Connected
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder={
                        rule.triggerType === "button_press"
                          ? "Button IDs (comma-separated)"
                          : "Enter AI keywords"
                      }
                      value={rule.triggerValue || ""}
                      onChange={(e) => {
                        updateRule(index, {
                          triggerValue: e.target.value,
                        });
                      }}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 outline-none focus:border-emerald-500 focus:bg-white transition"
                    />
                  </div>

                  {/* Message Bubble Preview / Editor */}
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
                      <span className="font-semibold text-zinc-500">Message Text</span>
                      <span>{bodyText.length}/1024</span>
                    </div>
                    <textarea
                      rows={3}
                      value={bodyText}
                      onChange={(e) =>
                        updateRuleResponse(index, {
                          body: e.target.value,
                          text: e.target.value,
                        })
                      }
                      placeholder="Enter message text here..."
                      className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-800 leading-relaxed outline-none focus:border-emerald-500 transition resize-none"
                    />
                  </div>

                  {/* List Rows or Interactive Buttons (Matching Screenshot) */}
                  {isList && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-semibold text-zinc-500 block">
                        Service List Rows
                      </span>
                      {rows.map((row, rowIdx) => {
                        const child = row.id ? buttonMap[row.id.trim()] : null;
                        const isPortActive = activeConnectPort?.buttonId === row.id;
                        return (
                          <div
                            key={rowIdx}
                            className="relative flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs"
                          >
                            <div className="min-w-0 flex-1 pr-1">
                              <span className="font-semibold text-zinc-800 block truncate">
                                {row.title || `Service ${rowIdx + 1}`}
                              </span>
                              {row.description && (
                                <span className="text-[10px] text-zinc-400 block truncate">
                                  {row.description}
                                </span>
                              )}
                            </div>

                            {/* Direct Delete Row Icon */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRow(index, rowIdx, row.id);
                              }}
                              className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition shrink-0 ml-1"
                              title="Delete this row"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>

                            {/* Connector Handle Dot on Right */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveConnectPort(
                                  isPortActive
                                    ? null
                                    : {
                                        ruleIndex: index,
                                        buttonIndex: rowIdx,
                                        buttonId: row.id,
                                        buttonTitle: row.title,
                                        currentChildIndex: child?.index,
                                      }
                                );
                              }}
                              className={`absolute right-[-7px] top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-emerald-600 ${
                                child ? "bg-emerald-600" : "bg-white hover:scale-125 cursor-pointer"
                              } shadow`}
                              title={child ? `Connected to: ${child.rule.name} (Click to manage)` : "Click to connect to message"}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Interactive Reply Buttons (Matching Screenshot) */}
                  {!isList && (
                    <div className="space-y-2 pt-1">
                      {buttons.map((btn, btnIdx) => {
                        const child = btn.id ? buttonMap[btn.id.trim()] : null;
                        const isPortActive = activeConnectPort?.buttonId === btn.id;

                        return (
                          <div
                            key={btnIdx}
                            className={`relative flex items-center justify-between rounded-xl border bg-white p-2 text-xs shadow-sm transition ${
                              child ? "border-emerald-500/70" : "border-zinc-200 hover:border-emerald-500"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-2">
                              <GripVertical className="h-3.5 w-3.5 text-zinc-400 shrink-0 cursor-grab" />
                              <input
                                type="text"
                                maxLength={20}
                                value={btn.title || ""}
                                onChange={(e) => {
                                  const nextBtns = buttons.map((b, i) =>
                                    i === btnIdx ? { ...b, title: e.target.value } : b
                                  );
                                  updateRuleResponse(index, { buttons: nextBtns });
                                }}
                                className="w-full bg-transparent font-medium text-zinc-800 outline-none"
                                placeholder={`Button ${btnIdx + 1}`}
                              />
                            </div>
                            <span className="text-[10px] text-zinc-400 font-mono shrink-0">
                              {(btn.title || "").length}/20
                            </span>

                            {/* Direct Delete Button Icon */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteButton(index, btnIdx, btn.id);
                              }}
                              className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition shrink-0 ml-1"
                              title="Delete this button"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>

                            {/* Output Connector Port Dot on Right */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveConnectPort(
                                  isPortActive
                                    ? null
                                    : {
                                        ruleIndex: index,
                                        buttonIndex: btnIdx,
                                        buttonId: btn.id,
                                        buttonTitle: btn.title,
                                        currentChildIndex: child?.index,
                                      }
                                );
                              }}
                              className={`absolute right-[-7px] top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-emerald-600 ${
                                child ? "bg-emerald-600" : "bg-white hover:scale-125 cursor-pointer ring-2 ring-emerald-500/30"
                              } shadow`}
                              title={child ? `Connected to: ${child.rule.name} (Click to change/disconnect)` : "Click to connect to message"}
                            />

                            {/* Connection Manager Popover Dropdown */}
                            {isPortActive && (
                              <div
                                className="absolute left-[308px] top-[-30px] z-50 w-72 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#16161c] p-3 shadow-2xl text-left text-xs space-y-2.5 animate-[fadeIn_.15s_ease-out]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                                  <span className="font-bold text-zinc-800 dark:text-zinc-100 truncate pr-2">
                                    Connect "{btn.title || "Button"}"
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveConnectPort(null)}
                                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                {/* Current connection status */}
                                {child ? (
                                  <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-2 text-[11px] text-emerald-800 dark:text-emerald-300">
                                    <span className="truncate pr-1">
                                      Connected: <strong>{child.rule.name}</strong>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDisconnectButton(btn.id, child.index)}
                                      className="shrink-0 text-red-500 hover:text-red-700 dark:hover:text-red-400 font-semibold"
                                    >
                                      Disconnect
                                    </button>
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                    Connect this button to an existing message card, or create a new reply.
                                  </p>
                                )}

                                {/* Connect to Existing Message Cards */}
                                <div>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                                    Connect to Existing Message:
                                  </span>
                                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                                    {rules
                                      .map((r, rTargetIdx) => ({ r, rTargetIdx }))
                                      .filter(({ rTargetIdx }) => rTargetIdx !== index)
                                      .map(({ r, rTargetIdx }) => (
                                        <button
                                          key={rTargetIdx}
                                          type="button"
                                          onClick={() => handleConnectButtonToRule(btn.id, rTargetIdx)}
                                          className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                                            child?.index === rTargetIdx
                                              ? "bg-emerald-600 text-white font-semibold"
                                              : "bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                                          }`}
                                        >
                                          <span className="truncate pr-2">
                                            {r.name || `Message ${rTargetIdx + 1}`}
                                          </span>
                                          <span className="text-[10px] opacity-75 shrink-0">
                                            {child?.index === rTargetIdx ? "Current" : "Link"}
                                          </span>
                                        </button>
                                      ))}
                                  </div>
                                </div>

                                {/* Create New Reply Card */}
                                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                                  <button
                                    type="button"
                                    onClick={() => handleCreateChildBranch(btn.title, btn.id, index)}
                                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/10 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition"
                                  >
                                    <Plus className="h-3 w-3" />
                                    Create New Message Card
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {buttons.length < 3 && (
                        <button
                          type="button"
                          onClick={() => handleAddButtonToNode(index)}
                          className="w-full py-1.5 text-center text-xs font-semibold text-emerald-700 bg-emerald-50/60 border border-dashed border-emerald-300 rounded-xl hover:bg-emerald-100/70 transition"
                        >
                          + Add Button
                        </button>
                      )}
                    </div>
                  )}

                  {/* Delay & Timeout Toggles (Matching Screenshot) */}
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-2.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-zinc-600">Set Delay</span>
                      <input
                        type="checkbox"
                        checked={Boolean(rule.responseConfig?.delay)}
                        onChange={(e) =>
                          updateRuleResponse(index, { delay: e.target.checked ? "2" : null })
                        }
                        className="rounded text-emerald-600"
                      />
                    </div>
                    {rule.responseConfig?.delay && (
                      <input
                        type="text"
                        placeholder="Type delay in seconds..."
                        value={rule.responseConfig?.delay || ""}
                        onChange={(e) => updateRuleResponse(index, { delay: e.target.value })}
                        className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 outline-none"
                      />
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-medium text-zinc-600">Set Timeout</span>
                      <input
                        type="checkbox"
                        checked={Boolean(rule.responseConfig?.timeout)}
                        onChange={(e) =>
                          updateRuleResponse(index, { timeout: e.target.checked ? "30" : null })
                        }
                        className="rounded text-emerald-600"
                      />
                    </div>
                  </div>

                  {/* Add Content Button (Matching Screenshot) */}
                  <button
                    type="button"
                    onClick={() => handleAddContent(index)}
                    className="w-full py-1.5 text-center text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition"
                  >
                    + Add Content
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
