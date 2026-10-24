// import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
// import {
//   Sparkles,
//   GitBranch,
//   Plus,
//   Trash2,
//   Copy,
//   Eye,
//   Check,
//   ChevronDown,
//   ChevronRight,
//   ChevronLeft,
//   MessageSquare,
//   CornerDownRight,
//   ArrowRight,
//   ExternalLink,
//   Layers,
//   HelpCircle,
//   FileText,
//   MousePointer,
//   Hash,
//   Smile,
//   AlertCircle,
//   ToggleLeft,
//   ToggleRight,
//   Link as LinkIcon,
//   Unlink,
//   Edit2,
//   Workflow,
//   List,
//   ZoomIn,
//   ZoomOut,
//   Maximize2,
//   Minimize2,
//   Lock,
//   Unlock,
//   Move,
//   GripVertical,
//   Clock,
//   Send,
//   MoreVertical,
//   X,
//   Image as ImageIcon,
//   Video,
//   Globe,
//   Sliders,
//   CheckCircle2,
//   Radio,
//   Paperclip,
// } from "lucide-react";

// const BUTTON_COLORS = [
//   "#059669", // Emerald
//   "#0284c7", // Sky Blue
//   "#7c3aed", // Violet
//   "#d97706", // Amber
//   "#db2777", // Rose
// ];

// const PRESET_MEDIA_SAMPLES = [
//   {
//     label: "Solar Rooftop Banner",
//     kind: "image",
//     url: "https://images.unsplash.com/photo-1509391365360-2e959784a276?w=800",
//     caption: "☀️ Here are our residential & commercial solar solutions with up to 40% government subsidy:",
//   },
//   {
//     label: "Customer Support Flyer",
//     kind: "image",
//     url: "https://images.unsplash.com/photo-1534536281715-e28d76689b4d?w=800",
//     caption: "🤝 Our solar advisory team is available Monday to Saturday to guide you through registration.",
//   },
//   {
//     label: "Solar Catalogue (PDF link)",
//     kind: "document",
//     url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
//     caption: "📄 Complete Solar Subsidy Guide & Application Steps (PDF Document):",
//   },
// ];

// // Helper to reliably check if a rule has an attached image/media
// function getRuleMediaInfo(rule) {
//   if (!rule) return { hasMedia: false, url: "", kind: "none" };
//   const resp = rule.responseConfig || {};

//   // 1. Pure media message
//   if (rule.responseType === "media") {
//     const url = resp.url || "";
//     return {
//       hasMedia: Boolean(url && String(url).trim().length > 0),
//       url,
//       kind: resp.mediaType || "image",
//     };
//   }

//   // 2. Attachment on any message (button, list, text, cta_url)
//   const att = resp.attachment;
//   if (att && att.kind && att.kind !== "none") {
//     const url = att.url || "";
//     return {
//       hasMedia: Boolean(url && String(url).trim().length > 0),
//       url,
//       kind: att.kind,
//     };
//   }

//   // 3. headerMedia on interactive button/cta
//   if (resp.headerMedia) {
//     const url = resp.headerMedia.url || "";
//     const kind = resp.headerMedia.type || "image";
//     return {
//       hasMedia: Boolean(url && String(url).trim().length > 0),
//       url,
//       kind,
//     };
//   }

//   // 4. In case rule.responseConfig has direct url even if not media responseType
//   if (resp.url && typeof resp.url === "string" && resp.url.startsWith("http")) {
//     return {
//       hasMedia: true,
//       url: resp.url,
//       kind: resp.mediaType || "image",
//     };
//   }

//   return { hasMedia: false, url: "", kind: "none" };
// }

// export default function VisualFlowBuilder({
//   config,
//   update,
//   updateRule,
//   updateRuleResponse,
//   testRule,
//   onOpenAiModal,
//   onSwitchToList,
// }) {
//   const containerRef = useRef(null);
//   const [zoom, setZoom] = useState(0.85);
//   const [pan, setPan] = useState({ x: 60, y: 50 });
//   const [isPanning, setIsPanning] = useState(false);
//   const [startPan, setStartPan] = useState({ x: 0, y: 0 });
//   const [isLocked, setIsLocked] = useState(false);
//   const [isExpanded, setIsExpanded] = useState(false);
//   const [draggedNode, setDraggedNode] = useState(null);
//   const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
//   const [nodePositions, setNodePositions] = useState({});
//   const [flowActive, setFlowActive] = useState(true);
//   const [activeConnectPort, setActiveConnectPort] = useState(null);
//   const [selectedRuleIndex, setSelectedRuleIndex] = useState(null);
//   const [newTypeDropdownOpen, setNewTypeDropdownOpen] = useState(false);

//   // Active rules
//   const rules = useMemo(() => (Array.isArray(config.rules) ? config.rules : []), [config.rules]);

//   // Identify Start / Root Node
//   const rootIndex = useMemo(() => {
//     const idx = rules.findIndex((r) => r.triggerType === "first_message");
//     return idx !== -1 ? idx : 0;
//   }, [rules]);

//   const rootRule = rules[rootIndex];

//   // Map button IDs to their child rule indices (supports comma-separated triggers)
//   const buttonMap = useMemo(() => {
//     const map = {};
//     rules.forEach((rule, idx) => {
//       if (
//         idx !== rootIndex &&
//         (rule.triggerType === "button_press" || rule.triggerType === "list_row") &&
//         rule.triggerValue
//       ) {
//         const ids = String(rule.triggerValue)
//           .split(",")
//           .map((s) => s.trim())
//           .filter(Boolean);
//         ids.forEach((id) => {
//           map[id] = { rule, index: idx };
//         });
//       }
//     });
//     return map;
//   }, [rules, rootIndex]);

//   // Escape key closes expanded view, popover, or side panel
//   useEffect(() => {
//     const onKeyDown = (e) => {
//       if (e.key === "Escape") {
//         if (activeConnectPort) setActiveConnectPort(null);
//         else if (selectedRuleIndex !== null) setSelectedRuleIndex(null);
//         else if (isExpanded) setIsExpanded(false);
//       }
//     };
//     window.addEventListener("keydown", onKeyDown);
//     return () => window.removeEventListener("keydown", onKeyDown);
//   }, [isExpanded, activeConnectPort, selectedRuleIndex]);

//   // Default non-overlapping coordinate layout generator
//   useEffect(() => {
//     setNodePositions((prev) => {
//       const next = { ...prev };
//       const CARD_W = 310;
//       const CARD_H = 500;
//       const COL_GAP = 140;
//       const ROW_GAP = 60;

//       const col0X = 40;
//       const col1X = col0X + CARD_W + COL_GAP; // 490
//       const col2X = col1X + CARD_W + COL_GAP; // 940
//       const col3X = col2X + CARD_W + COL_GAP; // 1390

//       // Flow start node
//       if (!next["flow_start"]) {
//         next["flow_start"] = { x: col0X, y: 60 };
//       }
//       // Root message node
//       if (!next[`rule_${rootIndex}`]) {
//         next[`rule_${rootIndex}`] = { x: col1X, y: 60 };
//       }

//       // Branch nodes positioning in tiers
//       const rootButtons = rootRule?.responseConfig?.buttons || [];
//       const rootSections = rootRule?.responseConfig?.sections?.[0]?.rows || [];
//       const allRootItems = [...rootButtons, ...rootSections];

//       let tier1CurrentY = 60;
//       let tier2CurrentY = 60;

//       allRootItems.forEach((btn) => {
//         const child = buttonMap[btn.id?.trim()];
//         if (child) {
//           const key = `rule_${child.index}`;
//           if (!next[key]) {
//             next[key] = {
//               x: col2X,
//               y: tier1CurrentY,
//             };
//             tier1CurrentY += CARD_H + ROW_GAP;
//           }

//           // Check sub-branches
//           const subButtons = child.rule.responseConfig?.buttons || [];
//           const subRows = child.rule.responseConfig?.sections?.[0]?.rows || [];
//           const subItems = [...subButtons, ...subRows];
//           subItems.forEach((subBtn) => {
//             const grandChild = buttonMap[subBtn.id?.trim()];
//             if (grandChild) {
//               const subKey = `rule_${grandChild.index}`;
//               if (!next[subKey]) {
//                 next[subKey] = {
//                   x: col3X,
//                   y: tier2CurrentY,
//                 };
//                 tier2CurrentY += CARD_H + ROW_GAP;
//               }
//             }
//           });
//         }
//       });

//       // Place keyword / unlinked rules below in Col 2
//       const placed = new Set([
//         rootIndex,
//         ...Object.values(buttonMap).map((b) => b.index),
//       ]);

//       rules.forEach((_, idx) => {
//         if (!placed.has(idx)) {
//           const key = `rule_${idx}`;
//           if (!next[key]) {
//             next[key] = {
//               x: col2X,
//               y: tier1CurrentY,
//             };
//             tier1CurrentY += CARD_H + ROW_GAP;
//           }
//         }
//       });

//       // Anti-collision pass: ensure no cards in the same column overlap
//       const keys = Object.keys(next);
//       for (let i = 0; i < keys.length; i++) {
//         for (let j = 0; j < keys.length; j++) {
//           if (i === j) continue;
//           const kA = keys[i];
//           const kB = keys[j];
//           const pA = next[kA];
//           const pB = next[kB];
//           if (!pA || !pB) continue;

//           // If in the same horizontal column
//           const inSameCol = Math.abs(pA.x - pB.x) < CARD_W + 40;
//           if (inSameCol) {
//             // If overlapping vertically
//             if (pB.y >= pA.y && pB.y < pA.y + CARD_H + ROW_GAP) {
//               next[kB] = { ...pB, y: pA.y + CARD_H + ROW_GAP };
//             }
//           }
//         }
//       }

//       return next;
//     });
//   }, [rules, rootIndex, rootRule, buttonMap]);

//   // Wheel zoom listener centered on cursor with controlled, smooth sensitivity
//   useEffect(() => {
//     const el = containerRef.current;
//     if (!el) return;

//     const onWheel = (e) => {
//       e.preventDefault();
//       const clampedDelta = Math.max(-30, Math.min(30, e.deltaY));
//       const zoomFactor = 1 - clampedDelta * 0.0015;

//       setZoom((prevZoom) => {
//         const nextZoom = Math.min(2.0, Math.max(0.3, Number((prevZoom * zoomFactor).toFixed(3))));
//         if (Math.abs(nextZoom - prevZoom) < 0.001) return prevZoom;

//         const rect = el.getBoundingClientRect();
//         const mouseX = e.clientX - rect.left;
//         const mouseY = e.clientY - rect.top;

//         setPan((prevPan) => ({
//           x: Math.round(mouseX - (mouseX - prevPan.x) * (nextZoom / prevZoom)),
//           y: Math.round(mouseY - (mouseY - prevPan.y) * (nextZoom / prevZoom)),
//         }));

//         return nextZoom;
//       });
//     };

//     el.addEventListener("wheel", onWheel, { passive: false });
//     return () => el.removeEventListener("wheel", onWheel);
//   }, []);

//   // Pan handlers
//   const handleMouseDown = (e) => {
//     if (isLocked) return;
//     if (e.target.closest(".flow-node-card") || e.target.closest("button") || e.target.closest("input") || e.target.closest("textarea") || e.target.closest("aside")) {
//       return;
//     }
//     setIsPanning(true);
//     setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
//   };

//   const handleMouseMove = (e) => {
//     if (isPanning) {
//       setPan({
//         x: Math.round(e.clientX - startPan.x),
//         y: Math.round(e.clientY - startPan.y),
//       });
//     } else if (draggedNode) {
//       const zoomVal = zoom || 1;
//       const newX = Math.round((e.clientX - dragOffset.x - pan.x) / zoomVal);
//       const newY = Math.round((e.clientY - dragOffset.y - pan.y) / zoomVal);
//       setNodePositions((prev) => ({
//         ...prev,
//         [draggedNode]: { x: Math.max(0, newX), y: Math.max(0, newY) },
//       }));
//     }
//   };

//   const handleMouseUp = () => {
//     setIsPanning(false);
//     setDraggedNode(null);
//   };

//   const handleNodeDragStart = (nodeKey, e) => {
//     e.stopPropagation();
//     if (isLocked) return;
//     const current = nodePositions[nodeKey] || { x: 0, y: 0 };
//     const zoomVal = zoom || 1;
//     setDraggedNode(nodeKey);
//     setDragOffset({
//       x: e.clientX - (current.x * zoomVal + pan.x),
//       y: e.clientY - (current.y * zoomVal + pan.y),
//     });
//   };

//   // Zoom controls
//   const handleZoom = (delta) => {
//     setZoom((prevZoom) => {
//       const nextZoom = Math.min(2.0, Math.max(0.3, Number((prevZoom + delta).toFixed(2))));
//       const el = containerRef.current;
//       if (el) {
//         const rect = el.getBoundingClientRect();
//         const centerX = rect.width / 2;
//         const centerY = rect.height / 2;
//         setPan((prevPan) => ({
//           x: Math.round(centerX - (centerX - prevPan.x) * (nextZoom / prevZoom)),
//           y: Math.round(centerY - (centerY - prevPan.y) * (nextZoom / prevZoom)),
//         }));
//       }
//       return nextZoom;
//     });
//   };

//   const handleResetView = () => {
//     setZoom(0.85);
//     setPan({ x: 60, y: 50 });
//   };

//   // Connect a button to an EXISTING message card (supports many-to-one connections)
//   const handleConnectButtonToRule = (buttonId, targetRuleIndex) => {
//     if (!buttonId || targetRuleIndex == null) return;
//     const targetRule = rules[targetRuleIndex];
//     if (!targetRule) return;

//     const trimmedId = buttonId.trim();

//     // 1. If this button was previously connected to another card, clean it up from that card
//     const previousChild = buttonMap[trimmedId];
//     if (previousChild && previousChild.index !== targetRuleIndex) {
//       const oldRule = rules[previousChild.index];
//       if (oldRule && oldRule.triggerValue) {
//         const remainingOldIds = String(oldRule.triggerValue)
//           .split(",")
//           .map((s) => s.trim())
//           .filter((id) => id && id !== trimmedId);
//         if (remainingOldIds.length > 0) {
//           updateRule(previousChild.index, {
//             triggerValue: remainingOldIds.join(", "),
//           });
//         } else {
//           updateRule(previousChild.index, {
//             triggerType: "keyword",
//             triggerValue: "unlinked",
//           });
//         }
//       }
//     }

//     // 2. Append this buttonId to targetRule's triggerValue (comma-separated, no duplicates)
//     let updatedTriggers = trimmedId;
//     if (targetRule.triggerType === "button_press" && targetRule.triggerValue) {
//       const existingIds = String(targetRule.triggerValue)
//         .split(",")
//         .map((s) => s.trim())
//         .filter(Boolean);
//       if (!existingIds.includes(trimmedId)) {
//         existingIds.push(trimmedId);
//       }
//       updatedTriggers = existingIds.join(", ");
//     }

//     updateRule(targetRuleIndex, {
//       triggerType: "button_press",
//       triggerValue: updatedTriggers,
//     });
//     setActiveConnectPort(null);
//   };

//   // Disconnect button from a child message card
//   const handleDisconnectButton = (buttonId, childRuleIndex) => {
//     if (childRuleIndex == null) return;
//     const targetRule = rules[childRuleIndex];
//     if (!targetRule) return;

//     const trimmedId = buttonId?.trim();
//     if (trimmedId && targetRule.triggerValue) {
//       const existingIds = String(targetRule.triggerValue)
//         .split(",")
//         .map((s) => s.trim())
//         .filter(Boolean);
//       const remainingIds = existingIds.filter((id) => id !== trimmedId);

//       if (remainingIds.length > 0) {
//         // Keep other buttons connected to this card!
//         updateRule(childRuleIndex, {
//           triggerValue: remainingIds.join(", "),
//         });
//         setActiveConnectPort(null);
//         return;
//       }
//     }

//     updateRule(childRuleIndex, {
//       triggerType: "keyword",
//       triggerValue: "unlinked",
//     });
//     setActiveConnectPort(null);
//   };

//   // Update Attachment on any message format (image, video, document, link)
//   const handleUpdateAttachment = (ruleIndex, kind, url) => {
//     const target = rules[ruleIndex];
//     if (!target) return;
//     const curResp = target.responseConfig || {};

//     if (!kind || kind === "none") {
//       updateRuleResponse(ruleIndex, {
//         attachment: { kind: "none", url: "" },
//         headerMedia: null,
//       });
//       return;
//     }

//     const updatedAttachment = { kind, url: url || "" };
//     const updatedHeaderMedia = kind !== "link" ? { type: kind, url: url || "" } : null;

//     updateRuleResponse(ruleIndex, {
//       attachment: updatedAttachment,
//       ...(updatedHeaderMedia ? { headerMedia: updatedHeaderMedia } : {}),
//     });
//   };

//   // Switch response type for a node (buttons, list, media, link, text)
//   const handleSwitchResponseType = (ruleIndex, newType) => {
//     const target = rules[ruleIndex];
//     if (!target) return;
//     const currentResp = target.responseConfig || {};
//     const bodyText =
//       currentResp.body ||
//       currentResp.text ||
//       currentResp.caption ||
//       "Select an option below:";

//     let updatedConfig = { ...currentResp, _type: newType, body: bodyText, text: bodyText };

//     if (newType === "button") {
//       const existingBtns = currentResp.buttons || [];
//       updatedConfig.buttons = existingBtns.length
//         ? existingBtns
//         : [
//             { id: `btn_${Date.now()}_1`, title: "Option 1" },
//             { id: `btn_${Date.now()}_2`, title: "Option 2" },
//           ];
//     } else if (newType === "list") {
//       const existingRows = currentResp.sections?.[0]?.rows || [];
//       updatedConfig.buttonLabel = currentResp.buttonLabel || "View Options";
//       updatedConfig.sections = [
//         {
//           title: currentResp.sections?.[0]?.title || "Services",
//           rows: existingRows.length
//             ? existingRows
//             : [
//                 { id: `row_${Date.now()}_1`, title: "Service 1", description: "Details about service 1" },
//                 { id: `row_${Date.now()}_2`, title: "Service 2", description: "Details about service 2" },
//               ],
//         },
//       ];
//     } else if (newType === "media") {
//       updatedConfig.mediaType = currentResp.mediaType || "image";
//       updatedConfig.url =
//         currentResp.url ||
//         currentResp.attachment?.url ||
//         "https://images.unsplash.com/photo-1509391365360-2e959784a276?w=800";
//       updatedConfig.caption = bodyText;
//     } else if (newType === "cta_url") {
//       const linkTitle = currentResp.displayText || currentResp.button?.title || "Visit Website";
//       const linkUrl = currentResp.url || currentResp.button?.url || "https://example.com";
//       updatedConfig.displayText = linkTitle;
//       updatedConfig.url = linkUrl;
//       updatedConfig.button = { title: linkTitle, url: linkUrl };
//     } else if (newType === "text") {
//       updatedConfig.text = bodyText;
//     }

//     updateRule(ruleIndex, {
//       responseType: newType,
//       responseConfig: updatedConfig,
//     });
//   };

//   // Delete button from a message card
//   const handleDeleteButton = (ruleIndex, buttonIndex, buttonId) => {
//     const target = rules[ruleIndex];
//     if (!target) return;
//     const currentBtns = target.responseConfig?.buttons || [];
//     const updatedButtons = currentBtns.filter((_, idx) => idx !== buttonIndex);

//     if (activeConnectPort?.buttonId === buttonId) {
//       setActiveConnectPort(null);
//     }

//     if (buttonId) {
//       const child = buttonMap[buttonId.trim()];
//       if (child) {
//         handleDisconnectButton(buttonId, child.index);
//       }
//     }

//     updateRule(ruleIndex, {
//       responseConfig: {
//         ...(target.responseConfig || {}),
//         buttons: updatedButtons,
//       },
//     });
//   };

//   // Delete list row from a message card
//   const handleDeleteRow = (ruleIndex, rowIndex, rowId) => {
//     const target = rules[ruleIndex];
//     if (!target) return;
//     const sections = target.responseConfig?.sections || [];
//     const currentRows = sections[0]?.rows || [];
//     const updatedRows = currentRows.filter((_, idx) => idx !== rowIndex);

//     if (activeConnectPort?.buttonId === rowId) {
//       setActiveConnectPort(null);
//     }

//     if (rowId) {
//       const child = buttonMap[rowId.trim()];
//       if (child) {
//         handleDisconnectButton(rowId, child.index);
//       }
//     }

//     const updatedSections = [{ ...(sections[0] || {}), rows: updatedRows }];
//     updateRule(ruleIndex, {
//       responseConfig: {
//         ...(target.responseConfig || {}),
//         sections: updatedSections,
//       },
//     });
//   };

//   // Add a button to a node (WITHOUT creating any new message card!)
//   const handleAddButtonToNode = (ruleIndex) => {
//     const target = rules[ruleIndex];
//     if (!target) return;
//     const currentBtns = target.responseConfig?.buttons || [];
//     if (currentBtns.length >= 3) return;

//     const num = currentBtns.length + 1;
//     const btnId = `btn_${Date.now()}_${num}`;
//     const btnTitle = `Button ${num}`;

//     const updatedButtons = [...currentBtns, { id: btnId, title: btnTitle }];
//     updateRule(ruleIndex, {
//       responseType: "button",
//       responseConfig: {
//         ...(target.responseConfig || {}),
//         _type: "button",
//         body: target.responseConfig?.body || target.responseConfig?.text || "Select an option below:",
//         buttons: updatedButtons,
//       },
//     });
//   };

//   // Add a list row to a node
//   const handleAddRowToNode = (ruleIndex) => {
//     const target = rules[ruleIndex];
//     if (!target) return;
//     const sections = target.responseConfig?.sections || [];
//     const currentRows = sections[0]?.rows || [];
//     if (currentRows.length >= 10) return;

//     const num = currentRows.length + 1;
//     const rowId = `row_${Date.now()}_${num}`;
//     const rowTitle = `Option ${num}`;

//     const updatedRows = [...currentRows, { id: rowId, title: rowTitle, description: "" }];
//     const updatedSections = [{ title: sections[0]?.title || "Services", rows: updatedRows }];
//     updateRule(ruleIndex, {
//       responseType: "list",
//       responseConfig: {
//         ...(target.responseConfig || {}),
//         _type: "list",
//         body: target.responseConfig?.body || target.responseConfig?.text || "Select an option from the menu:",
//         buttonLabel: target.responseConfig?.buttonLabel || "View Options",
//         sections: updatedSections,
//       },
//     });
//   };

//   // Create a brand-new child branch card for a button
//   const handleCreateChildBranch = (buttonTitle, buttonId, parentRuleIndex = rootIndex) => {
//     const safeTitle = (buttonTitle || "Option").trim();
//     const safeId = buttonId || `btn_${Date.now()}`;

//     const newRule = {
//       name: `Branch: ${safeTitle}`,
//       triggerType: "button_press",
//       triggerValue: safeId,
//       matchMode: "exact",
//       responseType: "button",
//       responseConfig: {
//         _type: "button",
//         body: `Here are the details for *${safeTitle}*:\n\nSelect an option below to proceed:`,
//         buttons: [
//           { id: `sub_cont_${Date.now()}`, title: "Continue" },
//           { id: `sub_back_${Date.now()}`, title: "Back to services" },
//         ],
//       },
//       enabled: true,
//       priority: rules.length,
//     };

//     const newIdx = rules.length;
//     const parentPos = nodePositions[`rule_${parentRuleIndex}`] || { x: 480, y: 100 };
//     setNodePositions((prev) => ({
//       ...prev,
//       [`rule_${newIdx}`]: { x: parentPos.x + 440, y: parentPos.y + 30 },
//     }));

//     update("rules", [...rules, newRule]);
//     setActiveConnectPort(null);
//     setSelectedRuleIndex(newIdx);
//   };

//   // Add a brand-new message node to canvas
//   const handleAddMessageNode = (type = "button") => {
//     const newIdx = rules.length;
//     let initialConfig = {
//       _type: type,
//       body: "Hello! How can we assist you today?",
//       text: "Hello! How can we assist you today?",
//     };

//     if (type === "button") {
//       initialConfig.buttons = [
//         { id: `btn_${Date.now()}_1`, title: "Option 1" },
//         { id: `btn_${Date.now()}_2`, title: "Option 2" },
//       ];
//     } else if (type === "list") {
//       initialConfig.buttonLabel = "View Options";
//       initialConfig.sections = [
//         {
//           title: "Services",
//           rows: [
//             { id: `row_${Date.now()}_1`, title: "Service 1", description: "Details about service 1" },
//             { id: `row_${Date.now()}_2`, title: "Service 2", description: "Details about service 2" },
//           ],
//         },
//       ];
//     } else if (type === "media") {
//       initialConfig.mediaType = "image";
//       initialConfig.url = "https://images.unsplash.com/photo-1509391365360-2e959784a276?w=800";
//       initialConfig.caption = "☀️ Explore our solar subsidy & rooftop packages:";
//     } else if (type === "cta_url") {
//       initialConfig.displayText = "Visit Website";
//       initialConfig.url = "https://example.com";
//       initialConfig.button = { title: "Visit Website", url: "https://example.com" };
//     }

//     const newRule = {
//       name: `Message ${newIdx + 1}`,
//       triggerType: "keyword",
//       triggerValue: "help, info",
//       matchMode: "contains",
//       responseType: type,
//       responseConfig: initialConfig,
//       enabled: true,
//       priority: newIdx,
//     };

//     setNodePositions((prev) => ({
//       ...prev,
//       [`rule_${newIdx}`]: { x: 940, y: 120 + (newIdx % 4) * 110 },
//     }));

//     update("rules", [...rules, newRule]);
//     setSelectedRuleIndex(newIdx);
//     setNewTypeDropdownOpen(false);
//   };

//   // Duplicate a node
//   const handleDuplicateNode = (ruleIndex) => {
//     const src = rules[ruleIndex];
//     if (!src) return;
//     const newIdx = rules.length;
//     const clone = JSON.parse(JSON.stringify(src));
//     clone.name = `${src.name || `Message ${ruleIndex + 1}`} (Copy)`;
//     clone.priority = newIdx;

//     if (clone.responseConfig?.buttons) {
//       clone.responseConfig.buttons = clone.responseConfig.buttons.map((b, i) => ({
//         ...b,
//         id: `btn_${Date.now()}_${i + 1}`,
//       }));
//     }
//     if (clone.responseConfig?.sections?.[0]?.rows) {
//       clone.responseConfig.sections[0].rows = clone.responseConfig.sections[0].rows.map((r, i) => ({
//         ...r,
//         id: `row_${Date.now()}_${i + 1}`,
//       }));
//     }

//     const srcPos = nodePositions[`rule_${ruleIndex}`] || { x: 500, y: 100 };
//     setNodePositions((prev) => ({
//       ...prev,
//       [`rule_${newIdx}`]: { x: srcPos.x + 60, y: srcPos.y + 60 },
//     }));

//     update("rules", [...rules, clone]);
//     setSelectedRuleIndex(newIdx);
//   };

//   // Delete node
//   const handleDeleteNode = (ruleIndex) => {
//     if (ruleIndex === rootIndex) {
//       alert("The Flow Start / Welcome node cannot be deleted, but you can edit its messages.");
//       return;
//     }
//     if (!window.confirm("Are you sure you want to delete this message node?")) return;

//     // Disconnect any buttons belonging to this node
//     const deletedRule = rules[ruleIndex];
//     const buttons = deletedRule?.responseConfig?.buttons || [];
//     buttons.forEach((btn) => {
//       if (btn.id) {
//         const child = buttonMap[btn.id.trim()];
//         if (child) {
//           handleDisconnectButton(btn.id, child.index);
//         }
//       }
//     });

//     if (selectedRuleIndex === ruleIndex) {
//       setSelectedRuleIndex(null);
//     } else if (selectedRuleIndex > ruleIndex) {
//       setSelectedRuleIndex(selectedRuleIndex - 1);
//     }

//     update("rules", rules.filter((_, idx) => idx !== ruleIndex));
//   };

//   // Active / Inactive global toggle
//   const handleToggleGlobalActive = () => {
//     const nextState = !flowActive;
//     setFlowActive(nextState);
//     const updated = rules.map((r) => ({ ...r, enabled: nextState }));
//     update("rules", updated);
//   };

//   // Calculate connection bezier paths with distinct starting point per button/row
//   const connectionPaths = useMemo(() => {
//     const paths = [];

//     // Path 1: Flow Start to Root Welcome Message
//     const startPos = nodePositions["flow_start"];
//     const rootPos = nodePositions[`rule_${rootIndex}`];
//     if (startPos && rootPos) {
//       const x1 = startPos.x + 310;
//       const y1 = startPos.y + 110;
//       const x2 = rootPos.x;
//       const y2 = rootPos.y + 90;
//       const dx = Math.max(60, Math.abs(x2 - x1) * 0.45);
//       paths.push({
//         id: "start_to_root",
//         d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
//         color: "#059669",
//         midX: (x1 + x2) / 2,
//         midY: (y1 + y2) / 2,
//       });
//     }

//     // Paths from buttons/rows to child rules
//     rules.forEach((rule, rIdx) => {
//       const parentPos = nodePositions[`rule_${rIdx}`];
//       if (!parentPos) return;

//       const buttons = rule.responseConfig?.buttons || [];
//       const rows = rule.responseConfig?.sections?.[0]?.rows || [];
//       const isList = rule.responseType === "list" || rows.length > 0;
//       const allItems = [...buttons, ...rows];

//       allItems.forEach((item, itemIdx) => {
//         const itemId = item.id?.trim();
//         const child = itemId ? buttonMap[itemId] : null;
//         if (child) {
//           const childPos = nodePositions[`rule_${child.index}`];
//           if (childPos) {
//             const x1 = parentPos.x + 310;
//             const parentMedia = getRuleMediaInfo(rule);
//             const baseTop = parentMedia.hasMedia ? 220 : 120;
//             const y1 = isList
//               ? parentPos.y + baseTop + 30 + itemIdx * 44 + 20
//               : parentPos.y + baseTop + itemIdx * 42 + 20;

//             const x2 = childPos.x;
//             const y2 = childPos.y + 90;
//             const dx = Math.max(80, Math.abs(x2 - x1) * 0.48);

//             paths.push({
//               id: `${rIdx}_${itemId}_${child.index}`,
//               d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
//               color: BUTTON_COLORS[itemIdx % BUTTON_COLORS.length],
//               midX: (x1 + x2) / 2,
//               midY: (y1 + y2) / 2,
//             });
//           }
//         }
//       });
//     });

//     return paths;
//   }, [nodePositions, rootIndex, rules, buttonMap]);

//   const selectedRule = selectedRuleIndex !== null ? rules[selectedRuleIndex] : null;
//   const selectedMediaInfo = selectedRule ? getRuleMediaInfo(selectedRule) : { hasMedia: false, url: "", kind: "none" };
//   const currentAttachmentKind = selectedMediaInfo.kind || "none";

//   return (
//     <div
//       className={`flex flex-col w-full bg-[#f8fafc] dark:bg-[#0b0c10] shadow-2xl overflow-hidden select-none font-sans transition-all duration-300 ${
//         isExpanded
//           ? "fixed inset-0 z-50 h-screen w-screen rounded-none border-0"
//           : "relative h-[840px] max-h-[85vh] rounded-2xl border border-zinc-300 dark:border-zinc-800"
//       }`}
//     >
//       {/* ───── Top Floating Controls Header ───── */}
//       <div className="absolute top-4 left-4 right-4 z-30 flex flex-wrap items-center justify-between pointer-events-none gap-3">
//         {/* Left: Info / Quick Actions */}
//         <div className="flex items-center gap-2 pointer-events-auto bg-white/95 dark:bg-[#14151b]/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-lg">
//           <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
//             <Workflow className="h-4 w-4" />
//           </span>
//           <div className="leading-tight pr-2">
//             <div className="flex items-center gap-2">
//               <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
//                 Visual Flow Chart
//               </span>
//               <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
//                 {rules.length} Nodes
//               </span>
//             </div>
//             <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
//               Click any message card to open right editor
//             </p>
//           </div>

//           <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1" />

//           {/* AI Flow Generator */}
//           <button
//             type="button"
//             onClick={onOpenAiModal}
//             className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-950/20 transition active:scale-95"
//           >
//             <Sparkles className="h-3.5 w-3.5" />
//             AI Flow Generator
//           </button>

//           {/* Add Message Node with Types Dropdown */}
//           <div className="relative">
//             <button
//               type="button"
//               onClick={() => setNewTypeDropdownOpen((v) => !v)}
//               className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-black text-white text-xs font-semibold shadow-md transition"
//             >
//               <Plus className="h-3.5 w-3.5" />
//               Add Message
//               <ChevronDown className="h-3 w-3 opacity-70" />
//             </button>

//             {newTypeDropdownOpen && (
//               <div
//                 className="absolute left-0 top-full mt-1.5 w-48 rounded-xl bg-white dark:bg-[#181820] border border-zinc-200 dark:border-zinc-700 shadow-2xl p-1.5 z-50 text-xs space-y-0.5 animate-in fade-in"
//                 onClick={() => setNewTypeDropdownOpen(false)}
//               >
//                 <button
//                   type="button"
//                   onClick={() => handleAddMessageNode("button")}
//                   className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-zinc-700 dark:text-zinc-200 hover:text-emerald-700 text-left transition"
//                 >
//                   <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
//                   <span>Reply Buttons</span>
//                 </button>
//                 <button
//                   type="button"
//                   onClick={() => handleAddMessageNode("list")}
//                   className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-zinc-700 dark:text-zinc-200 hover:text-emerald-700 text-left transition"
//                 >
//                   <List className="h-3.5 w-3.5 text-blue-600" />
//                   <span>List Menu</span>
//                 </button>
//                 <button
//                   type="button"
//                   onClick={() => handleAddMessageNode("media")}
//                   className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-zinc-700 dark:text-zinc-200 hover:text-emerald-700 text-left transition"
//                 >
//                   <ImageIcon className="h-3.5 w-3.5 text-purple-600" />
//                   <span>Image / Media</span>
//                 </button>
//                 <button
//                   type="button"
//                   onClick={() => handleAddMessageNode("cta_url")}
//                   className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-zinc-700 dark:text-zinc-200 hover:text-emerald-700 text-left transition"
//                 >
//                   <Globe className="h-3.5 w-3.5 text-amber-600" />
//                   <span>Link / CTA URL</span>
//                 </button>
//                 <button
//                   type="button"
//                   onClick={() => handleAddMessageNode("text")}
//                   className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-zinc-700 dark:text-zinc-200 hover:text-emerald-700 text-left transition"
//                 >
//                   <FileText className="h-3.5 w-3.5 text-zinc-500" />
//                   <span>Text Message</span>
//                 </button>
//               </div>
//             )}
//           </div>

//           {/* Switch to List View */}
//           <button
//             type="button"
//             onClick={onSwitchToList}
//             className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium transition"
//             title="Switch to classic list view"
//           >
//             <List className="h-3.5 w-3.5" />
//             List
//           </button>
//         </div>

//         {/* Right: Zoom / Canvas Tools */}
//         <div className="flex items-center gap-2 pointer-events-auto">
//           {/* Active Global Switch */}
//           <div className="flex items-center gap-2 bg-white/95 dark:bg-[#14151b]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-lg text-xs">
//             <span className="font-semibold text-zinc-700 dark:text-zinc-300">Active</span>
//             <button
//               type="button"
//               onClick={handleToggleGlobalActive}
//               className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
//                 flowActive ? "bg-emerald-600" : "bg-zinc-400 dark:bg-zinc-600"
//               }`}
//             >
//               <span
//                 className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
//                   flowActive ? "translate-x-4" : "translate-x-0"
//                 }`}
//               />
//             </button>
//           </div>

//           {/* Zoom controls & Expand */}
//           <div className="flex items-center bg-white/95 dark:bg-[#14151b]/95 backdrop-blur-md rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-lg p-1 text-zinc-700 dark:text-zinc-300">
//             <button
//               type="button"
//               onClick={() => handleZoom(-0.15)}
//               className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
//               title="Zoom Out"
//             >
//               <ZoomOut className="h-4 w-4" />
//             </button>
//             <button
//               type="button"
//               onClick={handleResetView}
//               className="px-2 text-xs font-mono font-medium hover:text-emerald-600 transition"
//               title="Reset View"
//             >
//               {Math.round(zoom * 100)}%
//             </button>
//             <button
//               type="button"
//               onClick={() => handleZoom(0.15)}
//               className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
//               title="Zoom In"
//             >
//               <ZoomIn className="h-4 w-4" />
//             </button>

//             <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1" />

//             <button
//               type="button"
//               onClick={() => setIsExpanded((v) => !v)}
//               className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition text-zinc-700 dark:text-zinc-300"
//               title={isExpanded ? "Exit Fullscreen (Esc)" : "Expand Canvas (Fullscreen)"}
//             >
//               {isExpanded ? <Minimize2 className="h-4 w-4 text-emerald-600" /> : <Maximize2 className="h-4 w-4" />}
//             </button>

//             <button
//               type="button"
//               onClick={() => setIsLocked((v) => !v)}
//               className={`p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition ${
//                 isLocked ? "text-emerald-500 font-bold" : ""
//               }`}
//               title={isLocked ? "Unlock Canvas" : "Lock Canvas"}
//             >
//               {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
//             </button>
//           </div>
//         </div>
//       </div>

//       {/* Connecting banner notification when a port is active */}
//       {activeConnectPort && (
//         <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-emerald-700 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-pulse">
//           <LinkIcon className="h-4 w-4" />
//           <span>Connecting "{activeConnectPort.buttonTitle}" — click any message card to connect, or select from menu</span>
//           <button
//             type="button"
//             onClick={() => setActiveConnectPort(null)}
//             className="ml-1 bg-black/20 hover:bg-black/40 rounded-full p-1"
//           >
//             <X className="h-3 w-3" />
//           </button>
//         </div>
//       )}

//       {/* ───── Right Slide-out Content Editing Drawer (Opens from Right to Left) ───── */}
//       {selectedRuleIndex !== null && selectedRule && (
//         <aside
//           className="absolute top-0 right-0 bottom-0 z-40 w-[440px] max-w-[95vw] bg-white dark:bg-[#121318] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
//           onClick={(e) => e.stopPropagation()}
//         >
//           {/* Drawer Sticky Header */}
//           <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-zinc-50 dark:bg-[#161720]">
//             <div className="flex items-center gap-2 min-w-0">
//               <button
//                 type="button"
//                 onClick={() => setSelectedRuleIndex(null)}
//                 className="flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition p-1 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 rounded-lg"
//                 title="Close drawer"
//               >
//                 <ChevronRight className="h-4 w-4" />
//                 <span>Close</span>
//               </button>
//               <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-700" />
//               <div className="flex items-center gap-1.5 min-w-0">
//                 <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
//                   Edit Message
//                 </span>
//                 <span className="text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded-full shrink-0">
//                   #{selectedRuleIndex + 1}
//                 </span>
//               </div>
//             </div>

//             <div className="flex items-center gap-1">
//               <button
//                 type="button"
//                 onClick={() => testRule(selectedRule)}
//                 className="p-1.5 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
//                 title="Test this node in Live Phone Simulator"
//               >
//                 <Eye className="h-4 w-4" />
//               </button>
//               <button
//                 type="button"
//                 onClick={() => handleDuplicateNode(selectedRuleIndex)}
//                 className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
//                 title="Duplicate Node"
//               >
//                 <Copy className="h-4 w-4" />
//               </button>
//               {selectedRuleIndex !== rootIndex && (
//                 <button
//                   type="button"
//                   onClick={() => handleDeleteNode(selectedRuleIndex)}
//                   className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition"
//                   title="Delete Node"
//                 >
//                   <Trash2 className="h-4 w-4" />
//                 </button>
//               )}
//               <button
//                 type="button"
//                 onClick={() => setSelectedRuleIndex(null)}
//                 className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition ml-1"
//                 title="Close Drawer"
//               >
//                 <X className="h-4 w-4" />
//               </button>
//             </div>
//           </div>

//           {/* Drawer Scrollable Body */}
//           <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
//             {/* 1. Rule Name & Status */}
//             <div className="space-y-1.5">
//               <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
//                 Node Name
//               </label>
//               <input
//                 type="text"
//                 value={selectedRule.name || ""}
//                 onChange={(e) => updateRule(selectedRuleIndex, { name: e.target.value })}
//                 placeholder="e.g. Solar Subsidy Details"
//                 className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 font-medium outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-zinc-800 transition"
//               />
//             </div>

//             {/* 2. Response Message Type Selector */}
//             <div className="space-y-2">
//               <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 block">
//                 Response Format / Message Type
//               </label>
//               <div className="grid grid-cols-5 gap-1.5 bg-zinc-100 dark:bg-zinc-900 p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
//                 {[
//                   { id: "button", label: "Buttons", icon: MessageSquare },
//                   { id: "list", label: "List", icon: List },
//                   { id: "media", label: "Media", icon: ImageIcon },
//                   { id: "cta_url", label: "Link", icon: Globe },
//                   { id: "text", label: "Text", icon: FileText },
//                 ].map((item) => {
//                   const IconComp = item.icon;
//                   const isActive = (selectedRule.responseType || "button") === item.id;
//                   return (
//                     <button
//                       key={item.id}
//                       type="button"
//                       onClick={() => handleSwitchResponseType(selectedRuleIndex, item.id)}
//                       className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg text-center transition ${
//                         isActive
//                           ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm border border-emerald-500/30"
//                           : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
//                       }`}
//                     >
//                       <IconComp className="h-4 w-4 shrink-0" />
//                       <span className="text-[10px] truncate w-full">{item.label}</span>
//                     </button>
//                   );
//                 })}
//               </div>
//             </div>

//             {/* 6. Trigger & Keyword Routing */}
//             <div className="space-y-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-3">
//               <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 block">
//                 Trigger When To Send This Message
//               </label>

//               <div className="grid grid-cols-2 gap-1.5">
//                 {[
//                   { id: "button_press", label: "Button / Row Click" },
//                   { id: "keyword", label: "AI Keyword" },
//                   { id: "first_message", label: "Welcome Greeting" },
//                   { id: "always", label: "Always / Fallback" },
//                 ].map((trig) => (
//                   <button
//                     key={trig.id}
//                     type="button"
//                     onClick={() => updateRule(selectedRuleIndex, { triggerType: trig.id })}
//                     className={`py-1.5 px-2 rounded-lg border text-left text-xs transition ${selectedRule.triggerType === trig.id
//                         ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold"
//                         : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
//                       }`}
//                   >
//                     {trig.label}
//                   </button>
//                 ))}
//               </div>

//               {(selectedRule.triggerType === "button_press" ||
//                 selectedRule.triggerType === "list_row" ||
//                 selectedRule.triggerType === "keyword") && (
//                   <div className="space-y-1 pt-1">
//                     <label className="text-[10px] text-zinc-500 font-medium block">
//                       {selectedRule.triggerType === "button_press"
//                         ? "Connected Button IDs (comma-separated):"
//                         : "Keywords / phrases (comma-separated):"}
//                     </label>
//                     <input
//                       type="text"
//                       value={selectedRule.triggerValue || ""}
//                       onChange={(e) =>
//                         updateRule(selectedRuleIndex, { triggerValue: e.target.value })
//                       }
//                       placeholder={
//                         selectedRule.triggerType === "button_press"
//                           ? "btn_solar_1, btn_subsidy"
//                           : "solar, pricing, estimate"
//                       }
//                       className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 outline-none"
//                     />
//                   </div>
//                 )}
//             </div>

//             {/* 3. Message Body / Caption Text */}
//             <div className="space-y-1.5">
//               <div className="flex items-center justify-between text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
//                 <span>
//                   {selectedRule.responseType === "media" ? "Caption / Text" : "Message Body"}
//                 </span>
//                 <span className="text-[10px] font-normal text-zinc-400">
//                   {((selectedRule.responseConfig?.body || selectedRule.responseConfig?.text || selectedRule.responseConfig?.caption) || "").length}/1024
//                 </span>
//               </div>
//               <textarea
//                 rows={4}
//                 value={
//                   selectedRule.responseConfig?.body ||
//                   selectedRule.responseConfig?.text ||
//                   selectedRule.responseConfig?.caption ||
//                   ""
//                 }
//                 onChange={(e) => {
//                   const val = e.target.value;
//                   updateRuleResponse(selectedRuleIndex, {
//                     body: val,
//                     text: val,
//                     caption: val,
//                   });
//                 }}
//                 placeholder="Enter message text sent to user on WhatsApp..."
//                 className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-2.5 text-xs text-zinc-800 dark:text-zinc-100 leading-relaxed outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-zinc-800 transition resize-none"
//               />
//               <div className="flex items-center gap-1 text-[10px] text-zinc-400">
//                 <span>Formatting:</span>
//                 <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-zinc-600 dark:text-zinc-300">*bold*</code>
//                 <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-zinc-600 dark:text-zinc-300">_italic_</code>
//                 <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-zinc-600 dark:text-zinc-300">~strike~</code>
//               </div>
//             </div>

//             {/* 4. ATTACH IMAGE / MEDIA OPTION (Supported for ALL message types, matching classic list!) */}
//             {selectedRule.responseType !== "media" && (
//               <div className="space-y-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-3">
//                 <div className="flex items-center justify-between">
//                   <div className="flex items-center gap-1.5">
//                     <Paperclip className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
//                     <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
//                       Attach Image / Media (Optional)
//                     </label>
//                   </div>
//                   {currentAttachmentKind !== "none" && (
//                     <button
//                       type="button"
//                       onClick={() => handleUpdateAttachment(selectedRuleIndex, "none", "")}
//                       className="text-[10px] text-red-500 hover:underline font-semibold"
//                     >
//                       Remove
//                     </button>
//                   )}
//                 </div>

//                 {/* Media Kind Selector */}
//                 <div className="grid grid-cols-4 gap-1 bg-zinc-200/60 dark:bg-zinc-800 p-1 rounded-lg text-center font-medium">
//                   {[
//                     { id: "none", label: "None" },
//                     { id: "image", label: "Image" },
//                     { id: "video", label: "Video" },
//                     { id: "document", label: "PDF" },
//                   ].map((opt) => (
//                     <button
//                       key={opt.id}
//                       type="button"
//                       onClick={() =>
//                         handleUpdateAttachment(
//                           selectedRuleIndex,
//                           opt.id,
//                           opt.id === "none" ? "" : selectedMediaInfo.url || ""
//                         )
//                       }
//                       className={`py-1.5 rounded text-[11px] font-semibold transition ${
//                         currentAttachmentKind === opt.id
//                           ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm"
//                           : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
//                       }`}
//                     >
//                       {opt.label}
//                     </button>
//                   ))}
//                 </div>

//                 {/* URL Input and Live Preview whenever kind is NOT 'none' */}
//                 {currentAttachmentKind !== "none" && (
//                   <div className="space-y-2.5 pt-1">
//                     <div className="space-y-1">
//                       <div className="flex items-center justify-between">
//                         <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
//                           HTTPS {currentAttachmentKind === "image" ? "Image" : currentAttachmentKind === "video" ? "Video" : "Document"} URL
//                         </label>
//                         {selectedMediaInfo.url && (
//                           <button
//                             type="button"
//                             onClick={() => handleUpdateAttachment(selectedRuleIndex, currentAttachmentKind, "")}
//                             className="text-[10px] text-zinc-400 hover:text-red-500 transition"
//                           >
//                             Clear URL
//                           </button>
//                         )}
//                       </div>
//                       <input
//                         type="url"
//                         value={selectedMediaInfo.url || ""}
//                         onChange={(e) =>
//                           handleUpdateAttachment(selectedRuleIndex, currentAttachmentKind, e.target.value)
//                         }
//                         placeholder={
//                           currentAttachmentKind === "image"
//                             ? "https://example.com/solar-banner.jpg"
//                             : currentAttachmentKind === "video"
//                             ? "https://example.com/solar-demo.mp4"
//                             : "https://example.com/solar-catalogue.pdf"
//                         }
//                         className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
//                       />
//                     </div>

//                     {/* Live Preview in Side Panel (if url exists) */}
//                     {selectedMediaInfo.url ? (
//                       <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 aspect-video relative flex items-center justify-center max-h-40 shadow-inner">
//                         {currentAttachmentKind === "image" ? (
//                           <img
//                             src={selectedMediaInfo.url}
//                             alt="Attached Preview"
//                             className="w-full h-full object-cover"
//                             onError={(e) => {
//                               e.target.style.display = "none";
//                             }}
//                           />
//                         ) : currentAttachmentKind === "video" ? (
//                           <div className="flex flex-col items-center gap-1.5 text-zinc-400">
//                             <Video className="h-8 w-8 text-purple-500" />
//                             <span className="text-[11px] font-medium">Video Media Attached</span>
//                           </div>
//                         ) : (
//                           <div className="flex flex-col items-center gap-1.5 text-zinc-400">
//                             <FileText className="h-8 w-8 text-emerald-500" />
//                             <span className="text-[11px] font-medium">Document / PDF Attached</span>
//                           </div>
//                         )}
//                       </div>
//                     ) : (
//                       <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-3 text-center text-zinc-400 text-[11px]">
//                         Paste an HTTPS media URL above.
//                       </div>
//                     )}

                
//                   </div>
//                 )}
//               </div>
//             )}

//             {/* 5. Type Specific Controls */}
//             {/* === A. BUTTONS RESPONSE === */}
//             {selectedRule.responseType === "button" && (
//               <div className="space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-3">
//                 <div className="flex items-center justify-between">
//                   <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
//                     Reply Buttons ({selectedRule.responseConfig?.buttons?.length || 0}/3)
//                   </span>
//                   <span className="text-[10px] text-zinc-400">Max 3 buttons</span>
//                 </div>

//                 <div className="space-y-2">
//                   {(selectedRule.responseConfig?.buttons || []).map((btn, btnIdx) => {
//                     const child = btn.id ? buttonMap[btn.id.trim()] : null;
//                     return (
//                       <div
//                         key={btnIdx}
//                         className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-2.5 space-y-2 shadow-sm"
//                       >
//                         <div className="flex items-center gap-2">
//                           <GripVertical className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
//                           <input
//                             type="text"
//                             maxLength={20}
//                             value={btn.title || ""}
//                             onChange={(e) => {
//                               const nextBtns = (selectedRule.responseConfig?.buttons || []).map((b, i) =>
//                                 i === btnIdx ? { ...b, title: e.target.value } : b
//                               );
//                               updateRuleResponse(selectedRuleIndex, { buttons: nextBtns });
//                             }}
//                             placeholder={`Button ${btnIdx + 1} Title`}
//                             className="flex-1 bg-transparent text-xs font-semibold text-zinc-800 dark:text-zinc-100 outline-none"
//                           />
//                           <span className="text-[10px] text-zinc-400 font-mono">
//                             {(btn.title || "").length}/20
//                           </span>
//                           <button
//                             type="button"
//                             onClick={() => handleDeleteButton(selectedRuleIndex, btnIdx, btn.id)}
//                             className="p-1 text-zinc-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-500/10 transition"
//                             title="Delete this button"
//                           >
//                             <Trash2 className="h-3.5 w-3.5" />
//                           </button>
//                         </div>

//                         {/* Button Connection routing */}
//                         <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-100 dark:border-zinc-700/60">
//                           {child ? (
//                             <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium truncate pr-1">
//                               <LinkIcon className="h-3 w-3 shrink-0" />
//                               <span className="truncate">Leads to: <strong>{child.rule.name}</strong></span>
//                             </div>
//                           ) : (
//                             <span className="text-zinc-400 italic">No message card linked</span>
//                           )}

//                           {child ? (
//                             <button
//                               type="button"
//                               onClick={() => handleDisconnectButton(btn.id, child.index)}
//                               className="text-red-500 hover:text-red-700 text-[10px] font-semibold shrink-0"
//                             >
//                               Disconnect
//                             </button>
//                           ) : (
//                             <select
//                               onChange={(e) => {
//                                 if (e.target.value !== "") {
//                                   handleConnectButtonToRule(btn.id, Number(e.target.value));
//                                   e.target.value = "";
//                                 }
//                               }}
//                               defaultValue=""
//                               className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 rounded-lg px-2 py-0.5 text-[10px] font-semibold outline-none cursor-pointer"
//                             >
//                               <option value="" disabled>
//                                 + Link to Message...
//                               </option>
//                               {rules
//                                 .map((r, rIdx) => ({ r, rIdx }))
//                                 .filter(({ rIdx }) => rIdx !== selectedRuleIndex)
//                                 .map(({ r, rIdx }) => (
//                                   <option key={rIdx} value={rIdx}>
//                                     {r.name || `Message ${rIdx + 1}`}
//                                   </option>
//                                 ))}
//                             </select>
//                           )}
//                         </div>
//                       </div>
//                     );
//                   })}

//                   {(selectedRule.responseConfig?.buttons || []).length < 3 && (
//                     <button
//                       type="button"
//                       onClick={() => handleAddButtonToNode(selectedRuleIndex)}
//                       className="w-full py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-500/10 border border-dashed border-emerald-300 dark:border-emerald-500/30 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition"
//                     >
//                       <Plus className="h-3.5 w-3.5" />
//                       Add Another Button
//                     </button>
//                   )}
//                 </div>
//               </div>
//             )}

//             {/* === B. LIST RESPONSE === */}
//             {selectedRule.responseType === "list" && (
//               <div className="space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-3">
//                 <div className="space-y-1">
//                   <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
//                     Menu Button Label
//                   </label>
//                   <input
//                     type="text"
//                     maxLength={20}
//                     value={selectedRule.responseConfig?.buttonLabel || "View Options"}
//                     onChange={(e) =>
//                       updateRuleResponse(selectedRuleIndex, { buttonLabel: e.target.value })
//                     }
//                     placeholder="e.g. View Services"
//                     className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 outline-none"
//                   />
//                 </div>

//                 <div className="space-y-1">
//                   <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
//                     Section Title
//                   </label>
//                   <input
//                     type="text"
//                     maxLength={24}
//                     value={selectedRule.responseConfig?.sections?.[0]?.title || "Services"}
//                     onChange={(e) => {
//                       const curSections = selectedRule.responseConfig?.sections || [];
//                       const nextSections = [{ ...(curSections[0] || {}), title: e.target.value }];
//                       updateRuleResponse(selectedRuleIndex, { sections: nextSections });
//                     }}
//                     placeholder="e.g. Available Services"
//                     className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 outline-none"
//                   />
//                 </div>

//                 <div className="space-y-2">
//                   <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 block">
//                     Menu List Rows ({selectedRule.responseConfig?.sections?.[0]?.rows?.length || 0}/10)
//                   </span>

//                   {(selectedRule.responseConfig?.sections?.[0]?.rows || []).map((row, rowIdx) => {
//                     const child = row.id ? buttonMap[row.id.trim()] : null;
//                     return (
//                       <div
//                         key={rowIdx}
//                         className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-2.5 space-y-1.5 shadow-sm"
//                       >
//                         <div className="flex items-center gap-1.5">
//                           <input
//                             type="text"
//                             maxLength={24}
//                             value={row.title || ""}
//                             onChange={(e) => {
//                               const curRows = selectedRule.responseConfig?.sections?.[0]?.rows || [];
//                               const nextRows = curRows.map((r, i) =>
//                                 i === rowIdx ? { ...r, title: e.target.value } : r
//                               );
//                               const curSections = selectedRule.responseConfig?.sections || [];
//                               updateRuleResponse(selectedRuleIndex, {
//                                 sections: [{ ...(curSections[0] || {}), rows: nextRows }],
//                               });
//                             }}
//                             placeholder={`Row ${rowIdx + 1} Title`}
//                             className="flex-1 bg-transparent text-xs font-semibold text-zinc-800 dark:text-zinc-100 outline-none"
//                           />
//                           <button
//                             type="button"
//                             onClick={() => handleDeleteRow(selectedRuleIndex, rowIdx, row.id)}
//                             className="p-1 text-zinc-400 hover:text-red-500 transition"
//                             title="Delete this row"
//                           >
//                             <Trash2 className="h-3.5 w-3.5" />
//                           </button>
//                         </div>
//                         <input
//                           type="text"
//                           maxLength={72}
//                           value={row.description || ""}
//                           onChange={(e) => {
//                             const curRows = selectedRule.responseConfig?.sections?.[0]?.rows || [];
//                             const nextRows = curRows.map((r, i) =>
//                                 i === rowIdx ? { ...r, description: e.target.value } : r
//                             );
//                             const curSections = selectedRule.responseConfig?.sections || [];
//                             updateRuleResponse(selectedRuleIndex, {
//                               sections: [{ ...(curSections[0] || {}), rows: nextRows }],
//                             });
//                           }}
//                           placeholder="Row subtitle / description (optional)"
//                           className="w-full text-[11px] text-zinc-500 dark:text-zinc-400 bg-transparent outline-none"
//                         />

//                         {/* List Row Connection */}
//                         <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-100 dark:border-zinc-700/60">
//                           {child ? (
//                             <span className="text-emerald-700 dark:text-emerald-400 font-medium truncate">
//                               Leads to: <strong>{child.rule.name}</strong>
//                             </span>
//                           ) : (
//                             <span className="text-zinc-400 italic">No message linked</span>
//                           )}

//                           {child ? (
//                             <button
//                               type="button"
//                               onClick={() => handleDisconnectButton(row.id, child.index)}
//                               className="text-red-500 hover:text-red-700 text-[10px] font-semibold"
//                             >
//                               Disconnect
//                             </button>
//                           ) : (
//                             <select
//                               onChange={(e) => {
//                                 if (e.target.value !== "") {
//                                   handleConnectButtonToRule(row.id, Number(e.target.value));
//                                   e.target.value = "";
//                                 }
//                               }}
//                               defaultValue=""
//                               className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 rounded-lg px-2 py-0.5 text-[10px] font-semibold outline-none cursor-pointer"
//                             >
//                               <option value="" disabled>
//                                 + Link to Message...
//                               </option>
//                               {rules
//                                 .map((r, rIdx) => ({ r, rIdx }))
//                                 .filter(({ rIdx }) => rIdx !== selectedRuleIndex)
//                                 .map(({ r, rIdx }) => (
//                                   <option key={rIdx} value={rIdx}>
//                                     {r.name || `Message ${rIdx + 1}`}
//                                   </option>
//                                 ))}
//                             </select>
//                           )}
//                         </div>
//                       </div>
//                     );
//                   })}

//                   {(selectedRule.responseConfig?.sections?.[0]?.rows || []).length < 10 && (
//                     <button
//                       type="button"
//                       onClick={() => handleAddRowToNode(selectedRuleIndex)}
//                       className="w-full py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-500/10 border border-dashed border-emerald-300 dark:border-emerald-500/30 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition"
//                     >
//                       <Plus className="h-3.5 w-3.5" />
//                       Add Service Row
//                     </button>
//                   )}
//                 </div>
//               </div>
//             )}

//             {/* === C. PURE MEDIA / IMAGE RESPONSE === */}
//             {selectedRule.responseType === "media" && (
//               <div className="space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-3">
//                 <div className="space-y-1">
//                   <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
//                     Media Format
//                   </label>
//                   <div className="grid grid-cols-3 gap-1 bg-zinc-200/60 dark:bg-zinc-800 p-1 rounded-lg text-center font-medium">
//                     {["image", "video", "document"].map((kind) => (
//                       <button
//                         key={kind}
//                         type="button"
//                         onClick={() => updateRuleResponse(selectedRuleIndex, { mediaType: kind })}
//                         className={`py-1 rounded text-xs capitalize transition ${
//                           (selectedRule.responseConfig?.mediaType || "image") === kind
//                             ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm"
//                             : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
//                         }`}
//                       >
//                         {kind}
//                       </button>
//                     ))}
//                   </div>
//                 </div>

//                 <div className="space-y-1">
//                   <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
//                     HTTPS Media Direct URL
//                   </label>
//                   <input
//                     type="url"
//                     value={selectedRule.responseConfig?.url || ""}
//                     onChange={(e) => updateRuleResponse(selectedRuleIndex, { url: e.target.value })}
//                     placeholder="https://example.com/banner.jpg"
//                     className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 outline-none"
//                   />
//                 </div>

//                 {/* Live Image Preview */}
//                 {selectedRule.responseConfig?.url && (
//                   <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/60 aspect-video relative flex items-center justify-center">
//                     {(selectedRule.responseConfig?.mediaType || "image") === "image" ? (
//                       <img
//                         src={selectedRule.responseConfig.url}
//                         alt="Media Preview"
//                         className="w-full h-full object-cover"
//                         onError={(e) => {
//                           e.target.style.display = "none";
//                         }}
//                       />
//                     ) : (selectedRule.responseConfig?.mediaType || "image") === "video" ? (
//                       <div className="flex flex-col items-center gap-1 text-zinc-400">
//                         <Video className="h-8 w-8 text-emerald-500" />
//                         <span className="text-[11px]">Video Link Ready</span>
//                       </div>
//                     ) : (
//                       <div className="flex flex-col items-center gap-1 text-zinc-400">
//                         <FileText className="h-8 w-8 text-emerald-500" />
//                         <span className="text-[11px]">Document / PDF Link Ready</span>
//                       </div>
//                     )}
//                   </div>
//                 )}

//                 {/* Sample Presets */}
//                 <div className="space-y-1 pt-1">
//                   <span className="text-[10px] font-semibold text-zinc-400 block uppercase tracking-wider">
//                     Quick Sample Media Presets:
//                   </span>
//                   <div className="grid gap-1">
//                     {PRESET_MEDIA_SAMPLES.map((preset, pIdx) => (
//                       <button
//                         key={pIdx}
//                         type="button"
//                         onClick={() =>
//                           updateRuleResponse(selectedRuleIndex, {
//                             mediaType: preset.kind,
//                             url: preset.url,
//                             caption: preset.caption,
//                             body: preset.caption,
//                           })
//                         }
//                         className="w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 bg-white dark:bg-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-emerald-600 transition"
//                       >
//                         <span className="truncate">{preset.label}</span>
//                         <span className="text-[10px] text-emerald-600 font-semibold shrink-0">
//                           Use
//                         </span>
//                       </button>
//                     ))}
//                   </div>
//                 </div>
//               </div>
//             )}

//             {/* === D. CTA / WEBSITE LINK RESPONSE === */}
//             {selectedRule.responseType === "cta_url" && (
//               <div className="space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-3">
//                 <div className="space-y-1">
//                   <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
//                     Button Label
//                   </label>
//                   <input
//                     type="text"
//                     maxLength={20}
//                     value={
//                       selectedRule.responseConfig?.displayText ||
//                       selectedRule.responseConfig?.button?.title ||
//                       "Visit Website"
//                     }
//                     onChange={(e) => {
//                       const val = e.target.value;
//                       const curBtn = selectedRule.responseConfig?.button || {};
//                       updateRuleResponse(selectedRuleIndex, {
//                         displayText: val,
//                         button: { ...curBtn, title: val },
//                       });
//                     }}
//                     placeholder="e.g. Visit Website"
//                     className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 outline-none"
//                   />
//                 </div>

//                 <div className="space-y-1">
//                   <div className="flex items-center justify-between">
//                     <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
//                       Destination HTTPS URL
//                     </label>
//                     {selectedRule.responseConfig?.url && (
//                       <a
//                         href={selectedRule.responseConfig.url}
//                         target="_blank"
//                         rel="noreferrer"
//                         className="text-[10px] text-emerald-600 hover:underline flex items-center gap-0.5"
//                       >
//                         <span>Test Link</span>
//                         <ExternalLink className="h-2.5 w-2.5" />
//                       </a>
//                     )}
//                   </div>
//                   <input
//                     type="url"
//                     value={
//                       selectedRule.responseConfig?.url ||
//                       selectedRule.responseConfig?.button?.url ||
//                       ""
//                     }
//                     onChange={(e) => {
//                       const val = e.target.value;
//                       const curBtn = selectedRule.responseConfig?.button || {};
//                       updateRuleResponse(selectedRuleIndex, {
//                         url: val,
//                         button: { ...curBtn, url: val },
//                       });
//                     }}
//                     placeholder="https://example.com/apply-solar"
//                     className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 outline-none"
//                   />
//                 </div>
//               </div>
//             )}

          

//             {/* 7. Delay & Automation Timers */}
//             <div className="space-y-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-3">
//               <div className="flex items-center justify-between">
//                 <div>
//                   <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 block">
//                     Typing Delay
//                   </span>
//                   <span className="text-[10px] text-zinc-400">
//                     Simulates natural typing indicator before replying
//                   </span>
//                 </div>
//                 <input
//                   type="checkbox"
//                   checked={Boolean(selectedRule.responseConfig?.delay)}
//                   onChange={(e) =>
//                     updateRuleResponse(selectedRuleIndex, {
//                       delay: e.target.checked ? "2" : null,
//                     })
//                   }
//                   className="rounded text-emerald-600"
//                 />
//               </div>

//               {selectedRule.responseConfig?.delay && (
//                 <div className="flex items-center gap-2 pt-1">
//                   <input
//                     type="number"
//                     min="1"
//                     max="30"
//                     value={selectedRule.responseConfig?.delay || "2"}
//                     onChange={(e) =>
//                       updateRuleResponse(selectedRuleIndex, { delay: e.target.value })
//                     }
//                     className="w-20 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-800 dark:text-zinc-100 outline-none"
//                   />
//                   <span className="text-xs text-zinc-500">seconds delay</span>
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Drawer Sticky Footer */}
//           <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-[#161720] flex items-center justify-between gap-2">
//             {selectedRuleIndex !== rootIndex && (
//               <button
//                 type="button"
//                 onClick={() => handleDeleteNode(selectedRuleIndex)}
//                 className="px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition"
//               >
//                 Delete Card
//               </button>
//             )}
//             <button
//               type="button"
//               onClick={() => setSelectedRuleIndex(null)}
//               className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition active:scale-95"
//             >
//               <Check className="h-3.5 w-3.5" />
//               Done Editing
//             </button>
//           </div>
//         </aside>
//       )}

//       {/* ───── Interactive Infinite Canvas Area ───── */}
//       <div
//         ref={containerRef}
//         onMouseDown={handleMouseDown}
//         onMouseMove={handleMouseMove}
//         onMouseUp={handleMouseUp}
//         onMouseLeave={handleMouseUp}
//         className={`relative flex-1 w-full h-full cursor-${
//           isPanning ? "grabbing" : isLocked ? "default" : "grab"
//         } overflow-hidden`}
//         style={{
//           backgroundColor: "#f4f5f8",
//           backgroundImage: "radial-gradient(#cbd5e1 1.2px, transparent 1.2px)",
//           backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
//           backgroundPosition: `${pan.x}px ${pan.y}px`,
//         }}
//       >
//         {/* Transformable Canvas Surface */}
//         <div
//           className="absolute inset-0 pointer-events-auto"
//           style={{
//             width: "5000px",
//             height: "4000px",
//             transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
//             transformOrigin: "0 0",
//           }}
//         >
//           {/* SVG Connecting Curves Layer */}
//           <svg className="absolute inset-0 w-[5000px] h-[4000px] pointer-events-none z-10 overflow-visible">
//             {connectionPaths.map((path) => (
//               <g key={path.id}>
//                 {/* Outer shadow glow line */}
//                 <path
//                   d={path.d}
//                   fill="none"
//                   stroke={path.color}
//                   strokeWidth="4"
//                   strokeOpacity="0.18"
//                 />
//                 {/* Main dotted bezier curve matching screenshot */}
//                 <path
//                   d={path.d}
//                   fill="none"
//                   stroke={path.color}
//                   strokeWidth="2.5"
//                   strokeDasharray="5 4"
//                   strokeLinecap="round"
//                 />
//                 {/* Diamond/Circle Junction Checkpoint */}
//                 <circle
//                   cx={path.midX}
//                   cy={path.midY}
//                   r="4"
//                   fill="#ffffff"
//                   stroke={path.color}
//                   strokeWidth="2.5"
//                 />
//               </g>
//             ))}
//           </svg>

//           {/* ═══════════════════════════════════════════════════════════════ */}
//           {/* NODE 1: FLOW START NODE (Green Outline) */}
//           {/* ═══════════════════════════════════════════════════════════════ */}
//           {(() => {
//             const pos = nodePositions["flow_start"] || { x: 40, y: 60 };
//             return (
//               <div
//                 onClick={() => setSelectedRuleIndex(rootIndex)}
//                 className="flow-node-card absolute z-20 w-[310px] rounded-2xl bg-white border-2 border-emerald-600 shadow-xl shadow-emerald-950/10 overflow-hidden cursor-pointer hover:shadow-2xl transition"
//                 style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
//               >
//                 {/* Header (Green Header Pill) */}
//                 <div
//                   onMouseDown={(e) => handleNodeDragStart("flow_start", e)}
//                   className="flex items-center justify-between bg-emerald-700 px-3.5 py-2.5 text-white cursor-move"
//                 >
//                   <div className="flex items-center gap-2">
//                     <Workflow className="h-4 w-4" />
//                     <span className="text-xs font-bold tracking-wide">Flow Start</span>
//                   </div>
//                   <ChevronDown className="h-4 w-4 opacity-80" />
//                 </div>

//                 {/* Body Content */}
//                 <div className="p-3.5 space-y-3 text-zinc-700">
//                   <div>
//                     <label className="text-[10px] font-semibold text-zinc-500 block mb-1">
//                       Initial Inbound Trigger
//                     </label>
//                     <div className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-800">
//                       Incoming Customer Message
//                     </div>
//                   </div>

//                   <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 text-xs space-y-1">
//                     <span className="font-semibold text-emerald-800 block">
//                       Welcome Flow
//                     </span>
//                     <p className="text-[11px] text-emerald-700 leading-snug">
//                       Triggers the welcome greeting message with interactive options below.
//                     </p>
//                   </div>
//                 </div>

//                 {/* Right Output Connector Handle Dot */}
//                 <div
//                   className="absolute right-[-7px] top-[110px] h-3.5 w-3.5 rounded-full border-2 border-emerald-600 bg-white shadow hover:scale-125 transition"
//                   title="Connects to initial message"
//                 />
//               </div>
//             );
//           })()}

//           {/* ═══════════════════════════════════════════════════════════════ */}
//           {/* ALL MESSAGE NODES (Clean Visual Cards with Attached Images) */}
//           {/* ═══════════════════════════════════════════════════════════════ */}
//           {rules.map((rule, index) => {
//             const key = `rule_${index}`;
//             const pos = nodePositions[key] || { x: 490 + (index % 3) * 440, y: 60 + Math.floor(index / 3) * 580 };
//             const isRoot = index === rootIndex;
//             const buttons = rule.responseConfig?.buttons || [];
//             const rows = rule.responseConfig?.sections?.[0]?.rows || [];
//             const isList = rule.responseType === "list";
//             const isMedia = rule.responseType === "media";
//             const isCta = rule.responseType === "cta_url";
//             const mediaInfo = getRuleMediaInfo(rule);
//             const bodyText =
//               rule.responseConfig?.body ||
//               rule.responseConfig?.text ||
//               rule.responseConfig?.caption ||
//               "";
//             const isSelected = selectedRuleIndex === index;

//             return (
//               <div
//                 key={key}
//                 onClick={() => {
//                   if (activeConnectPort && activeConnectPort.ruleIndex !== index) {
//                     handleConnectButtonToRule(activeConnectPort.buttonId, index);
//                   } else {
//                     setSelectedRuleIndex(index);
//                   }
//                 }}
//                 className={`flow-node-card absolute z-20 w-[310px] rounded-2xl bg-white border shadow-xl shadow-zinc-400/20 overflow-visible transition-all cursor-pointer ${
//                   activeConnectPort && activeConnectPort.ruleIndex !== index
//                     ? "border-emerald-500 ring-2 ring-emerald-500/50 hover:scale-[1.02]"
//                     : isSelected
//                     ? "border-emerald-600 ring-2 ring-emerald-500/50 shadow-emerald-500/15"
//                     : "border-zinc-300 hover:border-zinc-400"
//                 }`}
//                 style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
//               >
//                 {/* Left Input Connector Handle Dot (Except root) */}
//                 {!isRoot && (
//                   <div
//                     className="absolute left-[-7px] top-[90px] h-3.5 w-3.5 rounded-full border-2 border-emerald-600 bg-white shadow hover:scale-125 transition"
//                     title="Input trigger connection"
//                   />
//                 )}

//                 {/* Click to connect header banner */}
//                 {activeConnectPort && activeConnectPort.ruleIndex !== index && (
//                   <div className="bg-emerald-600 text-white text-[11px] font-bold py-1 px-3 text-center rounded-t-2xl flex items-center justify-center gap-1.5 animate-pulse">
//                     <LinkIcon className="h-3 w-3" />
//                     Connect "{activeConnectPort.buttonTitle}" Here
//                   </div>
//                 )}

//                 {/* Card Header */}
//                 <div
//                   onMouseDown={(e) => handleNodeDragStart(key, e)}
//                   className={`flex items-center justify-between border-b px-3.5 py-2.5 cursor-move ${
//                     isSelected
//                       ? "bg-emerald-50/80 border-emerald-200"
//                       : "bg-[#f8fafc] border-zinc-100"
//                   } rounded-t-2xl`}
//                 >
//                   <div className="flex items-center gap-2 min-w-0">
//                     <span
//                       className={`grid h-6 w-6 place-items-center rounded ${
//                         isMedia
//                           ? "bg-purple-500/15 text-purple-600"
//                           : isList
//                           ? "bg-blue-500/15 text-blue-600"
//                           : isCta
//                           ? "bg-amber-500/15 text-amber-600"
//                           : "bg-emerald-500/15 text-emerald-600"
//                       }`}
//                     >
//                       {isMedia ? (
//                         <ImageIcon className="h-3.5 w-3.5" />
//                       ) : isList ? (
//                         <List className="h-3.5 w-3.5" />
//                       ) : isCta ? (
//                         <Globe className="h-3.5 w-3.5" />
//                       ) : (
//                         <MessageSquare className="h-3.5 w-3.5" />
//                       )}
//                     </span>
//                     <span className="text-xs font-bold text-zinc-800 truncate">
//                       {rule.name || (isRoot ? "Welcome Message" : `Message ${index + 1}`)}
//                     </span>
//                   </div>

//                   <div className="flex items-center gap-1">
//                     {/* Direct Edit Button that opens Right Side Panel */}
//                     <button
//                       type="button"
//                       onClick={(e) => {
//                         e.stopPropagation();
//                         setSelectedRuleIndex(index);
//                       }}
//                       className="px-2 py-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100/70 hover:bg-emerald-200/80 rounded-md transition flex items-center gap-1"
//                       title="Edit this message in right side panel"
//                     >
//                       <Edit2 className="h-2.5 w-2.5" />
//                       Edit
//                     </button>
//                     <button
//                       type="button"
//                       onClick={(e) => {
//                         e.stopPropagation();
//                         testRule(rule);
//                       }}
//                       className="p-1 text-zinc-400 hover:text-emerald-600 transition"
//                       title="Test in live phone"
//                     >
//                       <Eye className="h-3.5 w-3.5" />
//                     </button>
//                     {!isRoot && (
//                       <button
//                         type="button"
//                         onClick={(e) => {
//                           e.stopPropagation();
//                           handleDeleteNode(index);
//                         }}
//                         className="p-1 text-zinc-400 hover:text-red-500 transition"
//                         title="Delete node"
//                       >
//                         <Trash2 className="h-3.5 w-3.5" />
//                       </button>
//                     )}
//                   </div>
//                 </div>

//                 {/* Card Body */}
//                 <div className="p-3.5 space-y-2.5 text-zinc-700">
//                   {/* Trigger Badge / Info strip */}
//                   <div className="flex items-center justify-between text-[10px]">
//                     <span className="font-semibold text-zinc-400 uppercase tracking-wider">
//                       {rule.triggerType === "button_press"
//                         ? "⚡ Button Trigger"
//                         : rule.triggerType === "first_message"
//                         ? "👋 Initial Greeting"
//                         : "🔑 AI Keyword"}
//                     </span>
//                     <span className="font-mono text-zinc-500 truncate max-w-[150px]">
//                       {rule.triggerValue || "Automatic"}
//                     </span>
//                   </div>

//                   {/* Attached Image / Media Preview (Rendered on ANY card if an image/media is attached!) */}
//                   {mediaInfo.hasMedia && (
//                     <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 aspect-video relative max-h-36 shadow-inner group">
//                       {mediaInfo.kind === "image" ? (
//                         <img
//                           src={mediaInfo.url}
//                           alt="Attached Media"
//                           className="w-full h-full object-cover"
//                           onError={(e) => {
//                             e.target.style.display = "none";
//                           }}
//                         />
//                       ) : mediaInfo.kind === "video" ? (
//                         <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 gap-1 bg-zinc-900 text-white">
//                           <Video className="h-6 w-6 text-purple-400" />
//                           <span className="text-[10px]">Video Attached</span>
//                         </div>
//                       ) : mediaInfo.kind === "document" ? (
//                         <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-1 bg-zinc-50 dark:bg-zinc-800">
//                           <FileText className="h-6 w-6 text-emerald-600" />
//                           <span className="text-[10px] font-medium">Document / PDF Attached</span>
//                         </div>
//                       ) : (
//                         <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-1 bg-zinc-50 dark:bg-zinc-800">
//                           <Globe className="h-6 w-6 text-blue-600" />
//                           <span className="text-[10px] font-medium">Link Attached</span>
//                         </div>
//                       )}
//                     </div>
//                   )}

//                   {/* Message Bubble Preview */}
//                   <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-800 leading-relaxed line-clamp-3">
//                     {bodyText || <span className="italic text-zinc-400">Empty message...</span>}
//                   </div>

//                   {/* CTA Link Button Preview */}
//                   {isCta && (
//                     <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold">
//                       <Globe className="h-3.5 w-3.5 text-amber-600" />
//                       <span className="truncate">
//                         {rule.responseConfig?.displayText || "Visit Link"}
//                       </span>
//                       <ExternalLink className="h-3 w-3 ml-0.5 opacity-60" />
//                     </div>
//                   )}

//                   {/* List Menu Rows (Interactive) */}
//                   {isList && (
//                     <div className="space-y-1.5 pt-1">
//                       <div className="flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
//                         <List className="h-3 w-3" />
//                         <span>Menu: {rule.responseConfig?.buttonLabel || "View Options"}</span>
//                       </div>

//                       {rows.map((row, rowIdx) => {
//                         const child = row.id ? buttonMap[row.id.trim()] : null;
//                         const isPortActive = activeConnectPort?.buttonId === row.id;
//                         return (
//                           <div
//                             key={rowIdx}
//                             className={`relative flex items-center justify-between rounded-lg border p-1.5 text-xs transition ${
//                               child ? "border-blue-300 bg-blue-50/40" : "border-zinc-200 bg-white"
//                             }`}
//                           >
//                             <div className="min-w-0 flex-1 pr-1">
//                               <span className="font-semibold text-zinc-800 block truncate text-[11px]">
//                                 {row.title || `Service ${rowIdx + 1}`}
//                               </span>
//                             </div>

//                             <button
//                               type="button"
//                               onClick={(e) => {
//                                 e.stopPropagation();
//                                 handleDeleteRow(index, rowIdx, row.id);
//                               }}
//                               className="p-1 text-zinc-400 hover:text-red-500 rounded transition shrink-0"
//                               title="Delete row"
//                             >
//                               <Trash2 className="h-3 w-3" />
//                             </button>

//                             {/* Connector Handle Dot on Right */}
//                             <div
//                               onClick={(e) => {
//                                 e.stopPropagation();
//                                 setActiveConnectPort(
//                                   isPortActive
//                                     ? null
//                                     : {
//                                         ruleIndex: index,
//                                         buttonIndex: rowIdx,
//                                         buttonId: row.id,
//                                         buttonTitle: row.title,
//                                         currentChildIndex: child?.index,
//                                       }
//                                 );
//                               }}
//                               className={`absolute right-[-7px] top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-emerald-600 ${
//                                 child ? "bg-emerald-600" : "bg-white hover:scale-125 cursor-pointer"
//                               } shadow`}
//                               title={child ? `Connected to: ${child.rule.name}` : "Click to connect"}
//                             />
//                           </div>
//                         );
//                       })}

//                       {rows.length < 10 && (
//                         <button
//                           type="button"
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             handleAddRowToNode(index);
//                           }}
//                           className="w-full py-1 text-center text-[11px] font-semibold text-blue-700 bg-blue-50/70 border border-dashed border-blue-300 rounded-lg hover:bg-blue-100 transition"
//                         >
//                           + Add List Row
//                         </button>
//                       )}
//                     </div>
//                   )}

//                   {/* Interactive Reply Buttons */}
//                   {rule.responseType === "button" && (
//                     <div className="space-y-1.5 pt-1">
//                       {buttons.map((btn, btnIdx) => {
//                         const child = btn.id ? buttonMap[btn.id.trim()] : null;
//                         const isPortActive = activeConnectPort?.buttonId === btn.id;

//                         return (
//                           <div
//                             key={btnIdx}
//                             className={`relative flex items-center justify-between rounded-xl border p-2 text-xs shadow-sm transition ${
//                               child
//                                 ? "border-emerald-500/80 bg-emerald-50/30"
//                                 : "border-zinc-200 bg-white hover:border-emerald-400"
//                             }`}
//                           >
//                             <span className="font-semibold text-zinc-800 truncate pr-1 text-[11px]">
//                               {btn.title || `Button ${btnIdx + 1}`}
//                             </span>

//                             <button
//                               type="button"
//                               onClick={(e) => {
//                                 e.stopPropagation();
//                                 handleDeleteButton(index, btnIdx, btn.id);
//                               }}
//                               className="p-1 text-zinc-400 hover:text-red-500 rounded transition shrink-0 mr-1"
//                               title="Delete button"
//                             >
//                               <Trash2 className="h-3.5 w-3.5" />
//                             </button>

//                             {/* Output Connector Port Dot on Right */}
//                             <div
//                               onClick={(e) => {
//                                 e.stopPropagation();
//                                 setActiveConnectPort(
//                                   isPortActive
//                                     ? null
//                                     : {
//                                         ruleIndex: index,
//                                         buttonIndex: btnIdx,
//                                         buttonId: btn.id,
//                                         buttonTitle: btn.title,
//                                         currentChildIndex: child?.index,
//                                       }
//                                 );
//                               }}
//                               className={`absolute right-[-7px] top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-emerald-600 ${
//                                 child ? "bg-emerald-600" : "bg-white hover:scale-125 cursor-pointer ring-2 ring-emerald-500/30"
//                               } shadow`}
//                               title={child ? `Connected to: ${child.rule.name} (Click to manage)` : "Click to connect to message"}
//                             />

//                             {/* Popover */}
//                             {isPortActive && (
//                               <div
//                                 className="absolute right-[312px] top-[-30px] z-50 w-72 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#16161c] p-3 shadow-2xl text-left text-xs space-y-2.5"
//                                 onClick={(e) => e.stopPropagation()}
//                               >
//                                 <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
//                                   <span className="font-bold text-zinc-800 dark:text-zinc-100 truncate pr-2">
//                                     Connect "{btn.title || "Button"}"
//                                   </span>
//                                   <button
//                                     type="button"
//                                     onClick={() => setActiveConnectPort(null)}
//                                     className="p-1 text-zinc-400 hover:text-zinc-600"
//                                   >
//                                     <X className="h-3.5 w-3.5" />
//                                   </button>
//                                 </div>

//                                 {child ? (
//                                   <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 p-2 text-[11px] text-emerald-800">
//                                     <span className="truncate pr-1">
//                                       Connected: <strong>{child.rule.name}</strong>
//                                     </span>
//                                     <button
//                                       type="button"
//                                       onClick={() => handleDisconnectButton(btn.id, child.index)}
//                                       className="shrink-0 text-red-500 font-semibold"
//                                     >
//                                       Disconnect
//                                     </button>
//                                   </div>
//                                 ) : (
//                                   <p className="text-[11px] text-zinc-500">
//                                     Connect this button to an existing message card, or create a new reply.
//                                   </p>
//                                 )}

//                                 <div>
//                                   <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
//                                     Link to existing card:
//                                   </span>
//                                   <div className="max-h-36 overflow-y-auto space-y-1">
//                                     {rules
//                                       .map((r, rTargetIdx) => ({ r, rTargetIdx }))
//                                       .filter(({ rTargetIdx }) => rTargetIdx !== index)
//                                       .map(({ r, rTargetIdx }) => (
//                                         <button
//                                           key={rTargetIdx}
//                                           type="button"
//                                           onClick={() => handleConnectButtonToRule(btn.id, rTargetIdx)}
//                                           className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
//                                             child?.index === rTargetIdx
//                                               ? "bg-emerald-600 text-white font-semibold"
//                                               : "bg-zinc-50 hover:bg-zinc-100 text-zinc-700"
//                                           }`}
//                                         >
//                                           <span className="truncate pr-2">
//                                             {r.name || `Message ${rTargetIdx + 1}`}
//                                           </span>
//                                           <span className="text-[10px] opacity-75 shrink-0">
//                                             {child?.index === rTargetIdx ? "Current" : "Link"}
//                                           </span>
//                                         </button>
//                                       ))}
//                                   </div>
//                                 </div>

//                                 <div className="pt-2 border-t border-zinc-200">
//                                   <button
//                                     type="button"
//                                     onClick={() => handleCreateChildBranch(btn.title, btn.id, index)}
//                                     className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-500 bg-emerald-50 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition"
//                                   >
//                                     <Plus className="h-3 w-3" />
//                                     Create New Message Card
//                                   </button>
//                                 </div>
//                               </div>
//                             )}
//                           </div>
//                         );
//                       })}

//                       {buttons.length < 3 && (
//                         <button
//                           type="button"
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             handleAddButtonToNode(index);
//                           }}
//                           className="w-full py-1 text-center text-[11px] font-semibold text-emerald-700 bg-emerald-50/70 border border-dashed border-emerald-300 rounded-lg hover:bg-emerald-100 transition"
//                         >
//                           + Add Button
//                         </button>
//                       )}
//                     </div>
//                   )}

//                   {/* Delay pill if present */}
//                   {rule.responseConfig?.delay && (
//                     <div className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 w-fit">
//                       <Clock className="h-3 w-3" />
//                       <span>{rule.responseConfig.delay}s typing delay</span>
//                     </div>
//                   )}

//                   {/* Bottom Open Side Panel CTA */}
//                   <div className="pt-1 border-t border-zinc-100 flex items-center justify-between text-[10px] text-zinc-400">
//                     <span className="hover:text-emerald-600 transition flex items-center gap-1">
//                       <Sliders className="h-2.5 w-2.5" />
//                       Click card to edit
//                     </span>
//                     <span className="font-semibold text-zinc-500 uppercase">
//                       {rule.responseType || "button"}
//                     </span>
//                   </div>
//                 </div>
//               </div>
//             );
//           })}
//         </div>
//       </div>
//     </div>
//   );
// }



import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import {
  Sparkles,
  Plus,
  Trash2,
  Copy,
  Eye,
  Check,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  ExternalLink,
  Link as LinkIcon,
  Edit2,
  Workflow,
  List,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Lock,
  Unlock,
  Clock,
  X,
  Image as ImageIcon,
  Video,
  Globe,
  FileText,
  Paperclip,
  LayoutGrid,
  Scan,
} from "lucide-react";

/* ─────────────────────────── constants ─────────────────────────── */

const START_COLOR = "#059669";
const BUTTON_COLORS = [
  "#059669", // Emerald
  "#0284c7", // Sky
  "#7c3aed", // Violet
  "#d97706", // Amber
  "#db2777", // Rose
];
const ARROW_COLORS = [START_COLOR, ...BUTTON_COLORS];

const CARD_W = 272;
const HEADER_H = 40; // card header height (px)
const IN_Y = 20; // y of the input dot (centre of header)
const START_H = 108;
const START_OUT_Y = 66; // y of the output dot on the Flow Start card
const COL_GAP = 120;
const ROW_GAP = 36;
const CANVAS_W = 5000;
const CANVAS_H = 4000;

const PRESET_MEDIA_SAMPLES = [
  {
    label: "Solar Rooftop Banner",
    kind: "image",
    url: "https://images.unsplash.com/photo-1509391365360-2e959784a276?w=800",
    caption:
      "☀️ Here are our residential & commercial solar solutions with up to 40% government subsidy:",
  },
  {
    label: "Customer Support Flyer",
    kind: "image",
    url: "https://images.unsplash.com/photo-1534536281715-e28d76689b4d?w=800",
    caption:
      "🤝 Our solar advisory team is available Monday to Saturday to guide you through registration.",
  },
  {
    label: "Solar Catalogue (PDF link)",
    kind: "document",
    url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    caption: "📄 Complete Solar Subsidy Guide & Application Steps (PDF Document):",
  },
];

const inputCls =
  "w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] text-zinc-800 dark:text-zinc-100 outline-none focus:border-emerald-500";
const labelCls =
  "text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

/* ─────────────────────────── helpers ─────────────────────────── */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const splitIds = (v) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Reliable media detection for any rule
function getRuleMediaInfo(rule) {
  if (!rule) return { hasMedia: false, url: "", kind: "none" };
  const resp = rule.responseConfig || {};

  if (rule.responseType === "media") {
    const url = resp.url || "";
    return {
      hasMedia: Boolean(url && String(url).trim().length > 0),
      url,
      kind: resp.mediaType || "image",
    };
  }
  const att = resp.attachment;
  if (att && att.kind && att.kind !== "none") {
    const url = att.url || "";
    return {
      hasMedia: Boolean(url && String(url).trim().length > 0),
      url,
      kind: att.kind,
    };
  }
  if (resp.headerMedia) {
    const url = resp.headerMedia.url || "";
    return {
      hasMedia: Boolean(url && String(url).trim().length > 0),
      url,
      kind: resp.headerMedia.type || "image",
    };
  }
  if (resp.url && typeof resp.url === "string" && resp.url.startsWith("http") && rule.responseType !== "cta_url") {
    return { hasMedia: true, url: resp.url, kind: resp.mediaType || "image" };
  }
  return { hasMedia: false, url: "", kind: "none" };
}

// Items that own an output port (reply buttons or list rows)
function getItems(rule) {
  const rc = rule?.responseConfig || {};
  const type = rule?.responseType || "button";
  if (type === "list") return rc.sections?.[0]?.rows || [];
  if (type === "button") return rc.buttons || [];
  return [];
}

function estimateHeight(rule) {
  const rc = rule?.responseConfig || {};
  const type = rule?.responseType || "button";
  let h = HEADER_H + 20 + 22 + 50;
  if (getRuleMediaInfo(rule).hasMedia) h += 104;
  if (type === "button") {
    const n = (rc.buttons || []).length;
    h += n * 34 + (n < 3 ? 26 : 0);
  }
  if (type === "list") {
    const n = (rc.sections?.[0]?.rows || []).length;
    h += 26 + n * 30 + (n < 10 ? 26 : 0);
  }
  if (type === "cta_url") h += 34;
  return h;
}

/**
 * Tree layout: Flow Start → Welcome → children of each button/row → …
 * Unlinked cards go to a final column. Returns a { key: {x,y} } map.
 */
function computeLayout(rules, rootIndex, buttonMap, heightOf) {
  const pos = {};
  const col = (n) => 40 + n * (CARD_W + COL_GAP);
  pos.flow_start = { x: col(0), y: 60 };

  const visited = new Set();
  const cursors = {};
  let maxDepth = 1;

  const place = (idx, depth, desiredY) => {
    const x = col(depth);
    const y = Math.max(desiredY, cursors[depth] ?? 60);
    pos[`rule_${idx}`] = { x, y };
    cursors[depth] = y + heightOf(idx) + ROW_GAP;
    maxDepth = Math.max(maxDepth, depth);
    return y;
  };

  if (rules[rootIndex]) {
    visited.add(rootIndex);
    let level = [{ idx: rootIndex, y: 60 }];
    let depth = 1;
    while (level.length) {
      const nextLevel = [];
      level.forEach(({ idx, y }) => {
        const placedY = place(idx, depth, y);
        getItems(rules[idx]).forEach((item) => {
          const child = buttonMap[item.id?.trim()];
          if (child && !visited.has(child.index)) {
            visited.add(child.index);
            nextLevel.push({ idx: child.index, y: placedY });
          }
        });
      });
      level = nextLevel;
      depth += 1;
    }
  }

  rules.forEach((_, idx) => {
    if (!visited.has(idx)) {
      visited.add(idx);
      place(idx, maxDepth + 1, 60);
    }
  });

  return pos;
}

/* ─────────────────────── small UI building blocks ─────────────────────── */

function Section({ title, right, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left"
      >
        <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-700 dark:text-zinc-200">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {title}
        </span>
        {right ? <span className="text-[10px] text-zinc-400">{right}</span> : null}
      </button>
      {open && <div className="space-y-2 px-2.5 pb-2.5">{children}</div>}
    </div>
  );
}

function Seg({ options, value, onChange, cols }) {
  return (
    <div
      className="grid gap-0.5 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 p-0.5"
      style={{ gridTemplateColumns: `repeat(${cols || options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const Icon = o.icon;
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex items-center justify-center gap-1 rounded-md py-1 text-[10px] font-semibold transition ${active
                ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
          >
            {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function LinkSelect({ value, rules, excludeIndex, rootIndex, onChange }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className="max-w-[150px] cursor-pointer rounded-md border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 outline-none"
    >
      <option value="">Not linked</option>
      {rules.map((r, i) =>
        i === excludeIndex || i === rootIndex ? null : (
          <option key={i} value={i}>
            {r.name || `Message ${i + 1}`}
          </option>
        )
      )}
    </select>
  );
}

/* ═══════════════════════════ MAIN COMPONENT ═══════════════════════════ */

export default function VisualFlowBuilder({
  config,
  update,
  updateRule,
  updateRuleResponse,
  testRule,
  onOpenAiModal,
  onSwitchToList,
}) {
  const rules = useMemo(() => (Array.isArray(config.rules) ? config.rules : []), [config.rules]);

  const containerRef = useRef(null);
  const portRefs = useRef({}); // "ruleIdx|itemId" -> element
  const cardRefs = useRef({}); // ruleIdx -> element
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const didFitRef = useRef(false);

  const [view, setView] = useState({ z: 0.85, x: 40, y: 20 });
  const zoom = view.z;
  const pan = { x: view.x, y: view.y };

  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [isLocked, setIsLocked] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [draggedNode, setDraggedNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeConnectPort, setActiveConnectPort] = useState(null);
  const [selectedRuleIndex, setSelectedRuleIndex] = useState(null);
  const [newTypeDropdownOpen, setNewTypeDropdownOpen] = useState(false);
  const [hoverKey, setHoverKey] = useState(null);
  const [metrics, setMetrics] = useState({ ports: {}, heights: {} });

  const storageKey = `vfb-layout:${config?.id ?? config?._id ?? config?.slug ?? config?.name ?? "default"}`;

  // Positions: rule.position (saved with the rule) wins, then localStorage, then auto layout
  const [nodePositions, setNodePositions] = useState(() => {
    const init = {};
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
      Object.entries(saved).forEach(([k, p]) => {
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) init[k] = p;
      });
    } catch (_) {
      /* ignore */
    }
    rules.forEach((r, i) => {
      if (r?.position && Number.isFinite(r.position.x) && Number.isFinite(r.position.y)) {
        init[`rule_${i}`] = { x: r.position.x, y: r.position.y };
      }
    });
    return init;
  });

  const positionsRef = useRef(nodePositions);
  positionsRef.current = nodePositions;
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;

  const flowActive = rules.length > 0 && rules.every((r) => r.enabled !== false);

  const rootIndex = useMemo(() => {
    const idx = rules.findIndex((r) => r.triggerType === "first_message");
    return idx !== -1 ? idx : 0;
  }, [rules]);

  // button/row id -> { rule, index } of the card it leads to
  const buttonMap = useMemo(() => {
    const map = {};
    rules.forEach((rule, idx) => {
      if (
        idx !== rootIndex &&
        (rule.triggerType === "button_press" || rule.triggerType === "list_row") &&
        rule.triggerValue
      ) {
        splitIds(rule.triggerValue).forEach((id) => {
          map[id] = { rule, index: idx };
        });
      }
    });
    return map;
  }, [rules, rootIndex]);

  // For each card: which buttons lead INTO it
  const incomingMap = useMemo(() => {
    const m = {};
    rules.forEach((rule, rIdx) => {
      getItems(rule).forEach((item, itemIdx) => {
        const child = buttonMap[item.id?.trim()];
        if (child) {
          (m[child.index] = m[child.index] || []).push({
            title: item.title || "Button",
            from: rule.name || `Message ${rIdx + 1}`,
            color: BUTTON_COLORS[itemIdx % BUTTON_COLORS.length],
          });
        }
      });
    });
    return m;
  }, [rules, buttonMap]);

  /* ───── geometry helpers ───── */

  const heightOfKey = (key) => {
    if (key === "flow_start") return START_H;
    const i = Number(key.slice(5));
    return metricsRef.current.heights[i] || estimateHeight(rules[i]);
  };

  const isFree = (x, y, h, positions, ignoreKey) =>
    !Object.entries(positions).some(([k, p]) => {
      if (k === ignoreKey) return false;
      if (k !== "flow_start" && Number(k.slice(5)) >= rules.length) return false;
      const ph = heightOfKey(k);
      return x < p.x + CARD_W + 16 && x + CARD_W + 16 > p.x && y < p.y + ph + 16 && y + h + 16 > p.y;
    });

  const findFreeSpot = (x, y, h, positions, ignoreKey) => {
    let ny = y;
    let guard = 0;
    while (!isFree(x, ny, h, positions, ignoreKey) && guard < 80) {
      ny += 40;
      guard += 1;
    }
    return { x: Math.round(x), y: Math.round(ny) };
  };

  /* ───── measure real DOM positions of every port (this fixes connector alignment) ───── */
  useLayoutEffect(() => {
    const ports = {};
    const heights = {};
    Object.entries(cardRefs.current).forEach(([ri, card]) => {
      if (card) heights[ri] = card.offsetHeight;
    });
    Object.entries(portRefs.current).forEach(([k, el]) => {
      if (!el) return;
      const card = cardRefs.current[k.split("|")[0]];
      if (!card) return;
      let y = 0;
      let node = el;
      while (node && node !== card) {
        y += node.offsetTop;
        node = node.offsetParent;
      }
      ports[k] = Math.round(y + el.offsetHeight / 2);
    });
    setMetrics((prev) => {
      const next = { ports, heights };
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  });

  /* ───── auto layout ONLY for cards that have no saved position ───── */
  useEffect(() => {
    setNodePositions((prev) => {
      const missing = [];
      if (!prev.flow_start) missing.push("flow_start");
      rules.forEach((_, i) => {
        if (!prev[`rule_${i}`]) missing.push(`rule_${i}`);
      });
      if (!missing.length) return prev;

      const layout = computeLayout(rules, rootIndex, buttonMap, (i) => heightOfKey(`rule_${i}`));
      const next = { ...prev };
      missing.forEach((k) => {
        const p = layout[k] || { x: 40, y: 60 };
        next[k] = k === "flow_start" ? p : findFreeSpot(p.x, p.y, heightOfKey(k), next, k);
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, rootIndex, buttonMap]);

  // Persist layout (not while dragging)
  useEffect(() => {
    if (draggedNode) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nodePositions));
    } catch (_) {
      /* ignore */
    }
  }, [nodePositions, draggedNode, storageKey]);

  /* ───── view helpers ───── */

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const entries = Object.entries(positionsRef.current).filter(
      ([k]) => k === "flow_start" || Number(k.slice(5)) < rules.length
    );
    if (!entries.length) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    entries.forEach(([k, p]) => {
      const h = k === "flow_start" ? START_H : metricsRef.current.heights[Number(k.slice(5))] || 300;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + CARD_W);
      maxY = Math.max(maxY, p.y + h);
    });
    const bw = maxX - minX;
    const bh = maxY - minY;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const z = clamp(Math.min((w - 100) / bw, (h - 130) / bh), 0.3, 1);
    setView({
      z: Number(z.toFixed(2)),
      x: Math.round((w - bw * z) / 2 - minX * z),
      y: Math.round(76 + (h - 76 - 24 - bh * z) / 2 - minY * z),
    });
  }, [rules.length]);

  // Fit once on first paint
  useEffect(() => {
    if (didFitRef.current) return;
    if (nodePositions.flow_start && Object.keys(metrics.heights).length) {
      didFitRef.current = true;
      fitView();
    }
  }, [nodePositions, metrics, fitView]);

  const zoomBy = (delta) =>
    setView((v) => {
      const nz = clamp(Number((v.z + delta).toFixed(2)), 0.3, 2);
      const el = containerRef.current;
      const cx = (el?.clientWidth || 800) / 2;
      const cy = (el?.clientHeight || 600) / 2;
      return {
        z: nz,
        x: Math.round(cx - (cx - v.x) * (nz / v.z)),
        y: Math.round(cy - (cy - v.y) * (nz / v.z)),
      };
    });

  // Wheel zoom around cursor (pure updater – no nested setState)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.target.closest && e.target.closest("[data-no-zoom]")) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = 1 - clamp(e.deltaY, -30, 30) * 0.0015;
      setView((v) => {
        const nz = clamp(Number((v.z * factor).toFixed(3)), 0.3, 2);
        if (Math.abs(nz - v.z) < 0.001) return v;
        return {
          z: nz,
          x: Math.round(mx - (mx - v.x) * (nz / v.z)),
          y: Math.round(my - (my - v.y) * (nz / v.z)),
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Escape handling
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (activeConnectPort) setActiveConnectPort(null);
      else if (selectedRuleIndex !== null) setSelectedRuleIndex(null);
      else if (isExpanded) setIsExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isExpanded, activeConnectPort, selectedRuleIndex]);

  /* ───── pan / drag ───── */

  const handleMouseDown = (e) => {
    if (e.target.closest(".flow-node-card") || e.target.closest("button") || e.target.closest("input") || e.target.closest("textarea") || e.target.closest("select")) {
      return;
    }
    setActiveConnectPort(null);
    setNewTypeDropdownOpen(false);
    if (isLocked) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - view.x, y: e.clientY - view.y });
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setView((v) => ({
        ...v,
        x: Math.round(e.clientX - startPan.x),
        y: Math.round(e.clientY - startPan.y),
      }));
    } else if (draggedNode) {
      if (!dragMovedRef.current) {
        const dist = Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y);
        if (dist < 4) return; // treat as a click, not a drag
        dragMovedRef.current = true;
      }
      const newX = Math.round((e.clientX - dragOffset.x - view.x) / zoom);
      const newY = Math.round((e.clientY - dragOffset.y - view.y) / zoom);
      setNodePositions((prev) => ({
        ...prev,
        [draggedNode]: {
          x: clamp(newX, 0, CANVAS_W - CARD_W),
          y: clamp(newY, 0, CANVAS_H - 200),
        },
      }));
    }
  };

  const handleMouseUp = () => {
    if (draggedNode && dragMovedRef.current && draggedNode.startsWith("rule_")) {
      const idx = Number(draggedNode.slice(5));
      const p = positionsRef.current[draggedNode];
      if (p && rules[idx]) updateRule(idx, { position: { x: p.x, y: p.y } });
    }
    setIsPanning(false);
    setDraggedNode(null);
  };

  const handleNodeDragStart = (nodeKey, e) => {
    e.stopPropagation();
    dragMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    if (isLocked) return;
    const cur = nodePositions[nodeKey] || { x: 0, y: 0 };
    setDraggedNode(nodeKey);
    setDragOffset({
      x: e.clientX - (cur.x * zoom + view.x),
      y: e.clientY - (cur.y * zoom + view.y),
    });
  };

  // Click that belongs to a drag must NOT open the editor
  const consumeDragClick = () => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return true;
    }
    return false;
  };

  /* ───── rule mutations (multi-rule edits go through ONE update call) ───── */

  const removeIdFromRule = (rule, id) => {
    const ids = splitIds(rule.triggerValue).filter((x) => x !== id);
    return ids.length
      ? { ...rule, triggerValue: ids.join(", ") }
      : { ...rule, triggerType: "keyword", triggerValue: "unlinked" };
  };

  const connectItem = (itemId, targetIdx) => {
    const id = itemId?.trim();
    if (!id || targetIdx == null || targetIdx === rootIndex || !rules[targetIdx]) return;
    const next = [...rules];
    const prevChild = buttonMap[id];
    if (prevChild && prevChild.index !== targetIdx) {
      next[prevChild.index] = removeIdFromRule(next[prevChild.index], id);
    }
    const t = next[targetIdx];
    const ids = t.triggerType === "button_press" ? splitIds(t.triggerValue) : [];
    if (!ids.includes(id)) ids.push(id);
    next[targetIdx] = { ...t, triggerType: "button_press", triggerValue: ids.join(", ") };
    update("rules", next);
    setActiveConnectPort(null);
  };

  const disconnectItem = (itemId) => {
    const id = itemId?.trim();
    const child = id ? buttonMap[id] : null;
    if (!child) return;
    update(
      "rules",
      rules.map((r, i) => (i === child.index ? removeIdFromRule(r, id) : r))
    );
    setActiveConnectPort(null);
  };

  const handleUpdateAttachment = (ruleIndex, kind, url) => {
    if (!rules[ruleIndex]) return;
    if (!kind || kind === "none") {
      updateRuleResponse(ruleIndex, { attachment: { kind: "none", url: "" }, headerMedia: null });
      return;
    }
    updateRuleResponse(ruleIndex, {
      attachment: { kind, url: url || "" },
      ...(kind !== "link" ? { headerMedia: { type: kind, url: url || "" } } : {}),
    });
  };

  const handleSwitchResponseType = (ruleIndex, newType) => {
    const target = rules[ruleIndex];
    if (!target) return;
    const cur = target.responseConfig || {};
    const bodyText = cur.body || cur.text || cur.caption || "Select an option below:";
    const cfg = { ...cur, _type: newType, body: bodyText, text: bodyText };

    if (newType === "button") {
      const ex = cur.buttons || [];
      cfg.buttons = ex.length
        ? ex
        : [
          { id: `btn_${Date.now()}_1`, title: "Option 1" },
          { id: `btn_${Date.now()}_2`, title: "Option 2" },
        ];
    } else if (newType === "list") {
      const ex = cur.sections?.[0]?.rows || [];
      cfg.buttonLabel = cur.buttonLabel || "View Options";
      cfg.sections = [
        {
          title: cur.sections?.[0]?.title || "Services",
          rows: ex.length
            ? ex
            : [
              { id: `row_${Date.now()}_1`, title: "Service 1", description: "Details about service 1" },
              { id: `row_${Date.now()}_2`, title: "Service 2", description: "Details about service 2" },
            ],
        },
      ];
    } else if (newType === "media") {
      cfg.mediaType = cur.mediaType || "image";
      cfg.url =
        cur.url || cur.attachment?.url || "https://images.unsplash.com/photo-1509391365360-2e959784a276?w=800";
      cfg.caption = bodyText;
    } else if (newType === "cta_url") {
      const t = cur.displayText || cur.button?.title || "Visit Website";
      const u = cur.url || cur.button?.url || "https://example.com";
      cfg.displayText = t;
      cfg.url = u;
      cfg.button = { title: t, url: u };
    }
    updateRule(ruleIndex, { responseType: newType, responseConfig: cfg });
  };

  const handleDeleteButton = (ruleIndex, buttonIndex, buttonId) => {
    const target = rules[ruleIndex];
    if (!target) return;
    const id = buttonId?.trim();
    const filtered = (target.responseConfig?.buttons || []).filter((_, i) => i !== buttonIndex);
    if (activeConnectPort?.itemId === id) setActiveConnectPort(null);
    update(
      "rules",
      rules.map((r, i) => {
        if (i === ruleIndex) return { ...r, responseConfig: { ...(r.responseConfig || {}), buttons: filtered } };
        if (id && buttonMap[id]?.index === i) return removeIdFromRule(r, id);
        return r;
      })
    );
  };

  const handleDeleteRow = (ruleIndex, rowIndex, rowId) => {
    const target = rules[ruleIndex];
    if (!target) return;
    const id = rowId?.trim();
    const sections = target.responseConfig?.sections || [];
    const rows = (sections[0]?.rows || []).filter((_, i) => i !== rowIndex);
    if (activeConnectPort?.itemId === id) setActiveConnectPort(null);
    update(
      "rules",
      rules.map((r, i) => {
        if (i === ruleIndex)
          return {
            ...r,
            responseConfig: { ...(r.responseConfig || {}), sections: [{ ...(sections[0] || {}), rows }] },
          };
        if (id && buttonMap[id]?.index === i) return removeIdFromRule(r, id);
        return r;
      })
    );
  };

  const handleAddButtonToNode = (ruleIndex) => {
    const target = rules[ruleIndex];
    if (!target) return;
    const btns = target.responseConfig?.buttons || [];
    if (btns.length >= 3) return;
    const num = btns.length + 1;
    updateRule(ruleIndex, {
      responseType: "button",
      responseConfig: {
        ...(target.responseConfig || {}),
        _type: "button",
        body: target.responseConfig?.body || target.responseConfig?.text || "Select an option below:",
        buttons: [...btns, { id: `btn_${Date.now()}_${num}`, title: `Button ${num}` }],
      },
    });
  };

  const handleAddRowToNode = (ruleIndex) => {
    const target = rules[ruleIndex];
    if (!target) return;
    const sections = target.responseConfig?.sections || [];
    const rows = sections[0]?.rows || [];
    if (rows.length >= 10) return;
    const num = rows.length + 1;
    updateRule(ruleIndex, {
      responseType: "list",
      responseConfig: {
        ...(target.responseConfig || {}),
        _type: "list",
        body: target.responseConfig?.body || target.responseConfig?.text || "Select an option from the menu:",
        buttonLabel: target.responseConfig?.buttonLabel || "View Options",
        sections: [
          {
            title: sections[0]?.title || "Services",
            rows: [...rows, { id: `row_${Date.now()}_${num}`, title: `Option ${num}`, description: "" }],
          },
        ],
      },
    });
  };

  const handleCreateChildBranch = (buttonTitle, buttonId, parentRuleIndex) => {
    const id = buttonId?.trim();
    if (!id) return;
    const safeTitle = (buttonTitle || "Option").trim();
    const stamp = Date.now();
    const newRule = {
      name: `Branch: ${safeTitle}`,
      triggerType: "button_press",
      triggerValue: id,
      matchMode: "exact",
      responseType: "button",
      responseConfig: {
        _type: "button",
        body: `Here are the details for *${safeTitle}*:\n\nSelect an option below to proceed:`,
        buttons: [
          { id: `sub_cont_${stamp}`, title: "Continue" },
          { id: `sub_back_${stamp}`, title: "Back to services" },
        ],
      },
      enabled: true,
      priority: rules.length,
    };
    const newIdx = rules.length;
    const parentPos = nodePositions[`rule_${parentRuleIndex}`] || { x: 480, y: 100 };
    const spot = findFreeSpot(parentPos.x + CARD_W + COL_GAP, parentPos.y, 230, nodePositions, null);
    newRule.position = spot;
    setNodePositions((prev) => ({ ...prev, [`rule_${newIdx}`]: spot }));

    const next = [...rules];
    const prevChild = buttonMap[id];
    if (prevChild) next[prevChild.index] = removeIdFromRule(next[prevChild.index], id);
    update("rules", [...next, newRule]);
    setActiveConnectPort(null);
    setSelectedRuleIndex(newIdx);
  };

  const handleAddMessageNode = (type = "button") => {
    const newIdx = rules.length;
    const stamp = Date.now();
    const cfg = {
      _type: type,
      body: "Hello! How can we assist you today?",
      text: "Hello! How can we assist you today?",
    };
    if (type === "button") {
      cfg.buttons = [
        { id: `btn_${stamp}_1`, title: "Option 1" },
        { id: `btn_${stamp}_2`, title: "Option 2" },
      ];
    } else if (type === "list") {
      cfg.buttonLabel = "View Options";
      cfg.sections = [
        {
          title: "Services",
          rows: [
            { id: `row_${stamp}_1`, title: "Service 1", description: "Details about service 1" },
            { id: `row_${stamp}_2`, title: "Service 2", description: "Details about service 2" },
          ],
        },
      ];
    } else if (type === "media") {
      cfg.mediaType = "image";
      cfg.url = "https://images.unsplash.com/photo-1509391365360-2e959784a276?w=800";
      cfg.caption = "☀️ Explore our solar subsidy & rooftop packages:";
    } else if (type === "cta_url") {
      cfg.displayText = "Visit Website";
      cfg.url = "https://example.com";
      cfg.button = { title: "Visit Website", url: "https://example.com" };
    }

    // drop the new card in the middle of what the user is currently looking at
    const el = containerRef.current;
    const cx = ((el?.clientWidth || 800) / 2 - view.x) / zoom - CARD_W / 2;
    const cy = ((el?.clientHeight || 600) / 2 - view.y) / zoom - 100;
    const spot = findFreeSpot(Math.max(0, cx), Math.max(0, cy), 230, nodePositions, null);
    setNodePositions((prev) => ({ ...prev, [`rule_${newIdx}`]: spot }));

    update("rules", [
      ...rules,
      {
        name: `Message ${newIdx + 1}`,
        triggerType: "keyword",
        triggerValue: "help, info",
        matchMode: "contains",
        responseType: type,
        responseConfig: cfg,
        enabled: true,
        priority: newIdx,
        position: spot,
      },
    ]);
    setSelectedRuleIndex(newIdx);
    setNewTypeDropdownOpen(false);
  };

  const handleDuplicateNode = (ruleIndex) => {
    const src = rules[ruleIndex];
    if (!src) return;
    const newIdx = rules.length;
    const clone = JSON.parse(JSON.stringify(src));
    const stamp = Date.now();
    clone.name = `${src.name || `Message ${ruleIndex + 1}`} (Copy)`;
    clone.priority = newIdx;
    clone.triggerType = clone.triggerType === "first_message" ? "keyword" : clone.triggerType;
    if (clone.triggerType === "button_press") {
      clone.triggerType = "keyword";
      clone.triggerValue = "unlinked";
    }
    if (clone.responseConfig?.buttons) {
      clone.responseConfig.buttons = clone.responseConfig.buttons.map((b, i) => ({ ...b, id: `btn_${stamp}_${i + 1}` }));
    }
    if (clone.responseConfig?.sections?.[0]?.rows) {
      clone.responseConfig.sections[0].rows = clone.responseConfig.sections[0].rows.map((r, i) => ({
        ...r,
        id: `row_${stamp}_${i + 1}`,
      }));
    }
    const srcPos = nodePositions[`rule_${ruleIndex}`] || { x: 500, y: 100 };
    const spot = findFreeSpot(srcPos.x + 40, srcPos.y + 40, estimateHeight(clone), nodePositions, null);
    clone.position = spot;
    setNodePositions((prev) => ({ ...prev, [`rule_${newIdx}`]: spot }));
    update("rules", [...rules, clone]);
    setSelectedRuleIndex(newIdx);
  };

  const handleDeleteNode = (ruleIndex) => {
    if (ruleIndex === rootIndex) {
      alert("The Flow Start / Welcome node cannot be deleted, but you can edit its messages.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this message node?")) return;

    const deletedIds = new Set(getItems(rules[ruleIndex]).map((i) => i.id?.trim()).filter(Boolean));
    const next = rules
      .filter((_, i) => i !== ruleIndex)
      .map((r) => {
        if (r.triggerType !== "button_press") return r;
        const ids = splitIds(r.triggerValue);
        const remaining = ids.filter((id) => !deletedIds.has(id));
        if (remaining.length === ids.length) return r;
        return remaining.length
          ? { ...r, triggerValue: remaining.join(", ") }
          : { ...r, triggerType: "keyword", triggerValue: "unlinked" };
      });

    // re-key positions so every card keeps its place
    setNodePositions((prev) => {
      const out = {};
      Object.entries(prev).forEach(([k, p]) => {
        if (k === "flow_start") {
          out[k] = p;
          return;
        }
        const i = Number(k.slice(5));
        if (i < ruleIndex) out[k] = p;
        else if (i > ruleIndex) out[`rule_${i - 1}`] = p;
      });
      return out;
    });

    if (selectedRuleIndex === ruleIndex) setSelectedRuleIndex(null);
    else if (selectedRuleIndex !== null && selectedRuleIndex > ruleIndex) setSelectedRuleIndex(selectedRuleIndex - 1);
    setActiveConnectPort(null);
    update("rules", next);
  };

  const handleToggleGlobalActive = () => {
    const nextState = !flowActive;
    update(
      "rules",
      rules.map((r) => ({ ...r, enabled: nextState }))
    );
  };

  // Reset every card to the tidy auto layout and save it
  const handleAutoArrange = () => {
    const layout = computeLayout(rules, rootIndex, buttonMap, (i) => heightOfKey(`rule_${i}`));
    setNodePositions(layout);
    update(
      "rules",
      rules.map((r, i) => ({ ...r, position: layout[`rule_${i}`] }))
    );
    setTimeout(fitView, 60);
  };

  /* ───── connection curves (start/end come from MEASURED port positions) ───── */

  const connectionPaths = useMemo(() => {
    const paths = [];
    const mk = (id, x1, y1, x2, y2, colorIdx, extra) => {
      const dx = clamp(Math.abs(x2 - x1) * 0.5, 50, 220);
      paths.push({
        id,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2 - 1} ${y2}`,
        color: ARROW_COLORS[colorIdx],
        colorIdx,
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2 + (y1 === y2 ? 0 : 0),
        ...extra,
      });
    };

    const sp = nodePositions.flow_start;
    const rp = nodePositions[`rule_${rootIndex}`];
    if (sp && rp) {
      mk("start", sp.x + CARD_W, sp.y + START_OUT_Y, rp.x, rp.y + IN_Y, 0, {
        key: "start",
        from: "start",
        to: rootIndex,
        label: "",
      });
    }

    rules.forEach((rule, rIdx) => {
      const pp = nodePositions[`rule_${rIdx}`];
      if (!pp) return;
      getItems(rule).forEach((item, itemIdx) => {
        const id = item.id?.trim();
        const child = id ? buttonMap[id] : null;
        if (!child) return;
        const cp = nodePositions[`rule_${child.index}`];
        if (!cp) return;
        const pk = `${rIdx}|${id}`;
        const oy = metrics.ports[pk] ?? 96 + itemIdx * 34;
        mk(pk, pp.x + CARD_W, pp.y + oy, cp.x, cp.y + IN_Y, (itemIdx % BUTTON_COLORS.length) + 1, {
          key: pk,
          from: rIdx,
          to: child.index,
          label: item.title || "Button",
        });
      });
    });
    return paths;
  }, [nodePositions, rootIndex, rules, buttonMap, metrics.ports]);

  const selectedRule = selectedRuleIndex !== null ? rules[selectedRuleIndex] : null;
  const selectedMediaInfo = selectedRule ? getRuleMediaInfo(selectedRule) : { hasMedia: false, url: "", kind: "none" };
  const currentAttachmentKind = selectedMediaInfo.kind || "none";
  const anyFocus = hoverKey !== null || selectedRuleIndex !== null;

  /* ───── side-panel item editors ───── */

  const renderItemEditor = (item, idx, kind) => {
    const id = item.id?.trim();
    const child = id ? buttonMap[id] : null;
    const color = BUTTON_COLORS[idx % BUTTON_COLORS.length];
    const rc = selectedRule.responseConfig || {};

    const setTitle = (val) => {
      if (kind === "button") {
        updateRuleResponse(selectedRuleIndex, {
          buttons: (rc.buttons || []).map((b, i) => (i === idx ? { ...b, title: val } : b)),
        });
      } else {
        const rows = (rc.sections?.[0]?.rows || []).map((r, i) => (i === idx ? { ...r, title: val } : r));
        updateRuleResponse(selectedRuleIndex, { sections: [{ ...(rc.sections?.[0] || {}), rows }] });
      }
    };
    const setDesc = (val) => {
      const rows = (rc.sections?.[0]?.rows || []).map((r, i) => (i === idx ? { ...r, description: val } : r));
      updateRuleResponse(selectedRuleIndex, { sections: [{ ...(rc.sections?.[0] || {}), rows }] });
    };

    return (
      <div
        key={`${kind}-${idx}`}
        className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-1.5 shadow-sm"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            maxLength={kind === "button" ? 20 : 24}
            value={item.title || ""}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "button" ? `Button ${idx + 1}` : `Row ${idx + 1}`}
            className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-zinc-800 dark:text-zinc-100 outline-none"
          />
          <button
            type="button"
            onClick={() =>
              kind === "button" ? handleDeleteButton(selectedRuleIndex, idx, item.id) : handleDeleteRow(selectedRuleIndex, idx, item.id)
            }
            className="rounded p-0.5 text-zinc-400 transition hover:text-red-500"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        {kind === "row" && (
          <input
            type="text"
            maxLength={72}
            value={item.description || ""}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            className="mt-0.5 w-full bg-transparent text-[10px] text-zinc-500 outline-none"
          />
        )}
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 text-[10px]" style={{ color: child ? color : undefined }}>
            <LinkIcon className="h-2.5 w-2.5 shrink-0" />
            <span className={`truncate ${child ? "font-semibold" : "italic text-zinc-400"}`}>
              {child ? `Leads to ${child.rule.name}` : "No message linked"}
            </span>
          </span>
          <LinkSelect
            value={child?.index}
            rules={rules}
            excludeIndex={selectedRuleIndex}
            rootIndex={rootIndex}
            onChange={(v) => (v === null ? disconnectItem(item.id) : connectItem(item.id, v))}
          />
        </div>
      </div>
    );
  };

  /* ═══════════════════════════ RENDER ═══════════════════════════ */

  const tbBtn =
    "flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition";

  return (
    <div
      className={`flex w-full select-none flex-col overflow-hidden bg-[#f8fafc] font-sans shadow-2xl transition-all duration-300 dark:bg-[#0b0c10] ${isExpanded
          ? "fixed inset-0 z-50 h-screen w-screen rounded-none border-0"
          : "relative h-[840px] max-h-[85vh] rounded-2xl border border-zinc-300 dark:border-zinc-800"
        }`}
    >
      {/* ───── Toolbar ───── */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex flex-wrap items-center justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-[#14151b]/95">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Workflow className="h-3.5 w-3.5" />
          </span>
          <div className="pr-1 leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100">Flow Chart</span>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                {rules.length} nodes
              </span>
            </div>
          </div>

          <div className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-800" />

          <button
            type="button"
            onClick={onOpenAiModal}
            className={`${tbBtn} bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md hover:from-emerald-500 hover:to-teal-500 active:scale-95`}
          >
            <Sparkles className="h-3 w-3" />
            AI Generate
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setNewTypeDropdownOpen((v) => !v)}
              className={`${tbBtn} bg-zinc-900 text-white hover:bg-black`}
            >
              <Plus className="h-3 w-3" />
              Add
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
            {newTypeDropdownOpen && (
              <div className="absolute left-0 top-full z-50 mt-1.5 w-44 space-y-0.5 rounded-xl border border-zinc-200 bg-white p-1 text-[11px] shadow-2xl dark:border-zinc-700 dark:bg-[#181820]">
                {[
                  { t: "button", l: "Reply Buttons", I: MessageSquare, c: "text-emerald-600" },
                  { t: "list", l: "List Menu", I: List, c: "text-blue-600" },
                  { t: "media", l: "Image / Media", I: ImageIcon, c: "text-purple-600" },
                  { t: "cta_url", l: "Link / CTA URL", I: Globe, c: "text-amber-600" },
                  { t: "text", l: "Text Message", I: FileText, c: "text-zinc-500" },
                ].map(({ t, l, I, c }) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleAddMessageNode(t)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-zinc-700 transition hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-200 dark:hover:bg-emerald-500/10"
                  >
                    <I className={`h-3.5 w-3.5 ${c}`} />
                    <span>{l}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleAutoArrange}
            className={`${tbBtn} text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800`}
            title="Re-arrange all cards neatly"
          >
            <LayoutGrid className="h-3 w-3" />
            Arrange
          </button>
          <button
            type="button"
            onClick={onSwitchToList}
            className={`${tbBtn} text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800`}
            title="Switch to classic list view"
          >
            <List className="h-3 w-3" />
            List
          </button>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white/95 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-[#14151b]/95">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Active</span>
            <button
              type="button"
              onClick={handleToggleGlobalActive}
              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors ${flowActive ? "bg-emerald-600" : "bg-zinc-400 dark:bg-zinc-600"
                }`}
            >
              <span
                className={`pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${flowActive ? "translate-x-3" : "translate-x-0"
                  }`}
              />
            </button>
          </div>

          <div className="flex items-center rounded-xl border border-zinc-200 bg-white/95 p-0.5 text-zinc-700 shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-[#14151b]/95 dark:text-zinc-300">
            <button type="button" onClick={() => zoomBy(-0.1)} className="rounded-lg p-1.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Zoom out">
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={fitView}
              className="px-1.5 font-mono text-[11px] font-medium transition hover:text-emerald-600"
              title="Fit all cards to screen"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => zoomBy(0.1)} className="rounded-lg p-1.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Zoom in">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={fitView} className="rounded-lg p-1.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Fit to screen">
              <Scan className="h-3.5 w-3.5" />
            </button>
            <div className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-800" />
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="rounded-lg p-1.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title={isExpanded ? "Exit fullscreen (Esc)" : "Fullscreen"}
            >
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5 text-emerald-600" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setIsLocked((v) => !v)}
              className={`rounded-lg p-1.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${isLocked ? "text-emerald-500" : ""}`}
              title={isLocked ? "Unlock canvas" : "Lock canvas"}
            >
              {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Connecting banner */}
      {activeConnectPort && (
        <div className="absolute left-1/2 top-16 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-700 px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-2xl">
          <LinkIcon className="h-3.5 w-3.5" />
          <span>Click a message card to connect “{activeConnectPort.title}”</span>
          <button type="button" onClick={() => setActiveConnectPort(null)} className="rounded-full bg-black/20 p-0.5 hover:bg-black/40">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* ───── Compact right editor drawer ───── */}
      {selectedRule && (
        <aside
          className="absolute bottom-0 right-0 top-0 z-40 flex w-[340px] max-w-[95vw] flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#121318]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* header */}
          <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-zinc-800 dark:bg-[#161720]">
            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              #{selectedRuleIndex + 1}
            </span>
            <input
              type="text"
              value={selectedRule.name || ""}
              onChange={(e) => updateRule(selectedRuleIndex, { name: e.target.value })}
              placeholder="Node name"
              className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-xs font-bold text-zinc-900 outline-none focus:bg-white dark:text-zinc-100 dark:focus:bg-zinc-800"
            />
            <button type="button" onClick={() => testRule(selectedRule)} className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-emerald-600 dark:hover:bg-zinc-800" title="Test in phone simulator">
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => handleDuplicateNode(selectedRuleIndex)} className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800" title="Duplicate">
              <Copy className="h-3.5 w-3.5" />
            </button>
            {selectedRuleIndex !== rootIndex && (
              <button type="button" onClick={() => handleDeleteNode(selectedRuleIndex)} className="rounded-md p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button type="button" onClick={() => setSelectedRuleIndex(null)} className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800" title="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* body */}
          <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5 text-xs" data-no-zoom>
            <Seg
              value={selectedRule.responseType || "button"}
              onChange={(t) => handleSwitchResponseType(selectedRuleIndex, t)}
              options={[
                { id: "button", label: "Buttons", icon: MessageSquare },
                { id: "list", label: "List", icon: List },
                { id: "media", label: "Media", icon: ImageIcon },
                { id: "cta_url", label: "Link", icon: Globe },
                { id: "text", label: "Text", icon: FileText },
              ]}
            />

            {/* message */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className={labelCls}>{selectedRule.responseType === "media" ? "Caption" : "Message"}</span>
                <span className="text-[10px] text-zinc-400">
                  {(selectedRule.responseConfig?.body || selectedRule.responseConfig?.text || selectedRule.responseConfig?.caption || "").length}/1024
                </span>
              </div>
              <textarea
                rows={3}
                value={selectedRule.responseConfig?.body || selectedRule.responseConfig?.text || selectedRule.responseConfig?.caption || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  updateRuleResponse(selectedRuleIndex, { body: val, text: val, caption: val });
                }}
                placeholder="Message sent to the user on WhatsApp…"
                className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px] leading-relaxed text-zinc-800 outline-none transition focus:border-emerald-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:focus:bg-zinc-800"
              />
              <p className="text-[10px] text-zinc-400">
                *bold* &nbsp; _italic_ &nbsp; ~strike~
              </p>
            </div>

            {/* buttons */}
            {(selectedRule.responseType || "button") === "button" && (
              <Section title={`Reply buttons (${selectedRule.responseConfig?.buttons?.length || 0}/3)`}>
                {(selectedRule.responseConfig?.buttons || []).map((b, i) => renderItemEditor(b, i, "button"))}
                {(selectedRule.responseConfig?.buttons || []).length < 3 && (
                  <button
                    type="button"
                    onClick={() => handleAddButtonToNode(selectedRuleIndex)}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/70 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    <Plus className="h-3 w-3" />
                    Add button
                  </button>
                )}
              </Section>
            )}

            {/* list */}
            {selectedRule.responseType === "list" && (
              <Section title={`Menu rows (${selectedRule.responseConfig?.sections?.[0]?.rows?.length || 0}/10)`}>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="space-y-0.5">
                    <span className={labelCls}>Menu label</span>
                    <input
                      type="text"
                      maxLength={20}
                      value={selectedRule.responseConfig?.buttonLabel || "View Options"}
                      onChange={(e) => updateRuleResponse(selectedRuleIndex, { buttonLabel: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <span className={labelCls}>Section title</span>
                    <input
                      type="text"
                      maxLength={24}
                      value={selectedRule.responseConfig?.sections?.[0]?.title || "Services"}
                      onChange={(e) =>
                        updateRuleResponse(selectedRuleIndex, {
                          sections: [{ ...(selectedRule.responseConfig?.sections?.[0] || {}), title: e.target.value }],
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                </div>
                {(selectedRule.responseConfig?.sections?.[0]?.rows || []).map((r, i) => renderItemEditor(r, i, "row"))}
                {(selectedRule.responseConfig?.sections?.[0]?.rows || []).length < 10 && (
                  <button
                    type="button"
                    onClick={() => handleAddRowToNode(selectedRuleIndex)}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/70 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    <Plus className="h-3 w-3" />
                    Add row
                  </button>
                )}
              </Section>
            )}

            {/* media response */}
            {selectedRule.responseType === "media" && (
              <Section title="Media">
                <Seg
                  value={selectedRule.responseConfig?.mediaType || "image"}
                  onChange={(k) => updateRuleResponse(selectedRuleIndex, { mediaType: k })}
                  options={[
                    { id: "image", label: "Image" },
                    { id: "video", label: "Video" },
                    { id: "document", label: "PDF" },
                  ]}
                />
                <input
                  type="url"
                  value={selectedRule.responseConfig?.url || ""}
                  onChange={(e) => updateRuleResponse(selectedRuleIndex, { url: e.target.value })}
                  placeholder="https://example.com/banner.jpg"
                  className={inputCls}
                />
                <div className="flex items-center gap-2">
                  {selectedRule.responseConfig?.url && (selectedRule.responseConfig?.mediaType || "image") === "image" && (
                    <img
                      src={selectedRule.responseConfig.url}
                      alt="Preview"
                      className="h-12 w-16 shrink-0 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  )}
                  <select
                    value=""
                    onChange={(e) => {
                      const p = PRESET_MEDIA_SAMPLES[Number(e.target.value)];
                      if (p)
                        updateRuleResponse(selectedRuleIndex, {
                          mediaType: p.kind,
                          url: p.url,
                          caption: p.caption,
                          body: p.caption,
                          text: p.caption,
                        });
                    }}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="">Use a sample…</option>
                    {PRESET_MEDIA_SAMPLES.map((p, i) => (
                      <option key={i} value={i}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </Section>
            )}

            {/* CTA */}
            {selectedRule.responseType === "cta_url" && (
              <Section title="Link button">
                <div className="grid grid-cols-[110px_1fr] gap-1.5">
                  <div className="space-y-0.5">
                    <span className={labelCls}>Label</span>
                    <input
                      type="text"
                      maxLength={20}
                      value={selectedRule.responseConfig?.displayText || selectedRule.responseConfig?.button?.title || "Visit Website"}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateRuleResponse(selectedRuleIndex, {
                          displayText: val,
                          button: { ...(selectedRule.responseConfig?.button || {}), title: val },
                        });
                      }}
                      className={inputCls}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className={labelCls}>HTTPS URL</span>
                      {selectedRule.responseConfig?.url && (
                        <a href={selectedRule.responseConfig.url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-[10px] text-emerald-600 hover:underline">
                          Test <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                    <input
                      type="url"
                      value={selectedRule.responseConfig?.url || selectedRule.responseConfig?.button?.url || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateRuleResponse(selectedRuleIndex, {
                          url: val,
                          button: { ...(selectedRule.responseConfig?.button || {}), url: val },
                        });
                      }}
                      placeholder="https://example.com"
                      className={inputCls}
                    />
                  </div>
                </div>
              </Section>
            )}

            {/* attachment for non-media types */}
            {selectedRule.responseType !== "media" && (
              <Section
                title="Attachment"
                defaultOpen={currentAttachmentKind !== "none"}
                right={currentAttachmentKind !== "none" ? currentAttachmentKind : "none"}
              >
                <Seg
                  value={currentAttachmentKind}
                  onChange={(k) => handleUpdateAttachment(selectedRuleIndex, k, k === "none" ? "" : selectedMediaInfo.url || "")}
                  options={[
                    { id: "none", label: "None" },
                    { id: "image", label: "Image", icon: ImageIcon },
                    { id: "video", label: "Video", icon: Video },
                    { id: "document", label: "PDF", icon: Paperclip },
                  ]}
                />
                {currentAttachmentKind !== "none" && (
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <input
                        type="url"
                        value={selectedMediaInfo.url || ""}
                        onChange={(e) => handleUpdateAttachment(selectedRuleIndex, currentAttachmentKind, e.target.value)}
                        placeholder="https://example.com/file"
                        className={inputCls}
                      />
                      {selectedMediaInfo.url && (
                        <button
                          type="button"
                          onClick={() => handleUpdateAttachment(selectedRuleIndex, currentAttachmentKind, "")}
                          className="text-[10px] text-zinc-400 transition hover:text-red-500"
                        >
                          Clear URL
                        </button>
                      )}
                    </div>
                    {selectedMediaInfo.url && currentAttachmentKind === "image" && (
                      <img
                        src={selectedMediaInfo.url}
                        alt="Preview"
                        className="h-12 w-16 shrink-0 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    )}
                  </div>
                )}
              </Section>
            )}

            {/* trigger */}
            <Section title="Trigger" defaultOpen={false} right={selectedRule.triggerType}>
              <select
                value={selectedRule.triggerType || "keyword"}
                onChange={(e) => updateRule(selectedRuleIndex, { triggerType: e.target.value })}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="button_press">Button / row click</option>
                <option value="keyword">AI keyword</option>
                <option value="first_message">Welcome greeting</option>
                <option value="always">Always / fallback</option>
              </select>
              {["button_press", "list_row", "keyword"].includes(selectedRule.triggerType) && (
                <div className="space-y-0.5">
                  <span className={labelCls}>
                    {selectedRule.triggerType === "keyword" ? "Keywords (comma-separated)" : "Button IDs (comma-separated)"}
                  </span>
                  <input
                    type="text"
                    value={selectedRule.triggerValue || ""}
                    onChange={(e) => updateRule(selectedRuleIndex, { triggerValue: e.target.value })}
                    placeholder={selectedRule.triggerType === "keyword" ? "solar, pricing, estimate" : "btn_solar_1, btn_subsidy"}
                    className={inputCls}
                  />
                </div>
              )}
            </Section>

            {/* delay */}
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/60 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/40">
              <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-700 dark:text-zinc-200">
                <Clock className="h-3 w-3" />
                Typing delay
              </span>
              <div className="flex items-center gap-1.5">
                {selectedRule.responseConfig?.delay ? (
                  <>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={selectedRule.responseConfig?.delay || "2"}
                      onChange={(e) => updateRuleResponse(selectedRuleIndex, { delay: e.target.value })}
                      className="w-12 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <span className="text-[10px] text-zinc-500">sec</span>
                  </>
                ) : null}
                <input
                  type="checkbox"
                  checked={Boolean(selectedRule.responseConfig?.delay)}
                  onChange={(e) => updateRuleResponse(selectedRuleIndex, { delay: e.target.checked ? "2" : null })}
                  className="rounded text-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* footer */}
          <div className="flex items-center justify-end border-t border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-zinc-800 dark:bg-[#161720]">
            <button
              type="button"
              onClick={() => setSelectedRuleIndex(null)}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-md transition hover:bg-emerald-700 active:scale-95"
            >
              <Check className="h-3 w-3" />
              Done
            </button>
          </div>
        </aside>
      )}

      {/* ───── Canvas ───── */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="relative h-full w-full flex-1 overflow-hidden"
        style={{
          cursor: isPanning ? "grabbing" : draggedNode ? "grabbing" : isLocked ? "default" : "grab",
          backgroundColor: "#f4f5f8",
          backgroundImage: "radial-gradient(#cbd5e1 1.2px, transparent 1.2px)",
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <div
          className="pointer-events-auto absolute inset-0"
          style={{
            width: `${CANVAS_W}px`,
            height: `${CANVAS_H}px`,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* connection layer */}
          <svg className="pointer-events-none absolute inset-0 z-10 overflow-visible" width={CANVAS_W} height={CANVAS_H}>
            <defs>
              {ARROW_COLORS.map((c, i) => (
                <marker key={i} id={`vfb-arrow-${i}`} markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L9,4.5 L0,9 z" fill={c} />
                </marker>
              ))}
            </defs>

            {connectionPaths.map((p) => {
              const active = hoverKey === p.key || selectedRuleIndex === p.from || selectedRuleIndex === p.to;
              const opacity = !anyFocus || active ? 1 : 0.28;
              const labelW = Math.min(150, (p.label || "").length * 5.6 + 16);
              return (
                <g key={p.id} style={{ opacity, transition: "opacity .15s" }}>
                  <path d={p.d} fill="none" stroke="#ffffff" strokeWidth={active ? 6 : 5} strokeLinecap="round" />
                  <path
                    d={p.d}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={active ? 3 : 2.25}
                    strokeLinecap="round"
                    markerEnd={`url(#vfb-arrow-${p.colorIdx})`}
                  />
                  {active && p.label ? (
                    <g>
                      <rect x={p.midX - labelW / 2} y={p.midY - 9} width={labelW} height={18} rx={9} fill={p.color} />
                      <text x={p.midX} y={p.midY + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
                        {(p.label || "").length > 22 ? `${p.label.slice(0, 21)}…` : p.label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {/* ───── Flow Start card ───── */}
          {(() => {
            const pos = nodePositions.flow_start || { x: 40, y: 60 };
            return (
              <div
                onClick={() => {
                  if (consumeDragClick()) return;
                  setSelectedRuleIndex(rootIndex);
                }}
                onMouseDown={() => {
                  dragMovedRef.current = false;
                }}
                className="flow-node-card absolute cursor-pointer rounded-2xl bg-white shadow-xl ring-2 ring-emerald-600 transition-shadow hover:shadow-2xl"
                style={{ width: CARD_W, height: START_H, transform: `translate(${pos.x}px, ${pos.y}px)`, zIndex: draggedNode === "flow_start" ? 40 : 20 }}
              >
                <div
                  onMouseDown={(e) => handleNodeDragStart("flow_start", e)}
                  className="flex cursor-move items-center gap-2 rounded-t-2xl bg-emerald-700 px-3 text-white"
                  style={{ height: HEADER_H }}
                >
                  <Workflow className="h-4 w-4" />
                  <span className="text-xs font-bold tracking-wide">Flow Start</span>
                </div>
                <div className="space-y-1.5 p-2.5">
                  <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">
                    Incoming customer message
                  </div>
                  <p className="text-[10px] leading-snug text-emerald-700">Triggers the welcome greeting →</p>
                </div>
                <div
                  className="absolute h-3 w-3 rounded-full border-2 border-emerald-600 bg-emerald-600 shadow"
                  style={{ right: -6, top: START_OUT_Y - 6 }}
                />
              </div>
            );
          })()}

          {/* ───── Message cards ───── */}
          {rules.map((rule, index) => {
            const key = `rule_${index}`;
            const pos = nodePositions[key] || { x: 490, y: 60 };
            const isRoot = index === rootIndex;
            const type = rule.responseType || "button";
            const items = getItems(rule);
            const isList = type === "list";
            const isMedia = type === "media";
            const isCta = type === "cta_url";
            const mediaInfo = getRuleMediaInfo(rule);
            const bodyText = rule.responseConfig?.body || rule.responseConfig?.text || rule.responseConfig?.caption || "";
            const isSelected = selectedRuleIndex === index;
            const isConnectTarget = activeConnectPort && activeConnectPort.ruleIndex !== index && !isRoot;
            const incoming = incomingMap[index] || [];
            const triggerLabel =
              rule.triggerType === "button_press"
                ? "⚡ Button"
                : rule.triggerType === "list_row"
                  ? "⚡ List row"
                  : rule.triggerType === "first_message"
                    ? "👋 Greeting"
                    : rule.triggerType === "always"
                      ? "∞ Fallback"
                      : "🔑 Keyword";
            const portOwnerActive = activeConnectPort?.ruleIndex === index;

            return (
              <div
                key={key}
                ref={(el) => {
                  if (el) cardRefs.current[index] = el;
                  else delete cardRefs.current[index];
                }}
                onMouseDown={() => {
                  dragMovedRef.current = false;
                }}
                onClick={() => {
                  if (consumeDragClick()) return;
                  if (isConnectTarget) {
                    connectItem(activeConnectPort.itemId, index);
                  } else if (activeConnectPort && isRoot) {
                    setActiveConnectPort(null);
                  } else {
                    setSelectedRuleIndex(index);
                  }
                }}
                className={`flow-node-card absolute cursor-pointer rounded-2xl bg-white shadow-xl shadow-zinc-400/20 ring-1 transition-shadow ${isConnectTarget
                    ? "ring-2 ring-emerald-500"
                    : isSelected
                      ? "ring-2 ring-emerald-600"
                      : "ring-zinc-300 hover:ring-zinc-400"
                  }`}
                style={{
                  width: CARD_W,
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                  zIndex: draggedNode === key || portOwnerActive ? 45 : isSelected ? 30 : 20,
                }}
              >
                {/* input dot (aligned with header centre) */}
                {!isRoot && (
                  <div
                    className={`absolute h-3 w-3 rounded-full border-2 border-emerald-600 shadow ${incoming.length ? "bg-emerald-600" : "bg-white"
                      } ${isConnectTarget ? "scale-150 ring-2 ring-emerald-400" : ""}`}
                    style={{ left: -6, top: IN_Y - 6 }}
                    title="Input"
                  />
                )}
                {isRoot && (
                  <div
                    className="absolute h-3 w-3 rounded-full border-2 border-emerald-600 bg-emerald-600 shadow"
                    style={{ left: -6, top: IN_Y - 6 }}
                  />
                )}

                {/* header */}
                <div
                  onMouseDown={(e) => handleNodeDragStart(key, e)}
                  className={`flex cursor-move items-center justify-between gap-1 rounded-t-2xl border-b px-2.5 ${isSelected ? "border-emerald-200 bg-emerald-50/80" : "border-zinc-100 bg-[#f8fafc]"
                    }`}
                  style={{ height: HEADER_H }}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${isMedia
                          ? "bg-purple-500/15 text-purple-600"
                          : isList
                            ? "bg-blue-500/15 text-blue-600"
                            : isCta
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-emerald-500/15 text-emerald-600"
                        }`}
                    >
                      {isMedia ? <ImageIcon className="h-3.5 w-3.5" /> : isList ? <List className="h-3.5 w-3.5" /> : isCta ? <Globe className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    </span>
                    <span className="truncate text-xs font-bold text-zinc-800">
                      {rule.name || (isRoot ? "Welcome Message" : `Message ${index + 1}`)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRuleIndex(index);
                      }}
                      className="rounded-md p-1 text-emerald-700 transition hover:bg-emerald-100"
                      title="Edit"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        testRule(rule);
                      }}
                      className="rounded-md p-1 text-zinc-400 transition hover:text-emerald-600"
                      title="Test in phone"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {!isRoot && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNode(index);
                        }}
                        className="rounded-md p-1 text-zinc-400 transition hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* body */}
                <div className="space-y-2 p-2.5 text-zinc-700">
                  {/* trigger strip + incoming */}
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="shrink-0 font-semibold uppercase tracking-wide text-zinc-400">{triggerLabel}</span>
                    <div className="flex min-w-0 items-center gap-1">
                      {rule.responseConfig?.delay ? (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[9px] font-medium text-amber-700">
                          <Clock className="h-2.5 w-2.5" />
                          {rule.responseConfig.delay}s
                        </span>
                      ) : null}
                      {rule.triggerType === "keyword" || rule.triggerType === "always" ? (
                        <span className="truncate font-mono text-zinc-500">{rule.triggerValue || "Automatic"}</span>
                      ) : null}
                    </div>
                  </div>

                  {incoming.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[9px] font-semibold uppercase text-zinc-400">From</span>
                      {incoming.slice(0, 3).map((inc, i) => (
                        <span
                          key={i}
                          className="max-w-[110px] truncate rounded px-1.5 py-0.5 text-[9px] font-bold"
                          style={{ background: `${inc.color}1f`, color: inc.color }}
                          title={`${inc.from} → ${inc.title}`}
                        >
                          {inc.title}
                        </span>
                      ))}
                      {incoming.length > 3 && <span className="text-[9px] text-zinc-400">+{incoming.length - 3}</span>}
                    </div>
                  )}

                  {/* media thumb */}
                  {mediaInfo.hasMedia && (
                    <div className="relative h-24 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
                      {mediaInfo.kind === "image" ? (
                        <img
                          src={mediaInfo.url}
                          alt="Attached"
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.target.style.display = "none";
                          }}
                        />
                      ) : mediaInfo.kind === "video" ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-900 text-white">
                          <Video className="h-5 w-5 text-purple-400" />
                          <span className="text-[10px]">Video attached</span>
                        </div>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-50 text-zinc-500">
                          <FileText className="h-5 w-5 text-emerald-600" />
                          <span className="text-[10px] font-medium">Document attached</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* message bubble */}
                  <div className="line-clamp-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px] leading-relaxed text-zinc-800">
                    {bodyText || <span className="italic text-zinc-400">Empty message…</span>}
                  </div>

                  {isCta && (
                    <div className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800">
                      <Globe className="h-3 w-3 text-amber-600" />
                      <span className="truncate">{rule.responseConfig?.displayText || "Visit Link"}</span>
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </div>
                  )}

                  {/* ports: reply buttons / list rows */}
                  {(type === "button" || isList) && (
                    <div className="space-y-1.5">
                      {isList && (
                        <div className="flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          <List className="h-3 w-3" />
                          <span className="truncate">{rule.responseConfig?.buttonLabel || "View Options"}</span>
                        </div>
                      )}

                      {items.map((item, itemIdx) => {
                        const id = item.id?.trim();
                        const child = id ? buttonMap[id] : null;
                        const color = BUTTON_COLORS[itemIdx % BUTTON_COLORS.length];
                        const pk = `${index}|${id}`;
                        const isPortActive = activeConnectPort?.itemId === id && activeConnectPort?.ruleIndex === index;
                        return (
                          <div
                            key={`${id || "x"}-${itemIdx}`}
                            onMouseEnter={() => child && setHoverKey(pk)}
                            onMouseLeave={() => setHoverKey(null)}
                            className={`group relative flex items-center gap-1.5 rounded-lg bg-white pl-2 pr-4 text-[11px] shadow-sm ${isList ? "h-7" : "h-8"}`}
                            style={{
                              border: `1px solid ${child ? `${color}88` : "#e4e4e7"}`,
                              borderLeft: `4px solid ${color}`,
                            }}
                          >
                            <span className="min-w-0 flex-1 truncate font-semibold text-zinc-800">
                              {item.title || (isList ? `Option ${itemIdx + 1}` : `Button ${itemIdx + 1}`)}
                            </span>

                            {child ? (
                              <span
                                className="max-w-[88px] shrink-0 truncate rounded px-1 py-0.5 text-[9px] font-bold"
                                style={{ background: `${color}1f`, color }}
                                title={`Leads to: ${child.rule.name}`}
                              >
                                → {child.rule.name}
                              </span>
                            ) : (
                              <span className="shrink-0 text-[9px] italic text-zinc-400">not linked</span>
                            )}

                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                isList ? handleDeleteRow(index, itemIdx, item.id) : handleDeleteButton(index, itemIdx, item.id);
                              }}
                              className="shrink-0 rounded p-0.5 text-zinc-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>

                            {/* output port (measured for the connector start) */}
                            <div
                              ref={(el) => {
                                if (!id) return;
                                if (el) portRefs.current[pk] = el;
                                else delete portRefs.current[pk];
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!id) return;
                                setActiveConnectPort(
                                  isPortActive ? null : { ruleIndex: index, itemId: id, title: item.title || "Button" }
                                );
                              }}
                              className={`absolute h-3 w-3 cursor-pointer rounded-full border-2 shadow transition hover:scale-125 ${isPortActive ? "scale-125 ring-2 ring-offset-1" : ""
                                }`}
                              style={{
                                right: -6,
                                top: "calc(50% - 6px)",
                                borderColor: color,
                                background: child ? color : "#fff",
                                ...(isPortActive ? { boxShadow: `0 0 0 3px ${color}55` } : {}),
                              }}
                              title={child ? `Connected to “${child.rule.name}” – click to change` : "Click to connect"}
                            />

                            {/* connect popover */}
                            {isPortActive && (
                              <div
                                className="absolute right-0 top-full z-50 mt-1.5 w-60 space-y-2 rounded-xl border border-zinc-200 bg-white p-2.5 text-left text-xs shadow-2xl"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between border-b border-zinc-100 pb-1.5">
                                  <span className="truncate pr-2 text-[11px] font-bold text-zinc-800">
                                    Connect “{item.title || "Button"}”
                                  </span>
                                  <button type="button" onClick={() => setActiveConnectPort(null)} className="p-0.5 text-zinc-400 hover:text-zinc-600">
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>

                                {child && (
                                  <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800">
                                    <span className="truncate pr-1">
                                      Now: <strong>{child.rule.name}</strong>
                                    </span>
                                    <button type="button" onClick={() => disconnectItem(item.id)} className="shrink-0 font-semibold text-red-500">
                                      Disconnect
                                    </button>
                                  </div>
                                )}

                                <div data-no-zoom className="max-h-32 space-y-0.5 overflow-y-auto">
                                  {rules.map((r, ti) =>
                                    ti === index || ti === rootIndex ? null : (
                                      <button
                                        key={ti}
                                        type="button"
                                        onClick={() => connectItem(item.id, ti)}
                                        className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[11px] transition ${child?.index === ti ? "bg-emerald-600 font-semibold text-white" : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                                          }`}
                                      >
                                        <span className="truncate pr-2">{r.name || `Message ${ti + 1}`}</span>
                                        <span className="shrink-0 text-[9px] opacity-70">{child?.index === ti ? "Current" : "Link"}</span>
                                      </button>
                                    )
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleCreateChildBranch(item.title, item.id, index)}
                                  className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-emerald-500 bg-emerald-50 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                >
                                  <Plus className="h-3 w-3" />
                                  Create new message card
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {items.length < (isList ? 10 : 3) && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            isList ? handleAddRowToNode(index) : handleAddButtonToNode(index);
                          }}
                          className={`w-full rounded-lg border border-dashed py-1 text-center text-[10px] font-semibold transition ${isList
                              ? "border-blue-300 bg-blue-50/70 text-blue-700 hover:bg-blue-100"
                              : "border-emerald-300 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100"
                            }`}
                        >
                          {isList ? "+ Add row" : "+ Add button"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}