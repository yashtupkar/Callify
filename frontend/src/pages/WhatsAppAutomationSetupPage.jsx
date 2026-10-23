
// import { useEffect, useId, useMemo, useRef, useState } from "react";
// import { useNavigate, useParams } from "react-router-dom";
// import axios from "axios";
// import { SERVER_URL } from "@/lib/constants";
// import { useAuth } from "@/hooks/useAuth";
// import { toolOptions } from "@/components/whatsapp/automationKit";
// import CustomToolsEditor from "@/components/whatsapp/CustomToolsEditor";

// /* ────────────────────────────────────────────────────────────────────────────
//    WhatsApp automation setup — Tailwind CSS only (no shadcn / UI kit).
//    Replaces whatsappAutomationSetup.css. Needs Tailwind v3.4+ or v4 (arbitrary values).
//    ──────────────────────────────────────────────────────────────────────────── */

// const steps = [
//   ["Business", "Profile and language"],
//   ["Channel", "Connect WhatsApp"],
//   ["Knowledge", "Products and FAQs"],
//   ["Behavior", "Prompt and tools"],
//   ["Hours", "Availability"],
//   ["Auto-replies", "No-LLM rules"],
//   ["Test", "Try the workflow"],
//   ["Review", "Activate"],
// ];


// const languages = [
//   ["en-US", "English"],
//   ["hi-IN", "Hindi"],
//   ["mr-IN", "Marathi"],
//   ["gu-IN", "Gujarati"],
//   ["ta-IN", "Tamil"],
//   ["es-ES", "Spanish"],
// ];
// const industries = [
//   ["", "Select an industry"],
//   ["ecommerce", "E-commerce & Online Store"],
//   ["retail", "Retail & Shops"],
//   ["restaurants", "Restaurants & Food Services"],
//   ["travel", "Travel & Hospitality"],
//   ["healthcare", "Healthcare & Clinics"],
//   ["education", "Education & Coaching"],
//   ["real_estate", "Real Estate"],
//   ["finance", "Finance & Insurance"],
//   ["professional_services", "Professional Services"],
//   ["technology", "Technology & Software"],
//   ["marketing", "Marketing & Advertising"],
//   ["automotive", "Automotive"],
//   ["beauty_wellness", "Beauty & Wellness"],
//   ["fitness", "Fitness & Sports"],
//   ["logistics", "Logistics & Delivery"],
//   ["legal", "Legal Services"],
//   ["nonprofit", "Non-profit & NGO"],
//   ["government", "Government & Public Services"],
//   ["other", "Other"],
// ];
// const timezones = [
//   "Asia/Kolkata",
//   "Asia/Dubai",
//   "Asia/Singapore",
//   "Asia/Tokyo",
//   "Europe/London",
//   "Europe/Berlin",
//   "America/New_York",
//   "America/Los_Angeles",
//   "Australia/Sydney",
//   "UTC",
// ];
// const dayNames = [
//   "Monday",
//   "Tuesday",
//   "Wednesday",
//   "Thursday",
//   "Friday",
//   "Saturday",
//   "Sunday",
// ];
// const triggerTypes = [
//   ["keyword", "Keyword in message"],
//   ["button_press", "Button ID"],
//   ["list_row", "List row ID"],
//   ["first_message", "First message (welcome)"],
//   ["always", "Always (catch-all)"],
// ];
// const responseTypes = [
//   ["text", "Text"],
//   ["button", "Text + buttons"],
//   ["list", "Text + list"],
//   ["media", "Image / video / document"],
//   ["cta_url", "Website link"],
// ];

// const blankRule = () => ({
//   name: "",
//   triggerType: "keyword",
//   triggerValue: "",
//   matchMode: "contains",
//   responseType: "text",
//   responseConfig: { _type: "text", text: "" },
//   enabled: true,
//   priority: 0,
// });

// const emptyConfig = {
//   name: "",
//   businessName: "",
//   industry: "",
//   description: "",
//   businessPhone: "",
//   businessEmail: "",
//   websiteUrl: "",
//   address: "",
//   language: "en-US",
//   supportedLanguages: ["en-US"],
//   timezone: "Asia/Kolkata",
//   systemPrompt: "",
//   initialMessage: "",
//   fallbackMode: "ai",
//   fallbackMessage:
//     "Thanks for your message. Our team will get back to you shortly.",
//   handoffKeywords: "human, agent, representative",
//   handoffMessage: "I will connect you with a team member.",
//   tone: "friendly",
//   responseLength: "balanced",
//   provider: "baileys",
//   meta: {
//     phoneNumber: "",
//     phoneNumberId: "",
//     apiToken: "",
//     verifyToken: "",
//     appSecret: "",
//     businessId: "",
//   },
//   products: [],
//   faqs: [],
//   knowledge: "",
//   tools: [],
//   hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
//     dayOfWeek,
//     enabled: dayOfWeek < 6,
//     openTime: "09:00",
//     closeTime: "18:00",
//   })),
//   awayMessage:
//     "We are currently closed. We will respond during business hours.",
//   afterHoursMode: "both",
//   typingDelay: "0",
//   rules: [],
// };

// /* ───────────────────────────── helpers ───────────────────────────── */

// const cn = (...parts) => parts.filter(Boolean).join(" ");
// const splitList = (value) =>
//   String(value || "")
//     .split(",")
//     .map((item) => item.trim())
//     .filter(Boolean);
// const patchAt = (list, index, patch) =>
//   list.map((item, i) => (i === index ? { ...item, ...patch } : item));
// const randomToken = () =>
//   `vt_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;

// function normalizeHours(list) {
//   const rows = Array.isArray(list) ? list : [];
//   return emptyConfig.hours.map((fallback) => {
//     const row = rows.find((h) => Number(h?.dayOfWeek) === fallback.dayOfWeek);
//     if (!row) return fallback;
//     return {
//       dayOfWeek: fallback.dayOfWeek,
//       enabled: row.enabled ?? fallback.enabled,
//       openTime: row.openTime || fallback.openTime,
//       closeTime: row.closeTime || fallback.closeTime,
//     };
//   });
// }

// function normalizeConfig(automation) {
//   const onboarding = automation?.promptConfig?.onboarding || {};
//   const saved = automation?.promptConfig?.setup || {};
//   return {
//     ...emptyConfig,
//     ...saved,
//     meta: { ...emptyConfig.meta, ...(saved.meta || {}) },
//     name: automation?.name || "",
//     businessName:
//       automation?.businessName ||
//       saved.businessName ||
//       onboarding.businessProfile?.businessName ||
//       "",
//     description: automation?.description || saved.description || "",
//     industry: automation?.industry || saved.industry || onboarding.businessProfile?.industry || "",
//     businessPhone: automation?.businessPhone || saved.businessPhone || "",
//     businessEmail: automation?.businessEmail || saved.businessEmail || "",
//     websiteUrl: automation?.websiteUrl || saved.websiteUrl || "",
//     address: automation?.address || saved.address || "",
//     language: automation?.language || "en-US",
//     supportedLanguages: automation?.supportedLanguages?.length
//       ? automation.supportedLanguages
//       : ["en-US"],
//     timezone: automation?.timezone || "Asia/Kolkata",
//     systemPrompt: automation?.systemPrompt || "",
//     initialMessage: automation?.initialMessage || "",
//     fallbackMode: automation?.fallbackMode || saved.fallbackMode || "ai",
//     fallbackMessage: automation?.fallbackMessage || saved.fallbackMessage || emptyConfig.fallbackMessage,
//     handoffMessage: automation?.handoffMessage || saved.handoffMessage || emptyConfig.handoffMessage,
//     handoffKeywords: automation?.handoffKeywords?.join(", ") || saved.handoffKeywords || emptyConfig.handoffKeywords,
//     tone: automation?.tone || saved.tone || "friendly",
//     responseLength: automation?.responseLength || saved.responseLength || "balanced",
//     tools: (automation?.tools || onboarding.tools || []).map((tool) => ({
//       ...tool,
//       enabled: tool.enabled !== false,
//     })),
//     products: saved.products || automation?.products || [],
//     faqs: saved.faqs || automation?.faqs || [],
//     hours: normalizeHours(saved.hours?.length ? saved.hours : automation?.businessHours),
//     rules: saved.rules || automation?.autoReplies || [],
//   };
// }

// function parseRule(rule) {
//   let responseConfig = rule.responseConfig;
//   if (!responseConfig) {
//     try {
//       responseConfig = JSON.parse(rule.response);
//     } catch {
//       responseConfig = {
//         _type: rule.responseType || "text",
//         text: rule.response || "",
//       };
//     }
//   }
//   return { ...rule, responseConfig };
// }

// function responseText(response) {
//   if (!response) return "";
//   if (response._type === "text") return response.text || "";
//   return response.body || response.caption || response.text || "";
// }

// function defaultResponse(type, carriedText = "") {
//   if (type === "button")
//     return {
//       _type: "button",
//       body: carriedText,
//       buttons: [{ id: "", title: "" }],
//     };
//   if (type === "media")
//     return {
//       _type: "media",
//       mediaType: "image",
//       url: "",
//       caption: carriedText,
//     };
//   if (type === "list")
//     return {
//       _type: "list",
//       body: carriedText,
//       buttonLabel: "View Options",
//       sections: [{ title: "Options", rows: [{ id: "", title: "" }] }],
//     };
//   if (type === "cta_url")
//     return { _type: "cta_url", body: carriedText, displayText: "", url: "" };
//   return { _type: "text", text: carriedText };
// }

// function buildPrompt(config, tools) {
//   return [
//     `You are the WhatsApp assistant for ${config.businessName || "the business"}.`,
//     config.description,
//     config.knowledge,
//     `Be ${config.tone} and keep replies ${config.responseLength}.`,
//     `Use only confirmed business information. Enabled tools: ${tools.join(", ") || "none"}.`,
//     "Return one JSON response using the supported WhatsApp response types.",
//   ]
//     .filter(Boolean)
//     .join("\n\n");
// }

// /* ───────────────────────────── validation ───────────────────────────── */

// const isPhone = (value) => {
//   const digits = value.replace(/\D/g, "");
//   return (
//     /^\+?[\d\s().-]+$/.test(value) && digits.length >= 7 && digits.length <= 15
//   );
// };
// const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
// const isUrl = (value, httpsOnly = false) => {
//   try {
//     const url = new URL(value);
//     return httpsOnly
//       ? url.protocol === "https:"
//       : ["http:", "https:"].includes(url.protocol);
//   } catch {
//     return false;
//   }
// };
// const isTimezone = (value) => {
//   try {
//     new Intl.DateTimeFormat("en", { timeZone: value });
//     return true;
//   } catch {
//     return false;
//   }
// };
// const blank = (value) => !String(value ?? "").trim();

// function validateBusiness(c) {
//   const e = {};
//   if (blank(c.name)) e.name = "Give this automation a name.";
//   else if (c.name.trim().length < 3) e.name = "Use at least 3 characters.";
//   else if (c.name.length > 60) e.name = "Keep it under 60 characters.";
//   if (blank(c.businessName)) e.businessName = "Business name is required.";
//   else if (c.businessName.trim().length < 2)
//     e.businessName = "Use at least 2 characters.";
//   else if (c.businessName.length > 80)
//     e.businessName = "Keep it under 80 characters.";
//   if (!blank(c.businessPhone) && !isPhone(c.businessPhone))
//     e.businessPhone =
//       "Enter a valid phone with 7–15 digits, e.g. +91 98765 43210.";
//   if (!blank(c.businessEmail) && !isEmail(c.businessEmail))
//     e.businessEmail = "Enter a valid email address.";
//   if (!blank(c.websiteUrl) && !isUrl(c.websiteUrl.trim()))
//     e.websiteUrl = "Enter a full URL starting with http:// or https://";
//   if ((c.description || "").length > 500)
//     e.description = "Keep the description under 500 characters.";
//   if ((c.address || "").length > 300)
//     e.address = "Keep the address under 300 characters.";
//   if (blank(c.timezone) || !isTimezone(c.timezone))
//     e.timezone = "Choose a valid timezone.";
//   return e;
// }

// function validateChannel(c) {
//   const e = {};
//   if (c.provider !== "cloud_api") return e;
//   const m = c.meta;
//   if (blank(m.phoneNumber))
//     e["meta.phoneNumber"] = "Display phone number is required.";
//   else if (!isPhone(m.phoneNumber))
//     e["meta.phoneNumber"] = "Enter a valid phone number.";
//   if (blank(m.phoneNumberId))
//     e["meta.phoneNumberId"] = "Phone Number ID is required.";
//   else if (!/^\d{10,20}$/.test(m.phoneNumberId.trim()))
//     e["meta.phoneNumberId"] =
//       "Use the numeric ID from Meta API Setup (10–20 digits).";
//   if (blank(m.businessId))
//     e["meta.businessId"] = "WhatsApp Business Account ID is required.";
//   else if (!/^\d{10,20}$/.test(m.businessId.trim()))
//     e["meta.businessId"] = "Use the numeric WABA ID (10–20 digits).";
//   if (blank(m.apiToken)) e["meta.apiToken"] = "Access token is required.";
//   else if (/\s/.test(m.apiToken) || m.apiToken.trim().length < 20)
//     e["meta.apiToken"] = "Token looks too short or contains spaces.";
//   if (blank(m.verifyToken))
//     e["meta.verifyToken"] = "Verify token is required — generate one.";
//   else if (!/^\S{8,64}$/.test(m.verifyToken.trim()))
//     e["meta.verifyToken"] = "Use 8–64 characters with no spaces.";
//   if (!blank(m.appSecret) && !/^[a-f0-9]{32}$/i.test(m.appSecret.trim()))
//     e["meta.appSecret"] = "App secret should be 32 hexadecimal characters.";
//   return e;
// }

// function validateKnowledge(c) {
//   const e = {};
//   if ((c.knowledge || "").length > 5000)
//     e.knowledge = "Keep general knowledge under 5,000 characters.";
//   c.products.forEach((p, i) => {
//     if (blank(p.name)) e[`products.${i}.name`] = "Product name is required.";
//     else if (p.name.length > 80) e[`products.${i}.name`] = "Max 80 characters.";
//     if ((p.price || "").length > 40)
//       e[`products.${i}.price`] = "Max 40 characters.";
//     if ((p.description || "").length > 300)
//       e[`products.${i}.description`] = "Max 300 characters.";
//   });
//   c.faqs.forEach((f, i) => {
//     if (blank(f.question)) e[`faqs.${i}.question`] = "Question is required.";
//     else if (f.question.length > 200)
//       e[`faqs.${i}.question`] = "Max 200 characters.";
//     if (blank(f.answer)) e[`faqs.${i}.answer`] = "Answer is required.";
//     else if (f.answer.length > 1000)
//       e[`faqs.${i}.answer`] = "Max 1,000 characters.";
//   });
//   return e;
// }

// function validateBehavior(c) {
//   const e = {};
//   if ((c.initialMessage || "").length > 1024)
//     e.initialMessage =
//       "WhatsApp text messages are limited to 1,024 characters here.";
//   if ((c.systemPrompt || "").length > 8000)
//     e.systemPrompt = "Keep instructions under 8,000 characters.";
//   const keywords = splitList(c.handoffKeywords);
//   if (keywords.some((k) => k.length < 2))
//     e.handoffKeywords = "Each keyword needs at least 2 characters.";
//   if (keywords.length && blank(c.handoffMessage))
//     e.handoffMessage = "Add the message sent when a handoff happens.";
//   if ((c.handoffMessage || "").length > 1024)
//     e.handoffMessage = "Max 1,024 characters.";
//   if (c.fallbackMode === "fixed" && blank(c.fallbackMessage))
//     e.fallbackMessage = "A fixed fallback needs a message.";
//   if ((c.fallbackMessage || "").length > 1024)
//     e.fallbackMessage = "Max 1,024 characters.";
//   return e;
// }

// function validateHours(c) {
//   const e = {};
//   if (!c.hours.some((h) => h.enabled))
//     e.hours = "Enable at least one working day.";
//   c.hours.forEach((h, i) => {
//     if (!h.enabled) return;
//     if (!h.openTime) e[`hours.${i}.openTime`] = "Set an opening time.";
//     if (!h.closeTime) e[`hours.${i}.closeTime`] = "Set a closing time.";
//     if (h.openTime && h.closeTime && h.closeTime <= h.openTime)
//       e[`hours.${i}.closeTime`] = "Closing time must be after opening time.";
//   });
//   if (c.afterHoursMode !== "none" && blank(c.awayMessage))
//     e.awayMessage = "Away message is required for this mode.";
//   if ((c.awayMessage || "").length > 1024)
//     e.awayMessage = "Max 1,024 characters.";
//   return e;
// }

// function validateRules(c) {
//   const e = {};
//   const seen = new Map();
//   c.rules.forEach((rule, i) => {
//     const p = `rules.${i}`;
//     const r = rule.responseConfig || {};
//     if (blank(rule.name)) e[`${p}.name`] = "Name this rule.";
//     else if (rule.name.length > 60) e[`${p}.name`] = "Max 60 characters.";

//     if (rule.triggerType === "keyword") {
//       if (blank(rule.triggerValue))
//         e[`${p}.triggerValue`] = "Enter the keyword or phrase to match.";
//       else if (rule.triggerValue.length > 100)
//         e[`${p}.triggerValue`] = "Max 100 characters.";
//     } else if (
//       rule.triggerType === "button_press" ||
//       rule.triggerType === "list_row"
//     ) {
//       if (blank(rule.triggerValue))
//         e[`${p}.triggerValue`] = "Enter the button / row ID.";
//       else if (!/^[\w-]{1,200}$/.test(rule.triggerValue.trim()))
//         e[`${p}.triggerValue`] =
//           "Use letters, numbers, dashes and underscores only.";
//     } else if (
//       rule.triggerType === "first_message" &&
//       rule.enabled &&
//       c.rules.some(
//         (other, j) =>
//           j < i && other.enabled && other.triggerType === "first_message",
//       )
//     ) {
//       e[`${p}.triggerType`] =
//         "Only one welcome rule can run; this one will never fire.";
//     } else if (
//       rule.triggerType === "always" &&
//       rule.enabled &&
//       c.rules.slice(i + 1).some((next) => next.enabled)
//     ) {
//       e[`${p}.triggerType`] =
//         "A catch-all matches everything — move it to the bottom.";
//     }

//     if (
//       rule.enabled &&
//       rule.triggerType !== "always" &&
//       rule.triggerType !== "first_message" &&
//       !blank(rule.triggerValue)
//     ) {
//       const key = `${rule.triggerType}|${rule.matchMode}|${rule.triggerValue.trim().toLowerCase()}`;
//       if (seen.has(key))
//         e[`${p}.triggerValue`] =
//           `Same trigger as rule ${seen.get(key) + 1}; this one will never fire.`;
//       else seen.set(key, i);
//     }

//     const att = r.attachment;
//     if (att && att.kind && att.kind !== "none") {
//       if (blank(att.url)) e[`${p}.attachmentUrl`] = "URL is required.";
//       else if (!isUrl(att.url.trim(), true))
//         e[`${p}.attachmentUrl`] = "Use a full https:// URL.";
//     }

//     const body = r.text ?? r.body ?? "";
//     if (rule.responseType === "text") {
//       if (blank(r.text)) e[`${p}.body`] = "Reply text is required.";
//       else if (r.text.length > 1024) e[`${p}.body`] = "Max 1,024 characters.";
//     } else if (rule.responseType === "button") {
//       if (blank(r.body)) e[`${p}.body`] = "Reply text is required.";
//       else if (r.body.length > 1024) e[`${p}.body`] = "Max 1,024 characters.";
//       const buttons = r.buttons || [];
//       if (!buttons.length) e[`${p}.buttons`] = "Add at least one button.";
//       const ids = new Set();
//       buttons.forEach((b, j) => {
//         if (blank(b.title)) e[`${p}.buttons.${j}.title`] = "Title required.";
//         else if (b.title.length > 20)
//           e[`${p}.buttons.${j}.title`] = "Max 20 characters.";
//         if (blank(b.id)) e[`${p}.buttons.${j}.id`] = "ID required.";
//         else if (!/^[\w-]{1,256}$/.test(b.id.trim()))
//           e[`${p}.buttons.${j}.id`] = "Letters, numbers, - and _ only.";
//         else if (ids.has(b.id.trim()))
//           e[`${p}.buttons.${j}.id`] = "Duplicate ID.";
//         else ids.add(b.id.trim());
//       });
//     } else if (rule.responseType === "list") {
//       if (blank(r.body)) e[`${p}.body`] = "Reply text is required.";
//       else if (r.body.length > 1024) e[`${p}.body`] = "Max 1,024 characters.";
//       if (blank(r.buttonLabel))
//         e[`${p}.buttonLabel`] = "Menu button label is required.";
//       else if (r.buttonLabel.length > 20)
//         e[`${p}.buttonLabel`] = "Max 20 characters.";
//       const rows = r.sections?.[0]?.rows || [];
//       if (!rows.length) e[`${p}.rows`] = "Add at least one row.";
//       else if (rows.length > 10) e[`${p}.rows`] = "Max 10 rows.";
//       const ids = new Set();
//       rows.forEach((row, j) => {
//         const q = `${p}.sections.0.rows.${j}`;
//         if (blank(row.title)) e[`${q}.title`] = "Title required.";
//         else if (row.title.length > 24) e[`${q}.title`] = "Max 24 characters.";
//         if (blank(row.id)) e[`${q}.id`] = "ID required.";
//         else if (!/^[\w-]{1,200}$/.test(row.id.trim()))
//           e[`${q}.id`] = "Letters, numbers, - and _ only.";
//         else if (ids.has(row.id.trim())) e[`${q}.id`] = "Duplicate ID.";
//         else ids.add(row.id.trim());
//       });
//     } else if (rule.responseType === "media") {
//       if (blank(r.url)) e[`${p}.url`] = "Media URL is required.";
//       else if (!isUrl(r.url.trim(), true))
//         e[`${p}.url`] = "Use a public https:// URL.";
//       if ((r.caption || "").length > 1024)
//         e[`${p}.caption`] = "Max 1,024 characters.";
//     } else if (rule.responseType === "cta_url") {
//       if (blank(r.body)) e[`${p}.body`] = "Reply text is required.";
//       else if (body.length > 1024) e[`${p}.body`] = "Max 1,024 characters.";
//       if (blank(r.displayText))
//         e[`${p}.displayText`] = "Button label is required.";
//       else if (r.displayText.length > 20)
//         e[`${p}.displayText`] = "Max 20 characters.";
//       if (blank(r.url)) e[`${p}.url`] = "Link is required.";
//       else if (!isUrl(r.url.trim(), true))
//         e[`${p}.url`] = "Use a full https:// URL.";
//     }
//   });
//   return e;
// }

// const stepValidators = [
//   validateBusiness,
//   validateChannel,
//   validateKnowledge,
//   validateBehavior,
//   validateHours,
//   validateRules,
//   () => ({}),
//   () => ({}),
// ];

// /* ───────────────────────────── bot simulator ───────────────────────────── */

// function matchesRule(rule, lower, id, isFirst) {
//   const value = (rule.triggerValue || "").trim();
//   if (rule.triggerType === "first_message") return isFirst;
//   if (rule.triggerType === "always") return true;
//   if (rule.triggerType === "button_press" || rule.triggerType === "list_row")
//     return !!id && id === value;
//   if (id || !value) return false;
//   const v = value.toLowerCase();
//   if (rule.matchMode === "exact") return lower === v;
//   if (rule.matchMode === "starts_with") return lower.startsWith(v);
//   return lower.includes(v);
// }

// function runBot(config, { text, id, afterHours, isFirst }) {
//   const replies = [];
//   if (afterHours) {
//     if (config.afterHoursMode === "none") return { silent: true, replies };
//     replies.push({ text: config.awayMessage, source: "Away message" });
//     if (config.afterHoursMode === "away") return { replies };
//   }
//   const lower = text.toLowerCase();
//   if (
//     !id &&
//     splitList(config.handoffKeywords).some((k) =>
//       lower.includes(k.toLowerCase()),
//     )
//   ) {
//     replies.push({ text: config.handoffMessage, source: "Human handoff" });
//     return { replies };
//   }
//   const rule = config.rules.find(
//     (item) => item.enabled && matchesRule(item, lower, id, isFirst),
//   );
//   if (rule) {
//     const r = rule.responseConfig || {};
//     replies.push({
//       text: responseText(r),
//       buttons:
//         rule.responseType === "button"
//           ? (r.buttons || []).filter((b) => b.title)
//           : rule.responseType === "list"
//             ? (r.sections?.[0]?.rows || []).filter((row) => row.title)
//             : undefined,
//       media: rule.responseType === "media" ? r : undefined,
//       cta: rule.responseType === "cta_url" ? r : undefined,
//       source: `Auto-reply · ${rule.name || "untitled rule"}`,
//     });
//   } else if (config.fallbackMode === "fixed") {
//     replies.push({ text: config.fallbackMessage, source: "Fixed fallback" });
//   } else {
//     replies.push({
//       text: "🤖 The AI would answer this using your instructions and knowledge base.",
//       source: "LLM fallback",
//     });
//   }
//   return { replies };
// }

// /* ───────────────────────────── UI primitives ───────────────────────────── */

// const inputBase =
//   "w-full rounded-lg border bg-[#0c0c0f] px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50";
// const inputTone = (error) =>
//   error
//     ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/20"
//     : "border-[#26262b] hover:border-[#3a3a42] focus:border-sky-500 focus:ring-sky-500/20";

// const buttonVariants = {
//   default:
//     "border-[#26262b] bg-[#16161a] text-zinc-100 hover:border-[#3a3a42] hover:bg-[#1b1b20]",
//   primary:
//     "border-sky-600 bg-sky-600 text-white hover:bg-sky-500 hover:border-sky-500 font-semibold",
//   danger: "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20",
//   ghost: "border-transparent bg-transparent text-zinc-300 hover:bg-white/5",
// };
// const buttonSizes = {
//   md: "px-4 py-2 text-sm",
//   sm: "px-2.5 py-1.5 text-xs",
//   icon: "h-8 w-8 justify-center text-base",
// };

// function Button({
//   variant = "default",
//   size = "md",
//   className,
//   type = "button",
//   ...props
// }) {
//   return (
//     <button
//       type={type}
//       className={cn(
//         "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-45",
//         buttonVariants[variant],
//         buttonSizes[size],
//         className,
//       )}
//       {...props}
//     />
//   );
// }

// function Icon({ name, className = "h-4 w-4" }) {
//   const paths = {
//     check: "M5 13l4 4L19 7",
//     x: "M6 6l12 12M18 6L6 18",
//     plus: "M12 5v14M5 12h14",
//     arrowLeft: "M15 19l-7-7 7-7",
//     arrowRight: "M9 5l7 7-7 7",
//     alert:
//       "M12 9v4m0 4h.01M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
//     up: "M5 15l7-7 7 7",
//     down: "M19 9l-7 7-7-7",
//     copy: "M8 8h10v12H8zM6 16H4V4h10v2",
//     link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
//   };
//   return (
//     <svg
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//       className={className}
//       aria-hidden="true"
//     >
//       <path d={paths[name]} />
//     </svg>
//   );
// }

// function FieldShell({
//   id,
//   label,
//   required,
//   error,
//   hint,
//   count,
//   max,
//   className,
//   children,
// }) {
//   return (
//     <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
//       {label && (
//         <div className="flex items-baseline justify-between gap-2">
//           <label htmlFor={id} className="text-xs font-medium text-zinc-300">
//             {label}
//             {required && <span className="ml-0.5 text-red-400">*</span>}
//           </label>
//           {max ? (
//             <span
//               className={cn(
//                 "text-[11px] tabular-nums",
//                 count > max ? "text-red-400" : "text-zinc-600",
//               )}
//             >
//               {count}/{max}
//             </span>
//           ) : null}
//         </div>
//       )}
//       {children}
//       {error ? (
//         <p
//           id={`${id}-error`}
//           role="alert"
//           className="flex items-start gap-1 text-xs text-red-400"
//         >
//           <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
//           {error}
//         </p>
//       ) : hint ? (
//         <p className="text-[11px] text-zinc-500">{hint}</p>
//       ) : null}
//     </div>
//   );
// }

// const slugify = (text) =>
//   String(text || "")
//     .toLowerCase()
//     .normalize("NFKD")
//     .replace(/[^\w\s-]/g, "")
//     .trim()
//     .replace(/[\s_-]+/g, "-")
//     .slice(0, 40);

// const AUTO_ID = /-(btn|row)-\d+$/;
// const autoId = (ruleName, kind, n, ruleIndex) =>
//   `${slugify(ruleName) || `rule-${ruleIndex + 1}`}-${kind}-${n}`;

// function TextField({
//   label,
//   value,
//   onChange,
//   onBlur,
//   error,
//   hint,
//   required,
//   className,
//   max,
//   type = "text",
//   ...rest
// }) {
//   const id = useId();
//   return (
//     <FieldShell
//       id={id}
//       label={label}
//       required={required}
//       error={error}
//       hint={hint}
//       className={className}
//       count={(value || "").length}
//       max={max}
//     >
//       <input
//         id={id}
//         type={type}
//         value={value || ""}
//         onChange={(e) => onChange(e.target.value)}
//         onBlur={onBlur}
//         aria-invalid={!!error}
//         aria-describedby={error ? `${id}-error` : undefined}
//         className={cn(inputBase, inputTone(error))}
//         {...rest}
//       />
//     </FieldShell>
//   );
// }

// function TextArea({
//   label,
//   value,
//   onChange,
//   onBlur,
//   error,
//   hint,
//   required,
//   className,
//   max,
//   rows = 3,
//   ...rest
// }) {
//   const id = useId();
//   return (
//     <FieldShell
//       id={id}
//       label={label}
//       required={required}
//       error={error}
//       hint={hint}
//       className={className}
//       count={(value || "").length}
//       max={max}
//     >
//       <textarea
//         id={id}
//         rows={rows}
//         value={value || ""}
//         onChange={(e) => onChange(e.target.value)}
//         onBlur={onBlur}
//         aria-invalid={!!error}
//         aria-describedby={error ? `${id}-error` : undefined}
//         className={cn(inputBase, inputTone(error), "resize-y")}
//         {...rest}
//       />
//     </FieldShell>
//   );
// }

// function SelectField({
//   label,
//   value,
//   onChange,
//   onBlur,
//   options,
//   error,
//   hint,
//   required,
//   className,
// }) {
//   const id = useId();
//   return (
//     <FieldShell
//       id={id}
//       label={label}
//       required={required}
//       error={error}
//       hint={hint}
//       className={className}
//     >
//       <select
//         id={id}
//         value={value}
//         onChange={(e) => onChange(e.target.value)}
//         onBlur={onBlur}
//         aria-invalid={!!error}
//         className={cn(
//           inputBase,
//           inputTone(error),
//           "appearance-none bg-[length:16px] bg-[right_0.7rem_center] bg-no-repeat pr-9",
//         )}
//         style={{
//           backgroundImage:
//             "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b8b95' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
//         }}
//       >
//         {options.map((option) => {
//           const [v, l] = Array.isArray(option) ? option : [option, option];
//           return (
//             <option key={v} value={v}>
//               {l}
//             </option>
//           );
//         })}
//       </select>
//     </FieldShell>
//   );
// }

// function Toggle({ checked, onChange, label, ariaLabel }) {
//   return (
//     <button
//       type="button"
//       role="switch"
//       aria-checked={checked}
//       aria-label={ariaLabel || label}
//       onClick={() => onChange(!checked)}
//       className="group inline-flex items-center gap-2.5 text-sm text-zinc-200 focus-visible:outline-none"
//     >
//       <span
//         className={cn(
//           "relative h-5 w-9 shrink-0 rounded-full transition group-focus-visible:ring-2 group-focus-visible:ring-sky-500/40",
//           checked ? "bg-sky-600" : "bg-zinc-700",
//         )}
//       >
//         <span
//           className={cn(
//             "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
//             checked && "translate-x-4",
//           )}
//         />
//       </span>
//       {label}
//     </button>
//   );
// }

// function Segmented({ value, options, onChange }) {
//   return (
//     <div
//       className="inline-flex flex-wrap gap-1 rounded-lg border border-[#26262b] bg-[#0c0c0f] p-1"
//       role="radiogroup"
//     >
//       {options.map(([v, l]) => (
//         <button
//           key={v}
//           type="button"
//           role="radio"
//           aria-checked={value === v}
//           onClick={() => onChange(v)}
//           className={cn(
//             "rounded-md px-3 py-1.5 text-sm transition",
//             value === v
//               ? "bg-sky-600/20 text-sky-300 ring-1 ring-sky-500/50"
//               : "text-zinc-400 hover:text-zinc-200",
//           )}
//         >
//           {l}
//         </button>
//       ))}
//     </div>
//   );
// }

// function Alert({ tone = "info", children, onClose }) {
//   const tones = {
//     error: "border-red-500/40 bg-red-500/10 text-red-200",
//     success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
//     info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
//     warn: "border-amber-500/40 bg-amber-500/10 text-amber-200",
//   };
//   return (
//     <div
//       role={tone === "error" ? "alert" : "status"}
//       className={cn(
//         "mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
//         tones[tone],
//       )}
//     >
//       <div className="min-w-0 flex-1">{children}</div>
//       {onClose && (
//         <button
//           type="button"
//           onClick={onClose}
//           aria-label="Dismiss"
//           className="opacity-70 hover:opacity-100"
//         >
//           <Icon name="x" />
//         </button>
//       )}
//     </div>
//   );
// }

// function Card({ title, subtitle, children, className }) {
//   return (
//     <section
//       className={cn(
//         "mb-4 rounded-xl border border-[#26262b] bg-[#111114] p-5 sm:p-6",
//         className,
//       )}
//     >
//       {title && <h1 className="text-lg font-semibold text-zinc-50">{title}</h1>}
//       {subtitle && (
//         <p className="mb-5 mt-1 text-sm text-zinc-400">{subtitle}</p>
//       )}
//       {children}
//     </section>
//   );
// }

// const H3 = ({ children, className }) => (
//   <h3
//     className={cn("mb-3 mt-7 text-sm font-semibold text-zinc-200", className)}
//   >
//     {children}
//   </h3>
// );

// /* ───────────────────────────── page ───────────────────────────── */

// export default function WhatsAppAutomationSetupPage() {
//   const { isAdmin } = useAuth();
//   const navigate = useNavigate();
//   const { automationId } = useParams();
//   const isNew = !automationId || automationId === "new";

//   const [step, setStep] = useState(0);
//   const [config, setConfig] = useState(emptyConfig);
//   const [automations, setAutomations] = useState([]);
//   const [instances, setInstances] = useState([]);
//   const [loading, setLoading] = useState(!isNew);
//   const [setupDone, setSetupDone] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [notice, setNotice] = useState(null);
//   const [touched, setTouched] = useState({});
//   const [attempted, setAttempted] = useState([]);
//   const [connected, setConnected] = useState(false);
//   const [testMessages, setTestMessages] = useState([]);
//   const [testInput, setTestInput] = useState("");
//   const [afterHours, setAfterHours] = useState(false);
//   const snapshot = useRef(JSON.stringify(emptyConfig));

//   useEffect(() => {
//     if (!isAdmin) return undefined;
//     let cancelled = false;
//     (async () => {
//       try {
//         const [automationResponse, instanceResponse] = await Promise.all([
//           axios.get(`${SERVER_URL}/api/whatsapp-automation`),
//           axios
//             .get(`${SERVER_URL}/api/baileys/instances`)
//             .catch(() => ({ data: [] })),
//         ]);
//         if (cancelled) return;
//         const list = automationResponse.data.automations || [];
//         setAutomations(list);
//         setInstances(instanceResponse.data || []);
//         const current = isNew
//           ? null
//           : (
//               await axios.get(
//                 `${SERVER_URL}/api/whatsapp-automation/${automationId}`,
//               )
//             ).data.automation;
//         if (current) {
//           const rulesResponse = await axios
//             .get(
//               `${SERVER_URL}/api/whatsapp-automation/${current.id}/auto-replies`,
//             )
//             .catch(() => ({ data: { rules: [] } }));
//           if (cancelled) return;
//           const next = {
//             ...normalizeConfig({
//               ...current,
//               knowledge: current.knowledgeSources
//                 ?.map((source) => source.content)
//                 .filter(Boolean)
//                 .join("\n\n"),
//             }),
//             rules: (rulesResponse.data.rules || []).map(parseRule),
//           };
//           snapshot.current = JSON.stringify(next);
//           setConfig(next);
//           setConnected(Boolean(current.connections?.length));
//           setSetupDone(
//             current.status === "active" ||
//               Boolean(current.onboarding?.setup?.setupCompleted),
//           );
//         } else if (!isNew) {
//           setNotice({
//             tone: "error",
//             text: "This automation could not be found.",
//           });
//         }
//       } catch (err) {
//         if (!cancelled)
//           setNotice({
//             tone: "error",
//             text: err.response?.data?.error || err.message,
//           });
//       } finally {
//         if (!cancelled) setLoading(false);
//       }
//     })();
//     return () => {
//       cancelled = true;
//     };
//   }, [isAdmin, automationId, isNew]);

//   useEffect(() => {
//     if (notice?.tone !== "success") return undefined;
//     const timer = setTimeout(() => setNotice(null), 4000);
//     return () => clearTimeout(timer);
//   }, [notice]);

//   const dirty = useMemo(
//     () => JSON.stringify(config) !== snapshot.current,
//     [config],
//   );
//   useEffect(() => {
//     if (!dirty) return undefined;
//     const handler = (event) => {
//       event.preventDefault();
//       event.returnValue = "";
//     };
//     window.addEventListener("beforeunload", handler);
//     return () => window.removeEventListener("beforeunload", handler);
//   }, [dirty]);

//   const currentAutomation = useMemo(
//     () => automations.find((item) => item.id === automationId),
//     [automations, automationId],
//   );
//   const byStep = useMemo(
//     () => stepValidators.map((validate) => validate(config)),
//     [config],
//   );
//   const issueCount = byStep.map((e) => Object.keys(e).length);

//   const update = (field, value) =>
//     setConfig((current) => ({ ...current, [field]: value }));
//   const updateMeta = (field, value) =>
//     setConfig((current) => ({
//       ...current,
//       meta: { ...current.meta, [field]: value },
//     }));
//   const updateRule = (index, patch) =>
//     setConfig((current) => ({
//       ...current,
//       rules: patchAt(current.rules, index, patch),
//     }));
//   const updateRuleResponse = (index, patch) =>
//     setConfig((current) => ({
//       ...current,
//       rules: current.rules.map((rule, i) =>
//         i === index
//           ? { ...rule, responseConfig: { ...rule.responseConfig, ...patch } }
//           : rule,
//       ),
//     }));

//   const touch = (path) =>
//     setTouched((current) =>
//       current[path] ? current : { ...current, [path]: true },
//     );
//   const fe = (path) =>
//     touched[path] || attempted.includes(step) ? byStep[step][path] : undefined;
//   const bind = (path) => ({ error: fe(path), onBlur: () => touch(path) });

//   const goToStep = (index) => {
//     setStep(index);
//     window.scrollTo({ top: 0, behavior: "smooth" });
//   };
//   const markAttempted = (index) =>
//     setAttempted((current) =>
//       current.includes(index) ? current : [...current, index],
//     );

//   const tryGo = (target) => {
//     if (target <= step || setupDone) {
//       setNotice(null);
//       goToStep(target);
//       return;
//     }
//     const bad = byStep
//       .slice(0, target)
//       .findIndex((errors) => Object.keys(errors).length > 0);
//     if (bad !== -1) {
//       markAttempted(bad);
//       setNotice({
//         tone: "error",
//         text: `Fix ${issueCount[bad]} ${issueCount[bad] === 1 ? "issue" : "issues"} in “${steps[bad][0]}” before continuing.`,
//       });
//       goToStep(bad);
//       return;
//     }
//     setNotice(null);
//     goToStep(target);
//   };

//   const connectionReady =
//     config.provider === "cloud_api"
//       ? !Object.keys(byStep[1]).length
//       : connected;
//   const reviewIssues = [
//     ...byStep
//       .slice(0, 6)
//       .flatMap((errors, index) =>
//         Object.keys(errors).length
//           ? [
//               {
//                 step: index,
//                 text: `${steps[index][0]}: ${issueCount[index]} ${issueCount[index] === 1 ? "issue" : "issues"} to fix`,
//               },
//             ]
//           : [],
//       ),
//     ...(config.provider === "baileys" && !connected
//       ? [
//           {
//             step: 1,
//             text: "Channel: connect a WhatsApp device (save the draft first)",
//           },
//         ]
//       : []),
//   ];

//   const save = async (activate = false, keep = false) => {
//     const businessErrors = byStep[0];
//     if (businessErrors.name || businessErrors.businessName) {
//       markAttempted(0);
//       setNotice({
//         tone: "error",
//         text: "Enter an automation name and a business name before saving.",
//       });
//       goToStep(0);
//       return;
//     }
//     if (keep && reviewIssues.length) {
//       const first = reviewIssues[0].step;
//       markAttempted(first);
//       setNotice({
//         tone: "error",
//         text: `Can't save yet - ${reviewIssues[0].text}.`,
//       });
//       goToStep(first);
//       return;
//     }
//     if (activate && reviewIssues.length) {
//       const first = reviewIssues[0].step;
//       markAttempted(first);
//       setNotice({
//         tone: "error",
//         text: "Resolve the issues listed in Review before activating.",
//       });
//       goToStep(7);
//       return;
//     }
//     setSaving(true);
//     setNotice(null);
//     try {
//       const enabledTools = config.tools
//         .filter((tool) => tool.enabled !== false)
//         .map((tool) => tool.name);
//       const payload = {
//         name: config.name.trim() || config.businessName.trim(),
//         businessName: config.businessName.trim(),
//         description: config.description,
//         language: config.language,
//         supportedLanguages: config.supportedLanguages,
//         timezone: config.timezone,
//         systemPrompt: config.systemPrompt || buildPrompt(config, enabledTools),
//         initialMessage: config.initialMessage,
//         status: keep
//           ? currentAutomation?.status || "active"
//           : activate
//             ? "active"
//             : "draft",
//         capabilities: enabledTools,
//         onboarding: {
//           businessProfile: config,
//           capabilities: enabledTools,
//           tools: config.tools,
//           knowledgeSources: config.knowledge ? [config.knowledge] : [],
//           setup: {
//             ...config,
//             setupCompleted: activate || keep,
//             step: activate ? steps.length : step + 1,
//           },
//         },
//       };
//       const response = !isNew
//         ? await axios.put(
//             `${SERVER_URL}/api/whatsapp-automation/${automationId}`,
//             payload,
//           )
//         : await axios.post(`${SERVER_URL}/api/whatsapp-automation`, payload        );
//       const id = response.data.automation?.id || automationId;
//       if (id) {
//         if (config.provider === "cloud_api") {
//           const connection = currentAutomation?.connections?.[0];
//           const connectionPayload = {
//             provider: "cloud_api",
//             phoneNumber: config.meta.phoneNumber.trim(),
//             phoneNumberId: config.meta.phoneNumberId.trim(),
//             businessId: config.meta.businessId.trim(),
//             apiToken: config.meta.apiToken.trim(),
//             verifyToken: config.meta.verifyToken.trim(),
//             appSecret: config.meta.appSecret.trim() || undefined,
//           };
//           if (connection) {
//             await axios.put(
//               `${SERVER_URL}/api/whatsapp-automation/${id}/connections/${connection.id}`,
//               connectionPayload,
//             );
//           } else {
//             await axios.post(
//               `${SERVER_URL}/api/whatsapp-automation/${id}/connections`,
//               connectionPayload,
//             );
//           }
//         }
//         const existing = isNew
//           ? { data: { rules: [] } }
//           : await axios.get(
//               `${SERVER_URL}/api/whatsapp-automation/${id}/auto-replies`,
//             );
//         const existingRules = existing.data.rules || [];
//         const retained = new Set(
//           config.rules.filter((rule) => rule.id).map((rule) => rule.id),
//         );
//         await Promise.all(
//           existingRules
//             .filter((rule) => !retained.has(rule.id))
//             .map((rule) =>
//               axios.delete(
//                 `${SERVER_URL}/api/whatsapp-automation/${id}/auto-replies/${rule.id}`,
//               ),
//             ),
//         );
//         for (const [index, rule] of config.rules.entries()) {
//           const rulePayload = {
//             ...rule,
//             priority: index,
//             response: JSON.stringify(rule.responseConfig),
//             responseConfig: rule.responseConfig,
//             responseType: rule.responseConfig?._type || rule.responseType,
//           };
//           if (rule.id && existingRules.some((item) => item.id === rule.id))
//             await axios.put(
//               `${SERVER_URL}/api/whatsapp-automation/${id}/auto-replies/${rule.id}`,
//               rulePayload,
//             );
//           else
//             await axios.post(
//               `${SERVER_URL}/api/whatsapp-automation/${id}/auto-replies`,
//               rulePayload,
//             );
//         }
//       }
//       snapshot.current = JSON.stringify(config);
//       setNotice({
//         tone: "success",
//         text: keep
//           ? "Changes saved."
//           : activate
//             ? "Automation activated."
//             : "Draft saved.",
//       });
//       if (isNew || activate)
//         navigate("/whatsapp", { replace: true });
//     } catch (err) {
//       setNotice({
//         tone: "error",
//         text: err.response?.data?.error || err.message,
//       });
//     } finally {
//       setSaving(false);
//     }
//   };

//   const connectBaileys = async (instance) => {
//     if (!instance) return;
//     if (!currentAutomation) {
//       setNotice({
//         tone: "warn",
//         text: "Save the draft first, then connect a device.",
//       });
//       return;
//     }
//     try {
//       await axios.post(
//         `${SERVER_URL}/api/whatsapp-automation/${currentAutomation.id}/connections`,
//         {
//           provider: "baileys",
//           phoneNumber: instance.phoneNumber,
//           instanceId: instance.instanceId,
//         },
//       );
//       setConnected(true);
//       setNotice({ tone: "success", text: "WhatsApp device connected." });
//     } catch (err) {
//       setNotice({
//         tone: "error",
//         text: err.response?.data?.error || err.message,
//       });
//     }
//   };

//   const sendTest = (raw, id) => {
//     const text = (raw ?? testInput).trim();
//     if (!text) return;
//     const result = runBot(config, {
//       text,
//       id,
//       afterHours,
//       isFirst: !testMessages.some((m) => m.role === "user"),
//     });
//     setTestMessages((messages) => [
//       ...messages,
//       { role: "user", text },
//       ...(result.silent
//         ? [
//             {
//               role: "bot",
//               text: "(no reply — bot stays silent after hours)",
//               source: "Silent",
//               muted: true,
//             },
//           ]
//         : result.replies.map((reply) => ({ role: "bot", ...reply }))),
//     ]);
//     if (raw === undefined) setTestInput("");
//   };

//   const leave = () => {
//     if (
//       dirty &&
//       !window.confirm("You have unsaved changes. Leave without saving?")
//     )
//       return;
//     navigate("/whatsapp");
//   };

//   if (!isAdmin)
//     return (
//       <div className="grid min-h-screen place-items-center bg-[#09090b] text-zinc-400">
//         Admins only.
//       </div>
//     );

//   const stepProps = { config, update, bind, touch };

//   return (
//     <div className="min-h-screen bg-[#09090b] text-sm text-zinc-100 antialiased">
//       <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#26262b] bg-[#09090b]/90 px-4 py-3 backdrop-blur sm:px-7">
//         <button
//           type="button"
//           onClick={leave}
//           className="inline-flex items-center gap-1 text-zinc-400 transition hover:text-zinc-100"
//         >
//           <Icon name="arrowLeft" />
//           Automations
//         </button>
//         <strong className="text-[15px] font-semibold">
//           WhatsApp Automation Setup
//         </strong>
//         {dirty && (
//           <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
//             Unsaved changes
//           </span>
//         )}
//         <span className="flex-1" />
//         <span className="text-xs text-zinc-500">
//           {step + 1} / {steps.length}
//         </span>
//         <div className="hidden h-1.5 w-48 overflow-hidden rounded-full bg-[#26262b] sm:block">
//           <i
//             className="block h-full rounded-full bg-sky-600 transition-all duration-300"
//             style={{ width: `${((step + 1) / steps.length) * 100}%` }}
//           />
//         </div>
//         {setupDone ? (
//           <Button
//             variant="primary"
//             onClick={() => save(false, true)}
//             disabled={saving || loading}
//           >
//             {saving ? "Saving…" : "Save changes"}
//           </Button>
//         ) : (
//           <Button onClick={() => save(false)} disabled={saving || loading}>
//             {saving ? "Saving…" : "Save draft"}
//           </Button>
//         )}
//       </header>

//       <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-7 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_340px]">
//         <nav
//           aria-label="Setup steps"
//           className="flex gap-1 overflow-x-auto lg:sticky lg:top-[72px] lg:flex-col lg:self-start lg:overflow-visible"
//         >
//           {steps.map(([title, subtitle], index) => {
//             const active = index === step;
//             const done =
//               !active && (setupDone || index < step) && !issueCount[index];
//             const bad =
//               index !== step &&
//               issueCount[index] > 0 &&
//               (setupDone || attempted.includes(index) || index < step);
//             return (
//               <button
//                 key={title}
//                 type="button"
//                 onClick={() => tryGo(index)}
//                 aria-current={active ? "step" : undefined}
//                 className={cn(
//                   "flex shrink-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
//                   active
//                     ? "border-[#26262b] bg-[#16161a]"
//                     : "border-transparent hover:bg-[#111114]",
//                 )}
//               >
//                 <span
//                   className={cn(
//                     "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs",
//                     done
//                       ? "border-emerald-500 bg-emerald-500 font-bold text-black"
//                       : bad
//                         ? "border-red-500/70 bg-red-500/10 text-red-300"
//                         : active
//                           ? "border-sky-500 text-zinc-100"
//                           : "border-[#26262b] text-zinc-500",
//                   )}
//                 >
//                   {done ? (
//                     <Icon name="check" className="h-3.5 w-3.5" />
//                   ) : bad ? (
//                     "!"
//                   ) : (
//                     index + 1
//                   )}
//                 </span>
//                 <span className="min-w-0">
//                   <b className="block text-[13px] font-semibold">{title}</b>
//                   <small className="hidden text-[11px] text-zinc-500 lg:block">
//                     {subtitle}
//                   </small>
//                 </span>
//               </button>
//             );
//           })}
//         </nav>

//         <main className="min-w-0">
//           {notice && (
//             <Alert tone={notice.tone} onClose={() => setNotice(null)}>
//               {notice.text}
//             </Alert>
//           )}
//           {loading ? (
//             <div className="space-y-3" aria-busy="true">
//               {[0, 1, 2].map((i) => (
//                 <div
//                   key={i}
//                   className="h-24 animate-pulse rounded-xl border border-[#26262b] bg-[#111114]"
//                 />
//               ))}
//             </div>
//           ) : (
//             <>
//               {step === 0 && <BusinessStep {...stepProps} />}
//               {step === 1 && (
//                 <ChannelStep
//                   {...stepProps}
//                   updateMeta={updateMeta}
//                   instances={instances}
//                   connectBaileys={connectBaileys}
//                   connected={connected}
//                   currentAutomation={currentAutomation}
//                   save={() => save(false)}
//                 />
//               )}
//               {step === 2 && <KnowledgeStep {...stepProps} />}
//               {step === 3 && <BehaviorStep {...stepProps} />}
//               {step === 4 && <HoursStep {...stepProps} />}
//               {step === 5 && (
//                 <RulesStep
//                   {...stepProps}
//                   updateRule={updateRule}
//                   updateRuleResponse={updateRuleResponse}
//                 />
//               )}
//               {step === 6 && (
//                 <TestStep
//                   config={config}
//                   messages={testMessages}
//                   input={testInput}
//                   setInput={setTestInput}
//                   sendTest={sendTest}
//                   afterHours={afterHours}
//                   setAfterHours={setAfterHours}
//                   clear={() => setTestMessages([])}
//                 />
//               )}
//               {step === 7 && (
//                 <ReviewStep
//                   config={config}
//                   connected={connected}
//                   connectionReady={connectionReady}
//                   issues={reviewIssues}
//                   goTo={(target) => {
//                     markAttempted(target);
//                     goToStep(target);
//                   }}
//                   onActivate={() => save(true)}
//                   saving={saving}
//                 />
//               )}
//             </>
//           )}
//           <div className="mt-2 flex items-center justify-between">
//             <Button onClick={() => tryGo(step - 1)} disabled={step === 0}>
//               <Icon name="arrowLeft" />
//               Back
//             </Button>
//             {setupDone ? (
//               <div className="flex items-center gap-2">
//                 {step < steps.length - 1 && (
//                   <Button onClick={() => tryGo(step + 1)}>
//                     Next
//                     <Icon name="arrowRight" />
//                   </Button>
//                 )}
//                 <Button
//                   variant="primary"
//                   onClick={() => save(false, true)}
//                   disabled={saving || loading}
//                 >
//                   {saving ? "Saving…" : "Save changes"}
//                 </Button>
//               </div>
//             ) : step < steps.length - 1 ? (
//               <Button variant="primary" onClick={() => tryGo(step + 1)}>
//                 Continue
//                 <Icon name="arrowRight" />
//               </Button>
//             ) : (
//               <Button
//                 variant="primary"
//                 onClick={() => save(true)}
//                 disabled={saving || reviewIssues.length > 0}
//               >
//                 {saving ? "Activating…" : "Activate automation"}
//               </Button>
//             )}
//           </div>
//         </main>

//         <PhonePreview
//           config={config}
//           messages={testMessages}
//           onButton={(button) => sendTest(button.title, button.id)}
//         />
//       </div>
//     </div>
//   );
// }

// /* ───────────────────────────── steps ───────────────────────────── */

// function BusinessStep({ config, update, bind }) {
//   return (
//     <Card
//       title="1 · Business profile"
//       subtitle="Tell the assistant who it represents and how it should communicate."
//     >
//       <div className="grid gap-4 sm:grid-cols-2">
//         <TextField
//           label="Automation name"
//           required
//           value={config.name}
//           onChange={(v) => update("name", v)}
//           placeholder="Customer support bot"
//           max={60}
//           {...bind("name")}
//         />
//         <TextField
//           label="Business name"
//           required
//           value={config.businessName}
//           onChange={(v) => update("businessName", v)}
//           placeholder="Acme Solar"
//           max={80}
//           {...bind("businessName")}
//         />
//         <SelectField
//           label="Industry"
//           value={config.industry}
//           onChange={(v) => update("industry", v)}
//           options={industries}
//           placeholder="Select an industry"
//         />
//         <TextField
//           label="Business phone"
//           value={config.businessPhone}
//           onChange={(v) => update("businessPhone", v)}
//           placeholder="+91 98765 43210"
//           inputMode="tel"
//           {...bind("businessPhone")}
//         />
//         <TextField
//           label="Business email"
//           type="email"
//           value={config.businessEmail}
//           onChange={(v) => update("businessEmail", v)}
//           placeholder="hello@business.com"
//           {...bind("businessEmail")}
//         />
//         <TextField
//           label="Website"
//           value={config.websiteUrl}
//           onChange={(v) => update("websiteUrl", v)}
//           placeholder="https://"
//           inputMode="url"
//           {...bind("websiteUrl")}
//         />
//         <TextArea
//           className="sm:col-span-2"
//           label="Business description"
//           rows={3}
//           max={500}
//           value={config.description}
//           onChange={(v) => update("description", v)}
//           placeholder="What do you sell and who do you help?"
//           {...bind("description")}
//         />
//         <TextArea
//           className="sm:col-span-2"
//           label="Address"
//           rows={2}
//           max={300}
//           value={config.address}
//           onChange={(v) => update("address", v)}
//           {...bind("address")}
//         />
//         <SelectField
//           label="Primary language"
//           value={config.language}
//           onChange={(v) => setLanguage(update, config, v)}
//           options={languages}
//         />
//         <SelectField
//           label="Timezone"
//           required
//           value={config.timezone}
//           onChange={(v) => update("timezone", v)}
//           options={
//             timezones.includes(config.timezone)
//               ? timezones
//               : [config.timezone, ...timezones]
//           }
//           {...bind("timezone")}
//         />
//       </div>
//     </Card>
//   );
// }

// function setLanguage(update, config, value) {
//   update("language", value);
//   if (!config.supportedLanguages.includes(value))
//     update("supportedLanguages", [...config.supportedLanguages, value]);
// }

// const metaFields = [
//   [
//     "phoneNumber",
//     "Display phone number",
//     "text",
//     "+1 555 010 0000",
//     "",
//   ],
//   [
//     "phoneNumberId",
//     "Phone Number ID",
//     "text",
//     "104829371650283",
//     "",
//   ],
//   [
//     "businessId",
//     "WhatsApp Business Account ID",
//     "text",
//     "219384756102938",
//     "",
//   ],
//   [
//     "appSecret",
//     "App secret (optional)",
//     "password",
//     "Used to verify webhook signatures",
//     "",
//   ],
// ];

// const providerCards = [
//   [
//     "cloud_api",
//     "Meta Cloud API",
//     "Recommended",
//     "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
//     "Official, stable, supports buttons, lists & templates.",
//   ],
//   [
//     "baileys",
//     "QR linked device",
//     "Quick start",
//     "border-amber-500/40 bg-amber-500/10 text-amber-300",
//     "Link like WhatsApp Web. Limited features, higher ban risk.",
//   ],
// ];

// function ChannelStep({
//   config,
//   update,
//   updateMeta,
//   bind,
//   touch,
//   instances,
//   connectBaileys,
//   connected,
//   currentAutomation,
//   save,
// }) {
//   const [copied, setCopied] = useState(false);
//   const [verifyState, setVerifyState] = useState({ status: "idle" });
//   const webhook = `${SERVER_URL}/api/whatsapp-automation/webhook`;
//   const { phoneNumberId, businessId, apiToken } = config.meta;
//   useEffect(() => {
//     setVerifyState({ status: "idle" });
//   }, [phoneNumberId, businessId, apiToken]);
//   const verify = async () => {
//     if (!phoneNumberId.trim() || !apiToken.trim()) {
//       setVerifyState({
//         status: "error",
//         error: "Enter the Phone Number ID and access token first.",
//       });
//       return;
//     }
//     setVerifyState({ status: "loading" });
//     try {
//       const { data } = await axios.post(
//         `${SERVER_URL}/api/whatsapp-automation/verify-cloud`,
//         {
//           phoneNumberId: phoneNumberId.trim(),
//           businessId: businessId.trim(),
//           apiToken: apiToken.trim(),
//         },
//       );
//       setVerifyState(
//         data.ok
//           ? { status: "ok", ...data }
//           : { status: "error", error: data.error || "Verification failed" },
//       );
//     } catch (err) {
//       setVerifyState({
//         status: "error",
//         error: err.response?.data?.error || err.message,
//       });
//     }
//   };
//   const copy = async () => {
//     try {
//       await navigator.clipboard.writeText(webhook);
//       setCopied(true);
//       setTimeout(() => setCopied(false), 1500);
//     } catch {
//       /* clipboard unavailable */
//     }
//   };
//   return (
//     <Card
//       title="2 · WhatsApp channel"
//       subtitle="Connect a number now or save the draft and connect it later."
//     >
//       <Segmented
//         value={config.provider}
//         onChange={(v) => update("provider", v)}
//         options={[
//           ["baileys", "QR linked device"],
//           ["cloud_api", "Meta Cloud API"],
//         ]}
//       />
//       {config.provider === "cloud_api" ? (
//         <div className="mt-5">
//           <div className="mb-5 rounded-lg border border-[#26262b] border-l-sky-500 bg-[#16161a] px-4 py-3 text-sm text-zinc-300">
//             <b className="text-zinc-100">Before you start you need:</b> a Meta
//             Business account, a Meta developer app with the WhatsApp product,
//             and a phone number that is <u>not</u> already on the WhatsApp
//             mobile app.
//           </div>
//           <div className="grid gap-4 sm:grid-cols-2">
//             {metaFields.map(([field, label, type, placeholder, hint]) => (
//               <TextField
//                 key={field}
//                 label={label}
//                 required={field === "phoneNumberId" || field === "businessId"}
//                 type={type}
//                 placeholder={placeholder}
//                 hint={hint}
//                 autoComplete="off"
//                 value={config.meta[field]}
//                 onChange={(v) => updateMeta(field, v)}
//                 {...bind(`meta.${field}`)}
//               />
//             ))}
//           </div>
//           <div className="mt-4">
//             <TextField
//               label="Permanent access token"
//               required
//               type="password"
//               placeholder="EAAG…"
//               hint="Create it from a System User in Meta Business Settings so it never expires."
//               autoComplete="off"
//               value={config.meta.apiToken}
//               onChange={(v) => updateMeta("apiToken", v)}
//               {...bind("meta.apiToken")}
//             />
//           </div>
//           <div className="mt-5 rounded-lg border border-[#26262b] bg-[#16161a] p-4">
//             <p className="mb-2 text-xs font-medium text-zinc-300">
//               Webhook callback URL
//             </p>
//             <div className="flex gap-2">
//               <input
//                 readOnly
//                 value={webhook}
//                 onFocus={(e) => e.target.select()}
//                 className={cn(inputBase, inputTone(false), "font-mono text-xs")}
//                 aria-label="Webhook callback URL"
//               />
//               <Button onClick={copy}>
//                 <Icon name="copy" />
//                 {copied ? "Copied" : "Copy"}
//               </Button>
//             </div>
//             <div className="mt-4">
//               <TextField
//                 label="Webhook verify token"
//                 required
//                 hint="Any secret string; must match what you paste in Meta."
//                 autoComplete="off"
//                 value={config.meta.verifyToken}
//                 onChange={(v) => updateMeta("verifyToken", v)}
//                 {...bind("meta.verifyToken")}
//               />
//               <button
//                 type="button"
//                 onClick={() => {
//                   updateMeta("verifyToken", randomToken());
//                   touch("meta.verifyToken");
//                 }}
//                 className="mt-1.5 text-xs text-sky-400 hover:text-sky-300"
//               >
//                 Generate a token
//               </button>
//             </div>
//             <ol className="mt-4 space-y-2 text-sm text-zinc-300">
//               {[
//                 <>Open <b>developers.facebook.com → your app → WhatsApp → Configuration</b>.</>,
//                 <>Paste the <b>Callback URL</b> and <b>Verify token</b>, then click Verify and save.</>,
//                 <>Under Webhook fields, subscribe to <b>messages</b>.</>,
//                 <>Copy Phone Number ID and WABA ID from <b>API Setup</b>; paste them above.</>,
//                 <>Click <b>Verify connection</b> below.</>,
//               ].map((item, i) => (
//                 <li
//                   key={i}
//                   className="flex items-center gap-3 border-b border-dashed border-[#26262b] pb-2 last:border-0"
//                 >
//                   <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#26262b] text-xs text-zinc-400">
//                     {i + 1}
//                   </span>
//                   <span>{item}</span>
//                 </li>
//               ))}
//             </ol>
//           </div>
//           <div className="mt-5 flex flex-wrap items-center gap-3">
//             <Button
//               variant="primary"
//               onClick={verify}
//               disabled={verifyState.status === "loading"}
//             >
//               {verifyState.status === "loading"
//                 ? "Verifying…"
//                 : "Verify connection"}
//             </Button>
//             {verifyState.status === "ok" && (
//               <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
//                 ● Connected
//               </span>
//             )}
//             {verifyState.status === "ok" && verifyState.warning && (
//               <p className="w-full text-xs text-amber-300">
//                 {verifyState.warning}
//               </p>
//             )}
//             {verifyState.status === "error" && (
//               <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs text-red-300">
//                 ● Failed
//               </span>
//             )}
//             {verifyState.status === "ok" && (
//               <span className="text-xs text-zinc-400">
//                 {[verifyState.verifiedName, verifyState.displayPhoneNumber]
//                   .filter(Boolean)
//                   .join(" · ")}
//               </span>
//             )}
//           </div>
//           {verifyState.status === "error" && (
//             <p role="alert" className="mt-2 text-sm text-red-300">
//               {verifyState.error}
//             </p>
//           )}
//         </div>
//       ) : (
//         <div className="mt-5 rounded-lg border border-[#26262b] bg-[#16161a] p-4">
//           <p className="mb-3 text-zinc-300">
//             Select an already-linked QR device.
//           </p>
//           {!currentAutomation && (
//             <Alert tone="warn">
//               Save the draft first — a device can only be attached to a saved
//               automation.{" "}
//               <button type="button" onClick={save} className="ml-1 underline">
//                 Save draft now
//               </button>
//             </Alert>
//           )}
//           <div className="flex flex-wrap items-center gap-3">
//             <div className="min-w-[240px] flex-1">
//               <SelectField
//                 value=""
//                 onChange={(v) =>
//                   connectBaileys(instances.find((i) => i.instanceId === v))
//                 }
//                 options={[
//                   ["", "Choose device…"],
//                   ...instances
//                     .filter((i) => i.phoneNumber)
//                     .map((i) => [
//                       i.instanceId,
//                       `${i.phoneNumber} (${i.instanceId})`,
//                     ]),
//                 ]}
//               />
//             </div>
//             <span
//               className={cn(
//                 "rounded-full border px-2.5 py-1 text-xs",
//                 connected
//                   ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
//                   : "border-amber-500/40 bg-amber-500/10 text-amber-300",
//               )}
//             >
//               {connected ? "● Connected" : "Not connected"}
//             </span>
//           </div>
//           {!instances.filter((i) => i.phoneNumber).length && (
//             <p className="mt-3 text-xs text-zinc-500">
//               No linked devices found. Link one from WhatsApp Connections first.
//             </p>
//           )}
//         </div>
//       )}
//     </Card>
//   );
// }

// function KnowledgeStep({ config, update, bind }) {
//   const add = (key, item) => update(key, [...config[key], item]);
//   const remove = (key, index) =>
//     update(
//       key,
//       config[key].filter((_, i) => i !== index),
//     );
//   return (
//     <Card
//       title="3 · Knowledge base"
//       subtitle="Add facts the assistant can use without inventing answers."
//     >
//       <TextArea
//         label="Business policies, services, delivery, payment and other facts"
//         rows={6}
//         max={5000}
//         value={config.knowledge}
//         onChange={(v) => update("knowledge", v)}
//         placeholder="Opening hours, service areas, policies…"
//         {...bind("knowledge")}
//       />

//       <H3>Products and services</H3>
//       <div className="space-y-3">
//         {config.products.map((product, index) => (
//           <div
//             key={index}
//             className="grid gap-3 rounded-lg border border-[#26262b] bg-[#16161a] p-3 sm:grid-cols-[1.2fr_0.6fr_1.6fr_auto]"
//           >
//             <TextField
//               label="Name"
//               required
//               value={product.name}
//               onChange={(v) =>
//                 update("products", patchAt(config.products, index, { name: v }))
//               }
//               {...bind(`products.${index}.name`)}
//             />
//             <TextField
//               label="Price"
//               value={product.price}
//               onChange={(v) =>
//                 update(
//                   "products",
//                   patchAt(config.products, index, { price: v }),
//                 )
//               }
//               placeholder="₹55,000"
//               {...bind(`products.${index}.price`)}
//             />
//             <TextField
//               label="Description"
//               value={product.description}
//               onChange={(v) =>
//                 update(
//                   "products",
//                   patchAt(config.products, index, { description: v }),
//                 )
//               }
//               {...bind(`products.${index}.description`)}
//             />
//             <Button
//               variant="danger"
//               size="icon"
//               className="self-start sm:mt-6"
//               onClick={() => remove("products", index)}
//               aria-label={`Remove product ${index + 1}`}
//             >
//               <Icon name="x" />
//             </Button>
//           </div>
//         ))}
//       </div>
//       <Button
//         size="sm"
//         className="mt-3"
//         onClick={() =>
//           add("products", { name: "", description: "", price: "" })
//         }
//       >
//         <Icon name="plus" className="h-3.5 w-3.5" />
//         Add product
//       </Button>

//       <H3>FAQs</H3>
//       <div className="space-y-3">
//         {config.faqs.map((faq, index) => (
//           <div
//             key={index}
//             className="grid gap-3 rounded-lg border border-[#26262b] bg-[#16161a] p-3 sm:grid-cols-[1fr_1.4fr_auto]"
//           >
//             <TextField
//               label="Question"
//               required
//               value={faq.question}
//               onChange={(v) =>
//                 update("faqs", patchAt(config.faqs, index, { question: v }))
//               }
//               {...bind(`faqs.${index}.question`)}
//             />
//             <TextField
//               label="Answer"
//               required
//               value={faq.answer}
//               onChange={(v) =>
//                 update("faqs", patchAt(config.faqs, index, { answer: v }))
//               }
//               {...bind(`faqs.${index}.answer`)}
//             />
//             <Button
//               variant="danger"
//               size="icon"
//               className="self-start sm:mt-6"
//               onClick={() => remove("faqs", index)}
//               aria-label={`Remove FAQ ${index + 1}`}
//             >
//               <Icon name="x" />
//             </Button>
//           </div>
//         ))}
//       </div>
//       <Button
//         size="sm"
//         className="mt-3"
//         onClick={() => add("faqs", { question: "", answer: "" })}
//       >
//         <Icon name="plus" className="h-3.5 w-3.5" />
//         Add FAQ
//       </Button>
//       {!config.knowledge.trim() &&
//         !config.products.length &&
//         !config.faqs.length && (
//           <p className="mt-5 text-xs text-amber-300/90">
//             Tip: with no knowledge added, the AI will have very little to answer
//             from.
//           </p>
//         )}
//     </Card>
//   );
// }

// function BehaviorStep({ config, update, bind }) {
//   const toggleTool = (name, enabled) =>
//     update(
//       "tools",
//       enabled
//         ? config.tools.map((tool) =>
//             tool.name === name ? { ...tool, enabled: false } : tool,
//           )
//         : config.tools.some((tool) => tool.name === name)
//           ? config.tools.map((tool) =>
//               tool.name === name ? { ...tool, enabled: true } : tool,
//             )
//           : [...config.tools, { name, enabled: true }],
//     );
//   const generate = () =>
//     update(
//       "systemPrompt",
//       buildPrompt(
//         config,
//         config.tools.filter((t) => t.enabled !== false).map((t) => t.name),
//       ),
//     );
//   return (
//     <Card
//       title="4 · Agent behavior"
//       subtitle="Set the tone, fallback behavior, handoff, and tools."
//     >
//       <div className="grid gap-4 sm:grid-cols-2">
//         <div>
//           <p className="mb-1.5 text-xs font-medium text-zinc-300">Tone</p>
//           <Segmented
//             value={config.tone}
//             onChange={(v) => update("tone", v)}
//             options={[
//               ["friendly", "Friendly"],
//               ["professional", "Professional"],
//               ["casual", "Casual"],
//               ["formal", "Formal"],
//             ]}
//           />
//         </div>
//         <div>
//           <p className="mb-1.5 text-xs font-medium text-zinc-300">
//             Reply length
//           </p>
//           <Segmented
//             value={config.responseLength}
//             onChange={(v) => update("responseLength", v)}
//             options={[
//               ["concise", "Short"],
//               ["balanced", "Balanced"],
//               ["detailed", "Detailed"],
//             ]}
//           />
//         </div>
//         <TextArea
//           className="sm:col-span-2"
//           label="Initial greeting"
//           rows={2}
//           max={1024}
//           value={config.initialMessage}
//           onChange={(v) => update("initialMessage", v)}
//           placeholder="Hi! 👋 Welcome to… How can I help?"
//           {...bind("initialMessage")}
//         />
//         <div className="sm:col-span-2">
//           <div className="mb-1.5 flex items-center justify-between">
//             <span className="text-xs font-medium text-zinc-300">
//               System instructions
//             </span>
//             <Button size="sm" onClick={generate}>
//               ✨ Generate from my details
//             </Button>
//           </div>
//           <TextArea
//             rows={7}
//             max={8000}
//             value={config.systemPrompt}
//             onChange={(v) => update("systemPrompt", v)}
//             placeholder="The assistant is helpful, concise and uses only confirmed business information. (Leave blank to auto-generate on save.)"
//             hint="If left blank, a prompt is generated from your profile and knowledge when you save."
//             {...bind("systemPrompt")}
//           />
//         </div>
//         <TextField
//           label="Handoff keywords"
//           value={config.handoffKeywords}
//           onChange={(v) => update("handoffKeywords", v)}
//           hint="Comma separated, e.g. human, agent, complaint"
//           {...bind("handoffKeywords")}
//         />
//         <TextField
//           label="Handoff message"
//           value={config.handoffMessage}
//           onChange={(v) => update("handoffMessage", v)}
//           {...bind("handoffMessage")}
//         />
//         <SelectField
//           label="When no rule matches"
//           value={config.fallbackMode}
//           onChange={(v) => update("fallbackMode", v)}
//           options={[
//             ["ai", "AI answers (uses LLM)"],
//             ["fixed", "Send a fixed message"],
//           ]}
//         />
//         <TextField
//           label="Fallback message"
//           required={config.fallbackMode === "fixed"}
//           value={config.fallbackMessage}
//           onChange={(v) => update("fallbackMessage", v)}
//           {...bind("fallbackMessage")}
//         />
//       </div>
//       <H3>Custom tools</H3>
//       <CustomToolsEditor tools={config.tools} onChange={(tools) => update("tools", tools)} />
//       <H3>Enabled tools</H3>
//       <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
//         {toolOptions.map(([name, label]) => {
//           const enabled = config.tools.some(
//             (tool) => tool.name === name && tool.enabled !== false,
//           );
//           return (
//             <button
//               key={name}
//               type="button"
//               role="checkbox"
//               aria-checked={enabled}
//               onClick={() => toggleTool(name, enabled)}
//               className={cn(
//                 "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition",
//                 enabled
//                   ? "border-sky-500/60 bg-sky-500/10 text-sky-200"
//                   : "border-[#26262b] bg-[#16161a] text-zinc-300 hover:border-[#3a3a42]",
//               )}
//             >
//               <span
//                 className={cn(
//                   "grid h-4 w-4 shrink-0 place-items-center rounded border",
//                   enabled
//                     ? "border-sky-500 bg-sky-500 text-black"
//                     : "border-zinc-600",
//                 )}
//               >
//                 {enabled && <Icon name="check" className="h-3 w-3" />}
//               </span>
//               {label}
//             </button>
//           );
//         })}
//       </div>
//     </Card>
//   );
// }

// function HoursStep({ config, update, bind, touch }) {
//   const copyFirst = () => {
//     const source = config.hours.find((h) => h.enabled);
//     if (source)
//       update(
//         "hours",
//         config.hours.map((h) =>
//           h.enabled
//             ? { ...h, openTime: source.openTime, closeTime: source.closeTime }
//             : h,
//         ),
//       );
//   };
//   return (
//     <Card
//       title="5 · Business hours"
//       subtitle="Control away messages and after-hours behavior."
//     >
//       {bind("hours").error && <Alert tone="error">{bind("hours").error}</Alert>}
//       <div className="space-y-2">
//         {config.hours.map((hour, index) => {
//           const closeError = bind(`hours.${index}.closeTime`).error;
//           const openError = bind(`hours.${index}.openTime`).error;
//           return (
//             <div key={hour.dayOfWeek}>
//               <div className="grid grid-cols-[100px_44px_1fr_1fr] items-center gap-3 sm:grid-cols-[120px_60px_160px_160px]">
//                 <b
//                   className={cn(
//                     "font-medium",
//                     hour.enabled ? "text-zinc-100" : "text-zinc-500",
//                   )}
//                 >
//                   {dayNames[index]}
//                 </b>
//                 <Toggle
//                   ariaLabel={`${dayNames[index]} open`}
//                   checked={hour.enabled}
//                   onChange={(v) =>
//                     update(
//                       "hours",
//                       patchAt(config.hours, index, { enabled: v }),
//                     )
//                   }
//                 />
//                 <input
//                   type="time"
//                   aria-label={`${dayNames[index]} opens`}
//                   disabled={!hour.enabled}
//                   value={hour.openTime}
//                   onBlur={() => touch(`hours.${index}.openTime`)}
//                   onChange={(e) =>
//                     update(
//                       "hours",
//                       patchAt(config.hours, index, {
//                         openTime: e.target.value,
//                       }),
//                     )
//                   }
//                   className={cn(inputBase, inputTone(openError))}
//                 />
//                 <input
//                   type="time"
//                   aria-label={`${dayNames[index]} closes`}
//                   disabled={!hour.enabled}
//                   value={hour.closeTime}
//                   onBlur={() => touch(`hours.${index}.closeTime`)}
//                   onChange={(e) =>
//                     update(
//                       "hours",
//                       patchAt(config.hours, index, {
//                         closeTime: e.target.value,
//                       }),
//                     )
//                   }
//                   className={cn(inputBase, inputTone(closeError))}
//                 />
//               </div>
//               {(openError || closeError) && (
//                 <p
//                   role="alert"
//                   className="ml-0 mt-1 text-xs text-red-400 sm:ml-[180px]"
//                 >
//                   {openError || closeError}
//                 </p>
//               )}
//             </div>
//           );
//         })}
//       </div>
//       <Button size="sm" className="mt-3" onClick={copyFirst}>
//         Copy first open day’s times to all open days
//       </Button>
//       <div className="mt-6 grid gap-4 sm:grid-cols-2">
//         <TextArea
//           className="sm:col-span-2"
//           label="Away message"
//           required={config.afterHoursMode !== "none"}
//           rows={2}
//           max={1024}
//           value={config.awayMessage}
//           onChange={(v) => update("awayMessage", v)}
//           {...bind("awayMessage")}
//         />
//         <SelectField
//           label="Outside-hours behavior"
//           value={config.afterHoursMode}
//           onChange={(v) => update("afterHoursMode", v)}
//           options={[
//             ["away", "Away message only"],
//             ["both", "Away + auto-replies / AI"],
//             ["none", "Stay silent"],
//           ]}
//         />
//         <SelectField
//           label="Typing delay"
//           value={config.typingDelay}
//           onChange={(v) => update("typingDelay", v)}
//           options={[
//             ["0", "None"],
//             ["1", "1 second"],
//             ["2", "2 seconds"],
//           ]}
//         />
//       </div>
//       <p className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
//         <b>24-hour rule:</b> after a customer’s last message you can reply
//         freely for 24 hours. After that WhatsApp only allows pre-approved
//         template messages.
//       </p>
//     </Card>
//   );
// }

// function RulesStep({
//   config,
//   update,
//   bind,
//   touch,
//   updateRule,
//   updateRuleResponse,
// }) {
//   const [collapsed, setCollapsed] = useState(() =>
//     config.rules.length > 1 ? config.rules.map((_, i) => i) : [],
//   );
//   const toggleCollapsed = (i) =>
//     setCollapsed((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
//   const knownIds = useMemo(() => {
//     const out = { button_press: [], list_row: [] };
//     const seen = { button_press: new Set(), list_row: new Set() };
//     const add = (kind, id, title, from) => {
//       if (!id || seen[kind].has(id)) return;
//       seen[kind].add(id);
//       out[kind].push({ id, label: `${title || id} (from ${from})` });
//     };
//     config.rules.forEach((rule, i) => {
//       const from = rule.name || `Rule ${i + 1}`;
//       const rc = rule.responseConfig || {};
//       (rc.buttons || []).forEach((x) => add("button_press", x.id, x.title, from));
//       (rc.sections || []).forEach((sec) =>
//         (sec.rows || []).forEach((x) => add("list_row", x.id, x.title, from)),
//       );
//     });
//     return out;
//   }, [config.rules]);
//   useEffect(() => {
//     let changed = false;
//     const next = config.rules.map((rule, ri) => {
//       const rc = rule.responseConfig || {};
//       const fix = (items, kind) =>
//         items.map((it, k) => {
//           if (it.id && !AUTO_ID.test(it.id)) return it;
//           const id = autoId(rule.name, kind, k + 1, ri);
//           if (it.id === id) return it;
//           changed = true;
//           return { ...it, id };
//         });
//       if (Array.isArray(rc.buttons) && rc.buttons.length) {
//         const buttons = fix(rc.buttons, "btn");
//         if (buttons !== rc.buttons && changed)
//           return { ...rule, responseConfig: { ...rc, buttons } };
//       }
//       const sec = rc.sections?.[0];
//       if (sec?.rows?.length) {
//         const rows = fix(sec.rows, "row");
//         if (changed)
//           return {
//             ...rule,
//             responseConfig: {
//               ...rc,
//               sections: [{ ...sec, rows }, ...rc.sections.slice(1)],
//             },
//           };
//       }
//       return rule;
//     });
//     if (changed) update("rules", next);
//   }, [config.rules]);
//   const move = (index, delta) => {
//     const target = index + delta;
//     if (target < 0 || target >= config.rules.length) return;
//     setCollapsed((c) =>
//       c.map((x) => (x === index ? target : x === target ? index : x)),
//     );
//     const next = [...config.rules];
//     [next[index], next[target]] = [next[target], next[index]];
//     update("rules", next);
//   };
//   return (
//     <Card
//       title="6 · Auto-replies"
//       subtitle="These rules run before the AI and reduce LLM usage. The first matching rule wins."
//     >
//       <div className="mb-5 flex flex-wrap items-stretch gap-2 text-xs">
//         {[
//           ["Customer message", false],
//           ["Handoff words", false],
//           ["Auto-reply rules", true],
//           ["AI / fixed fallback", false],
//         ].map(([label, hl], i) => (
//           <div key={label} className="flex items-center gap-2">
//             <span
//               className={cn(
//                 "rounded-lg border px-3 py-2",
//                 hl
//                   ? "border-emerald-500/60 bg-emerald-500/5 text-emerald-300"
//                   : "border-[#26262b] bg-[#16161a] text-zinc-400",
//               )}
//             >
//               {label}
//             </span>
//             {i < 3 && <span className="text-zinc-600">→</span>}
//           </div>
//         ))}
//       </div>

//       {!config.rules.length && (
//         <div className="rounded-lg border border-dashed border-[#26262b] p-8 text-center text-zinc-500">
//           No rules yet. Add your first auto-reply below.
//         </div>
//       )}
//       <div className="space-y-4">
//         {config.rules.map((rule, index) => {
//           const p = `rules.${index}`;
//           const r = rule.responseConfig || {};
//           const b = (path) => bind(`${p}.${path}`);
//           const changeType = (type) =>
//             updateRule(index, {
//               responseType: type,
//               responseConfig: {
//                 ...defaultResponse(type, responseText(rule.responseConfig)),
//                 ...(r.attachment ? { attachment: r.attachment } : {}),
//               },
//             });
//           const buttons = r.buttons || [];
//           const hasError = Boolean(
//             b("name").error || b("triggerValue").error,
//           );
//           const isCollapsed = collapsed.includes(index) && !hasError;
//           const triggerLabel =
//             (triggerTypes.find(([v]) => v === rule.triggerType) || [])[1] ||
//             rule.triggerType;
//           return (
//             <div
//               key={index}
//               className={cn(
//                 "rounded-xl border bg-[#16161a] p-4",
//                 rule.enabled
//                   ? "border-[#26262b]"
//                   : "border-[#26262b] opacity-70",
//               )}
//             >
//               <div
//                 className={cn(
//                   "flex flex-wrap items-center justify-between gap-2",
//                   !isCollapsed && "mb-3",
//                 )}
//               >
//                 <button
//                   type="button"
//                   onClick={() => toggleCollapsed(index)}
//                   aria-expanded={!isCollapsed}
//                   className="flex min-w-0 flex-1 items-center gap-2 text-left"
//                 >
//                   <span
//                     className={cn(
//                       "inline-flex transition-transform",
//                       isCollapsed ? "-rotate-90" : "",
//                     )}
//                   >
//                     <Icon name="down" />
//                   </span>
//                   <span className="rounded-full border border-[#26262b] px-2 py-0.5 text-[11px] text-zinc-400">
//                     Rule {index + 1}
//                   </span>
//                   <span className="truncate text-sm font-medium text-zinc-200">
//                     {rule.name || "Untitled rule"}
//                   </span>
//                   {isCollapsed && (
//                     <span className="hidden truncate text-xs text-zinc-500 sm:inline">
//                       {triggerLabel}
//                       {rule.triggerValue ? `: ${rule.triggerValue}` : ""} ·{" "}
//                       {rule.responseType}
//                     </span>
//                   )}
//                 </button>
//                 <div className="flex items-center gap-2">
//                   <Toggle
//                     ariaLabel={`Rule ${index + 1} enabled`}
//                     label={rule.enabled ? "On" : "Off"}
//                     checked={rule.enabled}
//                     onChange={(v) => updateRule(index, { enabled: v })}
//                   />
//                   <Button
//                     size="icon"
//                     variant="ghost"
//                     onClick={() => move(index, -1)}
//                     disabled={index === 0}
//                     aria-label="Move up"
//                   >
//                     <Icon name="up" />
//                   </Button>
//                   <Button
//                     size="icon"
//                     variant="ghost"
//                     onClick={() => move(index, 1)}
//                     disabled={index === config.rules.length - 1}
//                     aria-label="Move down"
//                   >
//                     <Icon name="down" />
//                   </Button>
//                   <Button
//                     size="sm"
//                     variant="danger"
//                     onClick={() => {
//                       setCollapsed((c) =>
//                         c.filter((x) => x !== index).map((x) => (x > index ? x - 1 : x)),
//                       );
//                       update(
//                         "rules",
//                         config.rules.filter((_, i) => i !== index),
//                       );
//                     }}
//                   >
//                     Remove
//                   </Button>
//                 </div>
//               </div>
//               {!isCollapsed && (<>
//               <div className="grid gap-3 sm:grid-cols-2">
//                 <TextField
//                   label="Rule name"
//                   required
//                   value={rule.name}
//                   onChange={(v) => updateRule(index, { name: v })}
//                   placeholder="Pricing question"
//                   max={60}
//                   {...b("name")}
//                 />
//                 <SelectField
//                   label="Trigger type"
//                   value={rule.triggerType}
//                   onChange={(v) => updateRule(index, { triggerType: v })}
//                   options={triggerTypes}
//                   {...b("triggerType")}
//                 />
//                 {!["always", "first_message"].includes(rule.triggerType) && (
//                   <>
//                   <TextField
//                     label={
//                       rule.triggerType === "keyword"
//                         ? "Keyword / phrase"
//                         : "Trigger ID"
//                     }
//                     required
//                     value={rule.triggerValue}
//                     onChange={(v) => updateRule(index, { triggerValue: v })}
//                     placeholder={
//                       rule.triggerType === "keyword" ? "price" : "our_services"
//                     }
//                     list={
//                       knownIds[rule.triggerType]?.length
//                         ? `known-ids-${rule.triggerType}-${index}`
//                         : undefined
//                     }
//                     hint={
//                       knownIds[rule.triggerType]?.length
//                         ? "Click the field to pick from IDs you already created."
//                         : undefined
//                     }
//                     {...b("triggerValue")}
//                   />
//                   {knownIds[rule.triggerType]?.length > 0 && (
//                     <datalist id={`known-ids-${rule.triggerType}-${index}`}>
//                       {knownIds[rule.triggerType].map((o) => (
//                         <option key={o.id} value={o.id}>
//                           {o.label}
//                         </option>
//                       ))}
//                     </datalist>
//                   )}
//                   </>
//                 )}
//                 {rule.triggerType === "keyword" && (
//                   <SelectField
//                     label="Match mode"
//                     value={rule.matchMode || "contains"}
//                     onChange={(v) => updateRule(index, { matchMode: v })}
//                     options={[
//                       ["contains", "Contains"],
//                       ["exact", "Exact match"],
//                       ["starts_with", "Starts with"],
//                     ]}
//                   />
//                 )}
//                 <SelectField
//                   className={
//                     ["always", "first_message"].includes(rule.triggerType)
//                       ? ""
//                       : "sm:col-span-2"
//                   }
//                   label="Response type"
//                   value={rule.responseType}
//                   onChange={changeType}
//                   options={responseTypes}
//                 />

//                 {rule.responseType !== "media" && (
//                   <>
//                     <SelectField
//                       label="Attach image / link (optional)"
//                       value={r.attachment?.kind || "none"}
//                       onChange={(v) => updateRuleResponse(index, { attachment: { ...r.attachment, kind: v } })}
//                       options={[
//         ["none", "No attachment"],
//         ["image", "Image"],
//         ["video", "Video"],
//         ["document", "Document (PDF)"],
//         ["link", "Link"],
//       ]}
//                     />
//                     {r.attachment?.kind && r.attachment.kind !== "none" && (
//                       <TextField
//                         label={r.attachment.kind === "link" ? "Link (https://)" : "HTTPS media URL"}
//                         value={r.attachment.url}
//                         onChange={(v) => updateRuleResponse(index, { attachment: { ...r.attachment, url: v } })}
//                         placeholder="https://…"
//                         {...b("attachmentUrl")}
//                       />
//                     )}
//                   </>
//                 )}
//               </div>

//               <div className="mt-3 grid gap-3">
//                 {rule.responseType === "text" && (
//                   <TextArea
//                     label="Reply text"
//                     required
//                     rows={3}
//                     max={1024}
//                     value={r.text}
//                     onChange={(v) => updateRuleResponse(index, { text: v })}
//                     placeholder="Automatic reply"
//                     {...b("body")}
//                   />
//                 )}
//                 {rule.responseType === "button" && (
//                   <>
//                     <TextArea
//                       label="Reply text"
//                       required
//                       rows={2}
//                       max={1024}
//                       value={r.body}
//                       onChange={(v) => updateRuleResponse(index, { body: v })}
//                       {...b("body")}
//                     />
//                     <div>
//                       <p className="mb-1.5 text-xs font-medium text-zinc-300">
//                         Buttons (max 3)
//                       </p>
//                       <div className="space-y-2">
//                         {buttons.map((button, j) => (
//                           <div
//                             key={j}
//                             className="grid grid-cols-[1fr_1fr_auto] items-start gap-2"
//                           >
//                             <TextField
//                               aria-label={`Button ${j + 1} ID`}
//                               placeholder="Button ID"
//                               value={button.id}
//                               onChange={(v) =>
//                                 updateRuleResponse(index, {
//                                   buttons: patchAt(buttons, j, { id: v }),
//                                 })
//                               }
//                               {...b(`buttons.${j}.id`)}
//                             />
//                             <TextField
//                               aria-label={`Button ${j + 1} title`}
//                               placeholder="Button title"
//                               max={20}
//                               value={button.title}
//                               onChange={(v) =>
//                                 updateRuleResponse(index, {
//                                   buttons: patchAt(buttons, j, { title: v }),
//                                 })
//                               }
//                               {...b(`buttons.${j}.title`)}
//                             />
//                             <Button
//                               size="icon"
//                               variant="danger"
//                               onClick={() =>
//                                 updateRuleResponse(index, {
//                                   buttons: buttons.filter((_, k) => k !== j),
//                                 })
//                               }
//                               aria-label="Remove button"
//                             >
//                               <Icon name="x" />
//                             </Button>
//                           </div>
//                         ))}
//                       </div>
//                       {b("buttons").error && (
//                         <p role="alert" className="mt-1 text-xs text-red-400">
//                           {b("buttons").error}
//                         </p>
//                       )}
//                       {buttons.length < 3 && (
//                         <Button
//                           size="sm"
//                           className="mt-2"
//                           onClick={() =>
//                             updateRuleResponse(index, {
//                               buttons: [...buttons, { id: "", title: "" }],
//                             })
//                           }
//                         >
//                           <Icon name="plus" className="h-3.5 w-3.5" />
//                           Add button
//                         </Button>
//                       )}
//                     </div>
//                   </>
//                 )}
//                 {rule.responseType === "list" &&
//                   (() => {
//                     const rows = r.sections?.[0]?.rows || [];
//                     const setRows = (next) =>
//                       updateRuleResponse(index, {
//                         sections: [
//                           {
//                             title: r.sections?.[0]?.title || "Options",
//                             rows: next,
//                           },
//                         ],
//                       });
//                     return (
//                       <>
//                         <TextArea
//                           label="Message shown above the list"
//                           required
//                           rows={2}
//                           max={1024}
//                           value={r.body}
//                           onChange={(v) =>
//                             updateRuleResponse(index, { body: v })
//                           }
//                           {...b("body")}
//                         />
//                         <TextField
//                           label="Menu button label"
//                           required
//                           max={20}
//                           value={r.buttonLabel}
//                           onChange={(v) =>
//                             updateRuleResponse(index, { buttonLabel: v })
//                           }
//                           placeholder="View options"
//                           {...b("buttonLabel")}
//                         />
//                         <div>
//                           <p className="mb-1.5 text-xs font-medium text-zinc-300">
//                             List options ({rows.length}/10) - IDs are generated from titles
//                           </p>
//                           <div className="space-y-2">
//                             {rows.map((row, j) => {
//                               const q = `sections.0.rows.${j}`;
//                               const setRow = (patch) =>
//                                 setRows(patchAt(rows, j, patch));
//                               return (
//                                 <div
//                                   key={j}
//                                   className="space-y-2 rounded-lg border border-[#26262b] p-2"
//                                 >
//                                   <div className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
//                                     <TextField
//                                       aria-label={`Row ${j + 1} ID`}
//                                       placeholder="Row ID, e.g. pricing"
//                                       value={row.id}
//                                       onChange={(v) => setRow({ id: v })}
//                                       {...b(`${q}.id`)}
//                                     />
//                                     <TextField
//                                       aria-label={`Row ${j + 1} title`}
//                                       placeholder="Row title"
//                                       max={24}
//                                       value={row.title}
//                                       onChange={(v) => setRow({ title: v })}
//                                       {...b(`${q}.title`)}
//                                     />
//                                     <Button
//                                       size="icon"
//                                       variant="danger"
//                                       onClick={() =>
//                                         setRows(rows.filter((_, k) => k !== j))
//                                       }
//                                       aria-label="Remove row"
//                                     >
//                                       <Icon name="x" />
//                                     </Button>
//                                   </div>
//                                   <TextField
//                                     aria-label="Row description"
//                                     placeholder="Row description (optional)"
//                                     max={72}
//                                     value={row.description}
//                                     onChange={(v) => setRow({ description: v })}
//                                   />
//                                 </div>
//                               );
//                             })}
//                           </div>
//                           {b("rows").error && (
//                             <p role="alert" className="mt-1 text-xs text-red-400">
//                               {b("rows").error}
//                             </p>
//                           )}
//                           {rows.length < 10 && (
//                             <Button
//                               size="sm"
//                               className="mt-2"
//                               onClick={() =>
//                                 setRows([...rows, { id: "", title: "" }])
//                               }
//                             >
//                               <Icon name="plus" className="h-3.5 w-3.5" />
//                               Add option
//                             </Button>
//                           )}
//                         </div>
//                       </>
//                     );
//                   })()}
//                 {rule.responseType === "media" && (
//                   <div className="grid gap-3 sm:grid-cols-2">
//                     <SelectField
//                       label="Media type"
//                       value={r.mediaType || "image"}
//                       onChange={(v) =>
//                         updateRuleResponse(index, { mediaType: v })
//                       }
//                       options={[
//                         ["image", "Image"],
//                         ["video", "Video"],
//                         ["document", "Document"],
//                       ]}
//                     />
//                     <TextField
//                       label="HTTPS media URL"
//                       required
//                       value={r.url}
//                       onChange={(v) => updateRuleResponse(index, { url: v })}
//                       placeholder="https://…"
//                       {...b("url")}
//                     />
//                     <TextField
//                       className="sm:col-span-2"
//                       label="Caption"
//                       max={1024}
//                       value={r.caption}
//                       onChange={(v) =>
//                         updateRuleResponse(index, { caption: v })
//                       }
//                       {...b("caption")}
//                     />
//                   </div>
//                 )}
//                 {rule.responseType === "cta_url" && (
//                   <>
//                     <TextArea
//                       label="Reply text"
//                       required
//                       rows={2}
//                       max={1024}
//                       value={r.body}
//                       onChange={(v) => updateRuleResponse(index, { body: v })}
//                       {...b("body")}
//                     />
//                     <div className="grid gap-3 sm:grid-cols-2">
//                       <TextField
//                         label="Button label"
//                         required
//                         max={20}
//                         value={r.displayText}
//                         onChange={(v) =>
//                           updateRuleResponse(index, { displayText: v })
//                         }
//                         placeholder="Visit website"
//                         {...b("displayText")}
//                       />
//                       <TextField
//                         label="Link (https)"
//                         required
//                         value={r.url}
//                         onChange={(v) => updateRuleResponse(index, { url: v })}
//                         placeholder="https://…"
//                         {...b("url")}
//                       />
//                     </div>
//                   </>
//                 )}
//               </div>
//               </>)}
//             </div>
//           );
//         })}
//       </div>
//       <Button
//         className="mt-4"
//         onClick={() =>
//           update("rules", [
//             ...config.rules,
//             { ...blankRule(), priority: config.rules.length },
//           ])
//         }
//       >
//         <Icon name="plus" />
//         New auto-reply
//       </Button>
//     </Card>
//   );
// }

// function TestStep({
//   config,
//   messages,
//   input,
//   setInput,
//   sendTest,
//   afterHours,
//   setAfterHours,
//   clear,
// }) {
//   const quick = [
//     ...new Set(
//       [
//         "hello",
//         ...config.rules
//           .filter(
//             (r) =>
//               r.enabled && r.triggerType === "keyword" && r.triggerValue.trim(),
//           )
//           .map((r) => r.triggerValue.trim()),
//         splitList(config.handoffKeywords)[0],
//       ].filter(Boolean),
//     ),
//   ].slice(0, 8);
//   const logRef = useRef(null);
//   useEffect(() => {
//     logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
//   }, [messages]);
//   return (
//     <Card
//       title="7 · Test before going live"
//       subtitle="Try common customer messages and see whether an auto-reply, handoff or the AI would answer."
//     >
//       <div className="mb-3 flex flex-wrap items-center gap-2">
//         {quick.map((q) => (
//           <button
//             key={q}
//             type="button"
//             onClick={() => sendTest(q)}
//             className="rounded-full border border-[#26262b] bg-[#0c0c0f] px-3 py-1 text-xs text-zinc-300 transition hover:border-sky-500 hover:text-sky-300"
//           >
//             {q}
//           </button>
//         ))}
//         <span className="flex-1" />
//         <Toggle
//           label="Simulate after-hours"
//           checked={afterHours}
//           onChange={setAfterHours}
//         />
//         <Button size="sm" variant="ghost" onClick={clear}>
//           Clear
//         </Button>
//       </div>
//       <div
//         ref={logRef}
//         className="mb-3 h-72 space-y-2 overflow-auto rounded-lg border border-[#26262b] bg-[#050506] p-3"
//         aria-live="polite"
//       >
//         {!messages.length && (
//           <p className="pt-24 text-center text-zinc-600">
//             Send a message to see how your automation responds.
//           </p>
//         )}
//         {messages.map((m, i) => (
//           <div
//             key={i}
//             className={cn(
//               "max-w-[85%] rounded-lg px-3 py-2",
//               m.role === "user" ? "ml-auto bg-emerald-900/50" : "bg-[#1c1c21]",
//               m.muted && "italic text-zinc-500",
//             )}
//           >
//             <b className="mb-0.5 block text-[11px] text-zinc-400">
//               {m.role === "user" ? "You" : "Bot"}
//             </b>
//             <span className="whitespace-pre-wrap">{m.text}</span>
//             {m.source && (
//               <small className="mt-1 block text-[11px] text-sky-400">
//                 {m.source}
//               </small>
//             )}
//           </div>
//         ))}
//       </div>
//       <form
//         className="flex gap-2"
//         onSubmit={(e) => {
//           e.preventDefault();
//           sendTest();
//         }}
//       >
//         <input
//           value={input}
//           onChange={(e) => setInput(e.target.value)}
//           placeholder="Try: price, hello, human…"
//           aria-label="Test message"
//           className={cn(inputBase, inputTone(false))}
//         />
//         <Button type="submit" variant="primary" disabled={!input.trim()}>
//           Send
//         </Button>
//       </form>
//     </Card>
//   );
// }

// function ReviewStep({
//   config,
//   connected,
//   connectionReady,
//   issues,
//   goTo,
//   onActivate,
//   saving,
// }) {
//   const enabledTools = config.tools.filter(
//     (tool) => tool.enabled !== false,
//   ).length;
//   const cards = [
//     [
//       "Business",
//       [
//         config.businessName || "Not set",
//         `${languages.find(([v]) => v === config.language)?.[1] || config.language} · ${config.timezone}`,
//       ],
//     ],
//     [
//       "Channel",
//       [
//         config.provider === "cloud_api" ? "Meta Cloud API" : "QR linked device",
//         config.provider === "cloud_api"
//           ? connectionReady
//             ? "Credentials filled in"
//             : "Credentials incomplete"
//           : connected
//             ? "Connected"
//             : "Connect before live messages",
//       ],
//     ],
//     [
//       "Knowledge",
//       [
//         `${config.products.length} products · ${config.faqs.length} FAQs`,
//         config.knowledge ? "General facts added" : "No general facts",
//       ],
//     ],
//     [
//       "Behavior",
//       [
//         `${enabledTools} tools · ${config.rules.filter((r) => r.enabled).length} active auto-replies`,
//         `Fallback: ${config.fallbackMode === "ai" ? "AI" : "fixed message"}`,
//       ],
//     ],
//   ];
//   return (
//     <Card
//       title="8 · Review and go live"
//       subtitle="Check the setup before activation."
//     >
//       <div className="grid gap-3 sm:grid-cols-2">
//         {cards.map(([title, lines]) => (
//           <div
//             key={title}
//             className="rounded-lg border border-[#26262b] bg-[#16161a] p-4"
//           >
//             <b className="text-zinc-100">{title}</b>
//             {lines.map((line) => (
//               <p key={line} className="mt-1 text-zinc-400">
//                 {line}
//               </p>
//             ))}
//           </div>
//         ))}
//       </div>
//       <H3>Go-live checklist</H3>
//       {issues.length ? (
//         <ul className="space-y-2">
//           {issues.map((issue) => (
//             <li
//               key={issue.text}
//               className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-red-200"
//             >
//               <span className="flex items-center gap-2">
//                 <Icon name="alert" />
//                 {issue.text}
//               </span>
//               <Button size="sm" onClick={() => goTo(issue.step)}>
//                 Fix
//               </Button>
//             </li>
//           ))}
//         </ul>
//       ) : (
//         <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-emerald-200">
//           <Icon name="check" />
//           Everything looks good — you can activate this automation.
//         </p>
//       )}
//       <Button
//         variant="primary"
//         className="mt-5"
//         onClick={onActivate}
//         disabled={saving || issues.length > 0}
//       >
//         {saving ? "Activating…" : "Activate automation"}
//       </Button>
//     </Card>
//   );
// }

// /* ───────────────────────────── preview ───────────────────────────── */

// function PhonePreview({ config, messages, onButton }) {
//   const ref = useRef(null);
//   useEffect(() => {
//     ref.current?.scrollTo({ top: ref.current.scrollHeight });
//   }, [messages]);
//   const name = config.businessName || "Your business";
//   const bubble =
//     "max-w-[85%] rounded-lg px-2.5 py-1.5 text-[13px] leading-snug text-[#e9edef] shadow-sm";
//   return (
//     <aside
//       className="hidden xl:sticky xl:top-[72px] xl:block xl:self-start"
//       aria-label="WhatsApp preview"
//     >
//       <div className="rounded-[28px] border border-[#26262b] bg-black p-2.5 shadow-2xl shadow-black/60">
//         <div className="flex h-[600px] flex-col overflow-hidden rounded-[20px] bg-[#0b141a]">
//           <div className="flex items-center gap-2.5 bg-[#202c33] px-3 py-2.5">
//             <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500 font-bold text-black">
//               {name[0].toUpperCase()}
//             </span>
//             <div className="min-w-0">
//               <b className="block truncate text-sm">{name}</b>
//               <small className="text-[11px] text-[#8696a0]">online</small>
//             </div>
//           </div>
//           <div
//             ref={ref}
//             className="flex flex-1 flex-col gap-1.5 overflow-auto p-3"
//           >
//             {config.initialMessage && (
//               <div className={cn(bubble, "self-start bg-[#202c33]")}>
//                 {config.initialMessage}
//               </div>
//             )}
//             {!config.initialMessage && !messages.length && (
//               <div
//                 className={cn(bubble, "self-start bg-[#202c33] text-[#8696a0]")}
//               >
//                 Your WhatsApp preview will appear here.
//               </div>
//             )}
//             {messages.map((m, i) => (
//               <div
//                 key={i}
//                 className={cn(
//                   bubble,
//                   m.role === "user"
//                     ? "self-end bg-[#005c4b]"
//                     : "self-start bg-[#202c33]",
//                 )}
//               >
//                 {m.media && (
//                   <div className="mb-1 rounded bg-black/30 px-2 py-6 text-center text-[11px] text-[#8696a0]">
//                     [{m.media.mediaType || "media"}]
//                   </div>
//                 )}
//                 <span className="whitespace-pre-wrap">{m.text}</span>
//                 {m.buttons?.map((b, j) => (
//                   <button
//                     key={j}
//                     type="button"
//                     onClick={() => onButton(b)}
//                     className="mt-1.5 block w-full rounded-md bg-[#2a3942] py-1.5 text-center font-medium text-[#53bdeb] transition hover:bg-[#33444e]"
//                   >
//                     {b.title}
//                   </button>
//                 ))}
//                 {m.cta?.displayText && (
//                   <div className="mt-1.5 flex items-center justify-center gap-1 rounded-md bg-[#2a3942] py-1.5 font-medium text-[#53bdeb]">
//                     <Icon name="link" className="h-3.5 w-3.5" />
//                     {m.cta.displayText}
//                   </div>
//                 )}
//                 {m.source && (
//                   <small className="mt-1 block text-[10px] text-[#53bdeb]">
//                     {m.source}
//                   </small>
//                 )}
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>
//       <p className="mt-2 text-center text-[11px] text-zinc-600">
//         Live preview · updates as you type
//       </p>
//     </aside>
//   );
// }


import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { SERVER_URL } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";
import { toolOptions } from "@/components/whatsapp/automationKit";
import CustomToolsEditor from "@/components/whatsapp/CustomToolsEditor";

/* ────────────────────────────────────────────────────────────────────────────
   WhatsApp automation setup — Tailwind CSS only.
   Flow: Business → Knowledge → Behavior → Hours → Auto-replies → WhatsApp → Review
   Header has Save / Test (toggles the live WhatsApp panel) / Publish.
   Only Meta Cloud API is supported in the UI.
   ──────────────────────────────────────────────────────────────────────────── */

const steps = [
  ["Business", "Profile and language"],
  ["Knowledge", "Products and FAQs"],
  ["Behavior", "Tone, prompt and tools"],
  ["Hours", "Availability"],
  ["Auto-replies", "No-LLM rules"],
  ["WhatsApp", "Connect Meta Cloud API"],
  ["Review", "Check and publish"],
];
const STEP = {
  business: 0,
  knowledge: 1,
  behavior: 2,
  hours: 3,
  rules: 4,
  channel: 5,
  review: 6,
};

const languages = [
  ["en-US", "English"],
  ["hi-IN", "Hindi"],
  ["mr-IN", "Marathi"],
  ["gu-IN", "Gujarati"],
  ["ta-IN", "Tamil"],
  ["es-ES", "Spanish"],
];
const industries = [
  ["", "Select an industry"],
  ["ecommerce", "E-commerce & Online Store"],
  ["retail", "Retail & Shops"],
  ["restaurants", "Restaurants & Food Services"],
  ["travel", "Travel & Hospitality"],
  ["healthcare", "Healthcare & Clinics"],
  ["education", "Education & Coaching"],
  ["real_estate", "Real Estate"],
  ["finance", "Finance & Insurance"],
  ["professional_services", "Professional Services"],
  ["technology", "Technology & Software"],
  ["marketing", "Marketing & Advertising"],
  ["automotive", "Automotive"],
  ["beauty_wellness", "Beauty & Wellness"],
  ["fitness", "Fitness & Sports"],
  ["logistics", "Logistics & Delivery"],
  ["legal", "Legal Services"],
  ["nonprofit", "Non-profit & NGO"],
  ["government", "Government & Public Services"],
  ["other", "Other"],
];
const timezones = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];
const dayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/* Trigger + response metadata (colour coded) */
const triggerMeta = {
  keyword: {
    label: "Keyword",
    long: "Keyword in message",
    desc: "Customer's text contains a word or phrase",
    icon: "hash",
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    bar: "bg-sky-500",
    tile: "border-sky-500/60 bg-sky-500/10 text-sky-200",
  },
  button_press: {
    label: "Button",
    long: "Button ID",
    desc: "Customer taps a reply button",
    icon: "cursor",
    chip: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    bar: "bg-violet-500",
    tile: "border-violet-500/60 bg-violet-500/10 text-violet-200",
  },
  list_row: {
    label: "List row",
    long: "List row ID",
    desc: "Customer picks an item from a list",
    icon: "list",
    chip: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
    bar: "bg-fuchsia-500",
    tile: "border-fuchsia-500/60 bg-fuchsia-500/10 text-fuchsia-200",
  },
  first_message: {
    label: "Welcome",
    long: "First message (welcome)",
    desc: "Very first message of a conversation",
    icon: "wave",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    bar: "bg-emerald-500",
    tile: "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
  },
  always: {
    label: "Catch-all",
    long: "Always (catch-all)",
    desc: "Matches every message — keep it last",
    icon: "bolt",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    bar: "bg-amber-500",
    tile: "border-amber-500/60 bg-amber-500/10 text-amber-200",
  },
};
const triggerTypes = Object.keys(triggerMeta);

const responseMeta = {
  text: { label: "Text", icon: "chat" },
  button: { label: "Buttons", icon: "cursor" },
  list: { label: "List", icon: "list" },
  media: { label: "Media", icon: "image" },
  cta_url: { label: "Link", icon: "globe" },
};
const responseTypes = Object.keys(responseMeta);

const ruleTemplates = [
  {
    label: "Welcome menu",
    emoji: "👋",
    rule: {
      name: "Welcome",
      triggerType: "first_message",
      responseType: "button",
      responseConfig: {
        _type: "button",
        body: "Hi! 👋 Welcome. How can we help you today?",
        buttons: [
          { id: "", title: "Our services" },
          { id: "", title: "Talk to team" },
        ],
      },
    },
  },
  {
    label: "Pricing",
    emoji: "💰",
    rule: {
      name: "Pricing question",
      triggerType: "keyword",
      triggerValue: "price",
      responseType: "text",
      responseConfig: {
        _type: "text",
        text: "Our pricing depends on what you need. Tell us a bit more and we will share an exact quote.",
      },
    },
  },
  {
    label: "Opening hours",
    emoji: "🕒",
    rule: {
      name: "Opening hours",
      triggerType: "keyword",
      triggerValue: "hours",
      responseType: "text",
      responseConfig: {
        _type: "text",
        text: "We are open Monday to Saturday, 9 AM – 6 PM.",
      },
    },
  },
  {
    label: "Location",
    emoji: "📍",
    rule: {
      name: "Location",
      triggerType: "keyword",
      triggerValue: "address",
      responseType: "text",
      responseConfig: {
        _type: "text",
        text: "You can find us at our store. Send us a message if you need directions.",
      },
    },
  },
  {
    label: "Website link",
    emoji: "🔗",
    rule: {
      name: "Website link",
      triggerType: "keyword",
      triggerValue: "website",
      responseType: "cta_url",
      responseConfig: {
        _type: "cta_url",
        body: "Here is our website with everything in one place.",
        displayText: "Visit website",
        url: "https://",
      },
    },
  },
  {
    label: "Services list",
    emoji: "📋",
    rule: {
      name: "Services menu",
      triggerType: "keyword",
      triggerValue: "services",
      responseType: "list",
      responseConfig: {
        _type: "list",
        body: "Here is what we offer. Pick one to know more.",
        buttonLabel: "View options",
        sections: [
          {
            title: "Options",
            rows: [
              { id: "", title: "Service one" },
              { id: "", title: "Service two" },
            ],
          },
        ],
      },
    },
  },
];

const blankRule = () => ({
  name: "",
  triggerType: "keyword",
  triggerValue: "",
  matchMode: "contains",
  responseType: "text",
  responseConfig: { _type: "text", text: "" },
  enabled: true,
  priority: 0,
});

const emptyConfig = {
  name: "",
  businessName: "",
  industry: "",
  description: "",
  businessPhone: "",
  businessEmail: "",
  websiteUrl: "",
  address: "",
  language: "en-US",
  supportedLanguages: ["en-US"],
  timezone: "Asia/Kolkata",
  systemPrompt: "",
  initialMessage: "",
  fallbackMode: "ai",
  fallbackMessage:
    "Thanks for your message. Our team will get back to you shortly.",
  handoffKeywords: "human, agent, representative",
  handoffMessage: "I will connect you with a team member.",
  tone: "friendly",
  responseLength: "balanced",
  provider: "cloud_api",
  meta: {
    phoneNumber: "",
    phoneNumberId: "",
    apiToken: "",
    verifyToken: "",
    appSecret: "",
    businessId: "",
  },
  products: [],
  faqs: [],
  knowledge: "",
  tools: [],
  hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    enabled: dayOfWeek < 6,
    openTime: "09:00",
    closeTime: "18:00",
  })),
  awayMessage:
    "We are currently closed. We will respond during business hours.",
  afterHoursMode: "both",
  typingDelay: "0",
  rules: [],
};

/* ───────────────────────────── helpers ───────────────────────────── */

const cn = (...parts) => parts.filter(Boolean).join(" ");
const splitList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const patchAt = (list, index, patch) =>
  list.map((item, i) => (i === index ? { ...item, ...patch } : item));
const randomToken = () =>
  `vt_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;

function normalizeHours(list) {
  const rows = Array.isArray(list) ? list : [];
  return emptyConfig.hours.map((fallback) => {
    const row = rows.find((h) => Number(h?.dayOfWeek) === fallback.dayOfWeek);
    if (!row) return fallback;
    return {
      dayOfWeek: fallback.dayOfWeek,
      enabled: row.enabled ?? fallback.enabled,
      openTime: row.openTime || fallback.openTime,
      closeTime: row.closeTime || fallback.closeTime,
    };
  });
}

function normalizeConfig(automation) {
  const onboarding = automation?.promptConfig?.onboarding || {};
  const saved = automation?.promptConfig?.setup || {};
  const conn =
    (automation?.connections || []).find((c) =>
      ["cloud_api", "meta_cloud", "meta"].includes(c?.provider)
    ) || automation?.connections?.[0];
  const savedMeta = saved.meta || {};
  const meta = {
    phoneNumber: conn?.phoneNumber || savedMeta.phoneNumber || "",
    phoneNumberId: conn?.phoneNumberId || savedMeta.phoneNumberId || "",
    businessId: conn?.businessId || savedMeta.businessId || "",
    apiToken: conn?.apiToken || savedMeta.apiToken || (conn ? "***" : ""),
    verifyToken: conn?.verifyToken || savedMeta.verifyToken || "",
    appSecret: conn?.appSecret || savedMeta.appSecret || (conn?.appSecret ? "***" : ""),
  };
  return {
    ...emptyConfig,
    ...saved,
    provider: "cloud_api",
    meta,
    name: automation?.name || "",
    businessName:
      automation?.businessName ||
      saved.businessName ||
      onboarding.businessProfile?.businessName ||
      "",
    description: automation?.description || saved.description || "",
    industry:
      automation?.industry ||
      saved.industry ||
      onboarding.businessProfile?.industry ||
      "",
    businessPhone: automation?.businessPhone || saved.businessPhone || "",
    businessEmail: automation?.businessEmail || saved.businessEmail || "",
    websiteUrl: automation?.websiteUrl || saved.websiteUrl || "",
    address: automation?.address || saved.address || "",
    language: automation?.language || "en-US",
    supportedLanguages: automation?.supportedLanguages?.length
      ? automation.supportedLanguages
      : ["en-US"],
    timezone: automation?.timezone || "Asia/Kolkata",
    systemPrompt: automation?.systemPrompt || "",
    initialMessage: automation?.initialMessage || "",
    fallbackMode: automation?.fallbackMode || saved.fallbackMode || "ai",
    fallbackMessage:
      automation?.fallbackMessage ||
      saved.fallbackMessage ||
      emptyConfig.fallbackMessage,
    handoffMessage:
      automation?.handoffMessage ||
      saved.handoffMessage ||
      emptyConfig.handoffMessage,
    handoffKeywords:
      automation?.handoffKeywords?.join(", ") ||
      saved.handoffKeywords ||
      emptyConfig.handoffKeywords,
    tone: automation?.tone || saved.tone || "friendly",
    responseLength:
      automation?.responseLength || saved.responseLength || "balanced",
    tools: (automation?.tools || onboarding.tools || []).map((tool) => ({
      ...tool,
      enabled: tool.enabled !== false,
    })),
    products: saved.products || automation?.products || [],
    faqs: saved.faqs || automation?.faqs || [],
    hours: normalizeHours(
      saved.hours?.length ? saved.hours : automation?.businessHours,
    ),
    rules: saved.rules || automation?.autoReplies || [],
  };
}

function parseRule(rule) {
  let responseConfig = rule.responseConfig;
  if (!responseConfig) {
    try {
      responseConfig = JSON.parse(rule.response);
    } catch {
      responseConfig = {
        _type: rule.responseType || "text",
        text: rule.response || "",
      };
    }
  }
  return { ...rule, responseConfig };
}

function responseText(response) {
  if (!response) return "";
  if (response._type === "text") return response.text || "";
  return response.body || response.caption || response.text || "";
}

function defaultResponse(type, carriedText = "") {
  if (type === "button")
    return {
      _type: "button",
      body: carriedText,
      buttons: [{ id: "", title: "" }],
    };
  if (type === "media")
    return {
      _type: "media",
      mediaType: "image",
      url: "",
      caption: carriedText,
    };
  if (type === "list")
    return {
      _type: "list",
      body: carriedText,
      buttonLabel: "View Options",
      sections: [{ title: "Options", rows: [{ id: "", title: "" }] }],
    };
  if (type === "cta_url")
    return { _type: "cta_url", body: carriedText, displayText: "", url: "" };
  return { _type: "text", text: carriedText };
}

function buildPrompt(config, tools) {
  return [
    `You are the WhatsApp assistant for ${config.businessName || "the business"}.`,
    config.description,
    config.knowledge,
    `Be ${config.tone} and keep replies ${config.responseLength}.`,
    `Use only confirmed business information. Enabled tools: ${tools.join(", ") || "none"}.`,
    "Return one JSON response using the supported WhatsApp response types.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 40);

const AUTO_ID = /-(btn|row)-\d+$/;
const autoId = (ruleName, kind, n, ruleIndex) =>
  `${slugify(ruleName) || `rule-${ruleIndex + 1}`}-${kind}-${n}`;

/* ───────────────────────────── validation ───────────────────────────── */

const isPhone = (value) => {
  const digits = value.replace(/\D/g, "");
  return (
    /^\+?[\d\s().-]+$/.test(value) && digits.length >= 7 && digits.length <= 15
  );
};
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
const isUrl = (value, httpsOnly = false) => {
  try {
    const url = new URL(value);
    return httpsOnly
      ? url.protocol === "https:"
      : ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};
const isTimezone = (value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
const blank = (value) => !String(value ?? "").trim();

function validateBusiness(c) {
  const e = {};
  if (blank(c.name)) e.name = "Give this automation a name.";
  else if (c.name.trim().length < 3) e.name = "Use at least 3 characters.";
  else if (c.name.length > 60) e.name = "Keep it under 60 characters.";
  if (blank(c.businessName)) e.businessName = "Business name is required.";
  else if (c.businessName.trim().length < 2)
    e.businessName = "Use at least 2 characters.";
  else if (c.businessName.length > 80)
    e.businessName = "Keep it under 80 characters.";
  if (!blank(c.businessPhone) && !isPhone(c.businessPhone))
    e.businessPhone =
      "Enter a valid phone with 7–15 digits, e.g. +91 98765 43210.";
  if (!blank(c.businessEmail) && !isEmail(c.businessEmail))
    e.businessEmail = "Enter a valid email address.";
  if (!blank(c.websiteUrl) && !isUrl(c.websiteUrl.trim()))
    e.websiteUrl = "Enter a full URL starting with http:// or https://";
  if ((c.description || "").length > 500)
    e.description = "Keep the description under 500 characters.";
  if ((c.address || "").length > 300)
    e.address = "Keep the address under 300 characters.";
  if (blank(c.timezone) || !isTimezone(c.timezone))
    e.timezone = "Choose a valid timezone.";
  return e;
}

function validateChannel(c, hasExistingConnection = false) {
  const e = {};
  const m = c.meta || {};
  if (blank(m.phoneNumber))
    e["meta.phoneNumber"] = "Display phone number is required.";
  else if (!isPhone(m.phoneNumber))
    e["meta.phoneNumber"] = "Enter a valid phone number.";
  if (blank(m.phoneNumberId))
    e["meta.phoneNumberId"] = "Phone Number ID is required.";
  else if (!/^\d{10,20}$/.test(String(m.phoneNumberId || "").trim()))
    e["meta.phoneNumberId"] =
      "Use the numeric ID from Meta API Setup (10–20 digits).";
  if (blank(m.businessId))
    e["meta.businessId"] = "WhatsApp Business Account ID is required.";
  else if (!/^\d{10,20}$/.test(String(m.businessId || "").trim()))
    e["meta.businessId"] = "Use the numeric WABA ID (10–20 digits).";

  const isMaskedOrRetained =
    m.apiToken === "***" || (hasExistingConnection && blank(m.apiToken));
  if (!isMaskedOrRetained) {
    if (blank(m.apiToken)) e["meta.apiToken"] = "Access token is required.";
    else if (/\s/.test(m.apiToken) || m.apiToken.trim().length < 20)
      e["meta.apiToken"] = "Token looks too short or contains spaces.";
  }

  if (blank(m.verifyToken))
    e["meta.verifyToken"] = "Verify token is required — generate one.";
  else if (!/^\S{8,64}$/.test(String(m.verifyToken || "").trim()))
    e["meta.verifyToken"] = "Use 8–64 characters with no spaces.";

  if (
    !blank(m.appSecret) &&
    m.appSecret !== "***" &&
    !/^[a-f0-9]{32}$/i.test(String(m.appSecret || "").trim())
  )
    e["meta.appSecret"] = "App secret should be 32 hexadecimal characters.";
  return e;
}

function validateKnowledge(c) {
  const e = {};
  if ((c.knowledge || "").length > 5000)
    e.knowledge = "Keep general knowledge under 5,000 characters.";
  c.products.forEach((p, i) => {
    if (blank(p.name)) e[`products.${i}.name`] = "Product name is required.";
    else if (p.name.length > 80) e[`products.${i}.name`] = "Max 80 characters.";
    if ((p.price || "").length > 40)
      e[`products.${i}.price`] = "Max 40 characters.";
    if ((p.description || "").length > 300)
      e[`products.${i}.description`] = "Max 300 characters.";
  });
  c.faqs.forEach((f, i) => {
    if (blank(f.question)) e[`faqs.${i}.question`] = "Question is required.";
    else if (f.question.length > 200)
      e[`faqs.${i}.question`] = "Max 200 characters.";
    if (blank(f.answer)) e[`faqs.${i}.answer`] = "Answer is required.";
    else if (f.answer.length > 1000)
      e[`faqs.${i}.answer`] = "Max 1,000 characters.";
  });
  return e;
}

function validateBehavior(c) {
  const e = {};
  if ((c.initialMessage || "").length > 1024)
    e.initialMessage =
      "WhatsApp text messages are limited to 1,024 characters here.";
  if ((c.systemPrompt || "").length > 8000)
    e.systemPrompt = "Keep instructions under 8,000 characters.";
  const keywords = splitList(c.handoffKeywords);
  if (keywords.some((k) => k.length < 2))
    e.handoffKeywords = "Each keyword needs at least 2 characters.";
  if (keywords.length && blank(c.handoffMessage))
    e.handoffMessage = "Add the message sent when a handoff happens.";
  if ((c.handoffMessage || "").length > 1024)
    e.handoffMessage = "Max 1,024 characters.";
  if (c.fallbackMode === "fixed" && blank(c.fallbackMessage))
    e.fallbackMessage = "A fixed fallback needs a message.";
  if ((c.fallbackMessage || "").length > 1024)
    e.fallbackMessage = "Max 1,024 characters.";
  return e;
}

function validateHours(c) {
  const e = {};
  if (!c.hours.some((h) => h.enabled))
    e.hours = "Enable at least one working day.";
  c.hours.forEach((h, i) => {
    if (!h.enabled) return;
    if (!h.openTime) e[`hours.${i}.openTime`] = "Set an opening time.";
    if (!h.closeTime) e[`hours.${i}.closeTime`] = "Set a closing time.";
    if (h.openTime && h.closeTime && h.closeTime <= h.openTime)
      e[`hours.${i}.closeTime`] = "Closing time must be after opening time.";
  });
  if (c.afterHoursMode !== "none" && blank(c.awayMessage))
    e.awayMessage = "Away message is required for this mode.";
  if ((c.awayMessage || "").length > 1024)
    e.awayMessage = "Max 1,024 characters.";
  return e;
}

function validateRules(c) {
  const e = {};
  const seen = new Map();
  c.rules.forEach((rule, i) => {
    const p = `rules.${i}`;
    const r = rule.responseConfig || {};
    if (blank(rule.name)) e[`${p}.name`] = "Name this rule.";
    else if (rule.name.length > 60) e[`${p}.name`] = "Max 60 characters.";

    if (rule.triggerType === "keyword") {
      if (blank(rule.triggerValue))
        e[`${p}.triggerValue`] = "Enter the keyword or phrase to match.";
      else if (rule.triggerValue.length > 100)
        e[`${p}.triggerValue`] = "Max 100 characters.";
    } else if (
      rule.triggerType === "button_press" ||
      rule.triggerType === "list_row"
    ) {
      if (blank(rule.triggerValue))
        e[`${p}.triggerValue`] = "Enter the button / row ID.";
      else if (!/^[\w-]{1,200}$/.test(rule.triggerValue.trim()))
        e[`${p}.triggerValue`] =
          "Use letters, numbers, dashes and underscores only.";
    } else if (
      rule.triggerType === "first_message" &&
      rule.enabled &&
      c.rules.some(
        (other, j) =>
          j < i && other.enabled && other.triggerType === "first_message",
      )
    ) {
      e[`${p}.triggerType`] =
        "Only one welcome rule can run; this one will never fire.";
    } else if (
      rule.triggerType === "always" &&
      rule.enabled &&
      c.rules.slice(i + 1).some((next) => next.enabled)
    ) {
      e[`${p}.triggerType`] =
        "A catch-all matches everything — move it to the bottom.";
    }

    if (
      rule.enabled &&
      rule.triggerType !== "always" &&
      rule.triggerType !== "first_message" &&
      !blank(rule.triggerValue)
    ) {
      const key = `${rule.triggerType}|${rule.matchMode}|${rule.triggerValue.trim().toLowerCase()}`;
      if (seen.has(key))
        e[`${p}.triggerValue`] =
          `Same trigger as rule ${seen.get(key) + 1}; this one will never fire.`;
      else seen.set(key, i);
    }

    const att = r.attachment;
    if (att && att.kind && att.kind !== "none") {
      if (blank(att.url)) e[`${p}.attachmentUrl`] = "URL is required.";
      else if (!isUrl(att.url.trim(), true))
        e[`${p}.attachmentUrl`] = "Use a full https:// URL.";
    }

    const body = r.text ?? r.body ?? "";
    if (rule.responseType === "text") {
      if (blank(r.text)) e[`${p}.body`] = "Reply text is required.";
      else if (r.text.length > 1024) e[`${p}.body`] = "Max 1,024 characters.";
    } else if (rule.responseType === "button") {
      if (blank(r.body)) e[`${p}.body`] = "Reply text is required.";
      else if (r.body.length > 1024) e[`${p}.body`] = "Max 1,024 characters.";
      const buttons = r.buttons || [];
      if (!buttons.length) e[`${p}.buttons`] = "Add at least one button.";
      const ids = new Set();
      buttons.forEach((b, j) => {
        if (blank(b.title)) e[`${p}.buttons.${j}.title`] = "Title required.";
        else if (b.title.length > 20)
          e[`${p}.buttons.${j}.title`] = "Max 20 characters.";
        if (blank(b.id)) e[`${p}.buttons.${j}.id`] = "ID required.";
        else if (!/^[\w-]{1,256}$/.test(b.id.trim()))
          e[`${p}.buttons.${j}.id`] = "Letters, numbers, - and _ only.";
        else if (ids.has(b.id.trim()))
          e[`${p}.buttons.${j}.id`] = "Duplicate ID.";
        else ids.add(b.id.trim());
      });
    } else if (rule.responseType === "list") {
      if (blank(r.body)) e[`${p}.body`] = "Reply text is required.";
      else if (r.body.length > 1024) e[`${p}.body`] = "Max 1,024 characters.";
      if (blank(r.buttonLabel))
        e[`${p}.buttonLabel`] = "Menu button label is required.";
      else if (r.buttonLabel.length > 20)
        e[`${p}.buttonLabel`] = "Max 20 characters.";
      const rows = r.sections?.[0]?.rows || [];
      if (!rows.length) e[`${p}.rows`] = "Add at least one row.";
      else if (rows.length > 10) e[`${p}.rows`] = "Max 10 rows.";
      const ids = new Set();
      rows.forEach((row, j) => {
        const q = `${p}.sections.0.rows.${j}`;
        if (blank(row.title)) e[`${q}.title`] = "Title required.";
        else if (row.title.length > 24) e[`${q}.title`] = "Max 24 characters.";
        if (blank(row.id)) e[`${q}.id`] = "ID required.";
        else if (!/^[\w-]{1,200}$/.test(row.id.trim()))
          e[`${q}.id`] = "Letters, numbers, - and _ only.";
        else if (ids.has(row.id.trim())) e[`${q}.id`] = "Duplicate ID.";
        else ids.add(row.id.trim());
      });
    } else if (rule.responseType === "media") {
      if (blank(r.url)) e[`${p}.url`] = "Media URL is required.";
      else if (!isUrl(r.url.trim(), true))
        e[`${p}.url`] = "Use a public https:// URL.";
      if ((r.caption || "").length > 1024)
        e[`${p}.caption`] = "Max 1,024 characters.";
    } else if (rule.responseType === "cta_url") {
      if (blank(r.body)) e[`${p}.body`] = "Reply text is required.";
      else if (body.length > 1024) e[`${p}.body`] = "Max 1,024 characters.";
      if (blank(r.displayText))
        e[`${p}.displayText`] = "Button label is required.";
      else if (r.displayText.length > 20)
        e[`${p}.displayText`] = "Max 20 characters.";
      if (blank(r.url)) e[`${p}.url`] = "Link is required.";
      else if (!isUrl(r.url.trim(), true))
        e[`${p}.url`] = "Use a full https:// URL.";
    }
  });
  return e;
}

// index === STEP.*
const stepValidators = [
  validateBusiness,
  validateKnowledge,
  validateBehavior,
  validateHours,
  validateRules,
  validateChannel,
  () => ({}),
];

/* ───────────────────────────── bot simulator ───────────────────────────── */

function matchesRule(rule, lower, id, isFirst) {
  const value = (rule.triggerValue || "").trim();
  if (rule.triggerType === "first_message") return isFirst;
  if (rule.triggerType === "always") return true;
  if (rule.triggerType === "button_press" || rule.triggerType === "list_row")
    return !!id && id === value;
  if (id || !value) return false;
  const v = value.toLowerCase();
  if (rule.matchMode === "exact") return lower === v;
  if (rule.matchMode === "starts_with") return lower.startsWith(v);
  return lower.includes(v);
}

function runBot(config, { text, id, afterHours, isFirst }) {
  const replies = [];
  if (afterHours) {
    if (config.afterHoursMode === "none") return { silent: true, replies };
    replies.push({ text: config.awayMessage, source: "Away message" });
    if (config.afterHoursMode === "away") return { replies };
  }
  const lower = text.toLowerCase();
  if (
    !id &&
    splitList(config.handoffKeywords).some((k) =>
      lower.includes(k.toLowerCase()),
    )
  ) {
    replies.push({ text: config.handoffMessage, source: "Human handoff" });
    return { replies };
  }
  const rule = config.rules.find(
    (item) => item.enabled && matchesRule(item, lower, id, isFirst),
  );
  if (rule) {
    const r = rule.responseConfig || {};
    replies.push({
      text: responseText(r),
      buttons:
        rule.responseType === "button"
          ? (r.buttons || []).filter((b) => b.title)
          : rule.responseType === "list"
            ? (r.sections?.[0]?.rows || []).filter((row) => row.title)
            : undefined,
      listLabel: rule.responseType === "list" ? r.buttonLabel : undefined,
      media: rule.responseType === "media" ? r : undefined,
      cta: rule.responseType === "cta_url" ? r : undefined,
      source: `Auto-reply · ${rule.name || "untitled rule"}`,
    });
  } else if (config.fallbackMode === "fixed") {
    replies.push({ text: config.fallbackMessage, source: "Fixed fallback" });
  } else {
    replies.push({
      text: "🤖 The AI would answer this using your instructions and knowledge base.",
      source: "LLM fallback",
    });
  }
  return { replies };
}

/* ───────────────────────────── UI primitives ───────────────────────────── */

const inputBase =
  "w-full rounded-lg border bg-[#0c0c0f] px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50";
const inputTone = (error) =>
  error
    ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/20"
    : "border-[#26262b] hover:border-[#3a3a42] focus:border-emerald-500 focus:ring-emerald-500/20";

const buttonVariants = {
  default:
    "border-[#26262b] bg-[#16161a] text-zinc-100 hover:border-[#3a3a42] hover:bg-[#1b1b20]",
  primary:
    "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500 hover:border-emerald-500 font-semibold shadow-lg shadow-emerald-900/30",
  accent:
    "border-sky-500/50 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20",
  danger: "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20",
  ghost: "border-transparent bg-transparent text-zinc-300 hover:bg-white/5",
};
const buttonSizes = {
  md: "px-4 py-2 text-sm",
  sm: "px-2.5 py-1.5 text-xs",
  icon: "h-8 w-8 justify-center text-base",
};

function Button({
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

const iconPaths = {
  check: "M5 13l4 4L19 7",
  x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  arrowLeft: "M15 19l-7-7 7-7",
  arrowRight: "M9 5l7 7-7 7",
  alert:
    "M12 9v4m0 4h.01M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  up: "M5 15l7-7 7 7",
  down: "M19 9l-7 7-7-7",
  copy: "M8 8h10v12H8zM6 16H4V4h10v2",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  phone: "M7 2h10a1 1 0 011 1v18a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1zM11 18h2",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  hash: "M4 9h16M4 15h16M10 3L8 21M16 3l-2 18",
  chat: "M21 12a8 8 0 01-11.6 7.1L3 20l1.1-4.9A8 8 0 1121 12z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  dup: "M8 8h12v12H8zM4 16V4h12",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5h.01",
  globe:
    "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  rocket:
    "M12 15l-3-3c1-4 4-8 11-9 0 7-5 10-9 11zM9 12H5l2-3h4M12 15v4l3-2M5 19c0-1.5.5-3 1.5-3.5",
  reset: "M4 4v6h6M20 20v-6h-6M20 9A8 8 0 006 6L4 10M4 15a8 8 0 0014 3l2-4",
  cursor: "M5 3l14 7-6 2-2 6L5 3z",
  wave: "M7 11V5a1.5 1.5 0 013 0v5M10 10V4a1.5 1.5 0 013 0v6M13 10V5a1.5 1.5 0 013 0v7M16 12V8a1.5 1.5 0 013 0v5a7 7 0 01-7 7h-1a6 6 0 01-5-3l-2-3a1.5 1.5 0 012.4-1.7L7 14",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z",
  eyeOff:
    "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22",
};

function Icon({ name, className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={iconPaths[name] || iconPaths.chat} />
    </svg>
  );
}

function FieldShell({
  id,
  label,
  required,
  error,
  hint,
  count,
  max,
  className,
  children,
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && (
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={id} className="text-xs font-medium text-zinc-300">
            {label}
            {required && <span className="ml-0.5 text-red-400">*</span>}
          </label>
          {max ? (
            <span
              className={cn(
                "text-[11px] tabular-nums",
                count > max ? "text-red-400" : "text-zinc-600",
              )}
            >
              {count}/{max}
            </span>
          ) : null}
        </div>
      )}
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-1 text-xs text-red-400"
        >
          <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  required,
  className,
  max,
  type = "text",
  ...rest
}) {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
      count={(value || "").length}
      max={max}
    >
      <div className="relative flex items-center">
        <input
          id={id}
          type={inputType}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(inputBase, inputTone(error), isPassword && "pr-10")}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2.5 p-1 text-zinc-400 hover:text-zinc-200 transition focus:outline-none"
            title={showPassword ? "Hide secret" : "Show secret"}
            aria-label={showPassword ? "Hide secret" : "Show secret"}
          >
            <Icon name={showPassword ? "eyeOff" : "eye"} className="h-4 w-4" />
          </button>
        )}
      </div>
    </FieldShell>
  );
}

function TextArea({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  required,
  className,
  max,
  rows = 3,
  ...rest
}) {
  const id = useId();
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
      count={(value || "").length}
      max={max}
    >
      <textarea
        id={id}
        rows={rows}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(inputBase, inputTone(error), "resize-y")}
        {...rest}
      />
    </FieldShell>
  );
}

function SelectField({
  label,
  value,
  onChange,
  onBlur,
  options,
  error,
  hint,
  required,
  className,
}) {
  const id = useId();
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
    >
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        className={cn(
          inputBase,
          inputTone(error),
          "appearance-none bg-[length:16px] bg-[right_0.7rem_center] bg-no-repeat pr-9",
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b8b95' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        }}
      >
        {options.map((option) => {
          const [v, l] = Array.isArray(option) ? option : [option, option];
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </FieldShell>
  );
}

function Toggle({ checked, onChange, label, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || label}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5 text-sm text-zinc-200 focus-visible:outline-none"
    >
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition group-focus-visible:ring-2 group-focus-visible:ring-emerald-500/40",
          checked ? "bg-emerald-600" : "bg-zinc-700",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
      {label}
    </button>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-lg border border-[#26262b] bg-[#0c0c0f] p-1"
      role="radiogroup"
    >
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition",
            value === v
              ? "bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-500/50"
              : "text-zinc-400 hover:text-zinc-200",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Alert({ tone = "info", children, onClose }) {
  const tones = {
    error: "border-red-500/40 bg-red-500/10 text-red-200",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        tones[tone],
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="opacity-70 hover:opacity-100"
        >
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}

function Card({ title, subtitle, children, className, badge }) {
  return (
    <section
      className={cn(
        "mb-4 rounded-2xl border border-[#26262b] bg-gradient-to-b from-[#131316] to-[#101013] p-5 sm:p-6",
        className,
      )}
    >
      {title && (
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
          {badge}
        </div>
      )}
      {subtitle && (
        <p className="mb-5 mt-1 text-sm text-zinc-400">{subtitle}</p>
      )}
      {children}
    </section>
  );
}

const H3 = ({ children, className }) => (
  <h3
    className={cn("mb-3 mt-7 text-sm font-semibold text-zinc-200", className)}
  >
    {children}
  </h3>
);

function Chip({ className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ───────────────────────────── page ───────────────────────────── */

export default function WhatsAppAutomationSetupPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { automationId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNew = !automationId || automationId === "new";

  const [step, setStep] = useState(0);
  const [config, setConfig] = useState(emptyConfig);
  const [automations, setAutomations] = useState([]);
  const [loadedAutomation, setLoadedAutomation] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [setupDone, setSetupDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState([]);
  const [visited, setVisited] = useState([0]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testMessages, setTestMessages] = useState([]);
  const [testInput, setTestInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [afterHours, setAfterHours] = useState(false);
  const snapshot = useRef(JSON.stringify(emptyConfig));
  const typingTimer = useRef(null);

  const statusQuery = searchParams.get("status");
  const isEditMode =
    statusQuery === "edit" ||
    (!isNew && (setupDone || loadedAutomation?.status === "active"));

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const automationResponse = await axios.get(
          `${SERVER_URL}/api/whatsapp-automation`,
        );
        if (cancelled) return;
        const list = automationResponse.data.automations || [];
        setAutomations(list);
        const current = isNew
          ? null
          : (
            await axios.get(
              `${SERVER_URL}/api/whatsapp-automation/${automationId}`,
            )
          ).data.automation;
        if (current) {
          setLoadedAutomation(current);
          const rulesResponse = await axios
            .get(
              `${SERVER_URL}/api/whatsapp-automation/${current.id}/auto-replies`,
            )
            .catch(() => ({ data: { rules: [] } }));
          if (cancelled) return;
          const next = {
            ...normalizeConfig({
              ...current,
              knowledge: current.knowledgeSources
                ?.map((source) => source.content)
                .filter(Boolean)
                .join("\n\n"),
            }),
            rules: (rulesResponse.data.rules || []).map(parseRule),
          };
          snapshot.current = JSON.stringify(next);
          setConfig(next);
          const isDone =
            current.status === "active" ||
            Boolean(current.onboarding?.setup?.setupCompleted);
          setSetupDone(isDone);
          if (isDone && searchParams.get("status") !== "edit") {
            setSearchParams(
              (prev) => {
                const p = new URLSearchParams(prev);
                p.set("status", "edit");
                return p;
              },
              { replace: true },
            );
          }
        } else if (!isNew) {
          setNotice({
            tone: "error",
            text: "This automation could not be found.",
          });
        }
      } catch (err) {
        if (!cancelled)
          setNotice({
            tone: "error",
            text: err.response?.data?.error || err.message,
          });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, automationId, isNew]);

  useEffect(() => {
    if (notice?.tone !== "success") return undefined;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const dirty = useMemo(
    () => JSON.stringify(config) !== snapshot.current,
    [config],
  );
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const currentAutomation = useMemo(() => {
    if (loadedAutomation && (!automationId || loadedAutomation.id === automationId)) {
      return loadedAutomation;
    }
    return automations.find((item) => item.id === automationId) || null;
  }, [loadedAutomation, automations, automationId]);

  const hasConnection = Boolean(
    currentAutomation?.connections?.length ||
      (config.meta?.phoneNumber &&
        config.meta?.phoneNumberId &&
        (config.meta?.apiToken === "***" || (config.meta?.apiToken && config.meta.apiToken.length >= 20)))
  );

  const byStep = useMemo(
    () => [
      validateBusiness(config),
      validateKnowledge(config),
      validateBehavior(config),
      validateHours(config),
      validateRules(config),
      validateChannel(config, Boolean(currentAutomation?.connections?.length)),
      {},
    ],
    [config, currentAutomation?.connections?.length],
  );
  const issueCount = byStep.map((e) => Object.keys(e).length);

  const update = (field, value) =>
    setConfig((current) => ({ ...current, [field]: value }));
  const updateMeta = (field, value) =>
    setConfig((current) => ({
      ...current,
      meta: { ...current.meta, [field]: value },
    }));
  const updateRule = (index, patch) =>
    setConfig((current) => ({
      ...current,
      rules: patchAt(current.rules, index, patch),
    }));
  const updateRuleResponse = (index, patch) =>
    setConfig((current) => ({
      ...current,
      rules: current.rules.map((rule, i) =>
        i === index
          ? { ...rule, responseConfig: { ...rule.responseConfig, ...patch } }
          : rule,
      ),
    }));

  const touch = (path) =>
    setTouched((current) =>
      current[path] ? current : { ...current, [path]: true },
    );
  const fe = (path) =>
    touched[path] || attempted.includes(step) ? byStep[step][path] : undefined;
  const bind = (path) => ({ error: fe(path), onBlur: () => touch(path) });

  const goToStep = (index) => {
    setStep(index);
    setVisited((v) => (v.includes(index) ? v : [...v, index]));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const markAttempted = (index) =>
    setAttempted((current) =>
      current.includes(index) ? current : [...current, index],
    );

  const tryGo = (target) => {
    if (target <= step || setupDone || isEditMode) {
      setNotice(null);
      goToStep(target);
      return;
    }
    const bad = byStep
      .slice(0, target)
      .findIndex((errors) => Object.keys(errors).length > 0);
    if (bad !== -1) {
      markAttempted(bad);
      setNotice({
        tone: "error",
        text: `Fix ${issueCount[bad]} ${issueCount[bad] === 1 ? "issue" : "issues"} in “${steps[bad][0]}” before continuing.`,
      });
      goToStep(bad);
      return;
    }
    setNotice(null);
    goToStep(target);
  };

  const connectionReady = !issueCount[STEP.channel];
  const reviewIssues = byStep.slice(0, STEP.review).flatMap((errors, index) =>
    Object.keys(errors).length
      ? [
        {
          step: index,
          text: `${steps[index][0]}: ${issueCount[index]} ${issueCount[index] === 1 ? "issue" : "issues"} to fix`,
        },
      ]
      : [],
  );

  const stepDone = (i) =>
    i === STEP.review
      ? false
      : !issueCount[i] && (setupDone || isEditMode || (visited.includes(i) && i < step));
  const completed = steps.filter((_, i) => stepDone(i)).length;
  const progress = Math.round(
    (((setupDone || isEditMode) ? steps.length - 1 : completed) / (steps.length - 1)) * 100,
  );

  const save = async (activate = false, keep = false) => {
    const businessErrors = byStep[STEP.business];
    if (businessErrors.name || businessErrors.businessName) {
      markAttempted(STEP.business);
      setNotice({
        tone: "error",
        text: "Enter an automation name and a business name before saving.",
      });
      goToStep(STEP.business);
      return;
    }
    if ((keep || activate) && reviewIssues.length) {
      const first = reviewIssues[0].step;
      markAttempted(first);
      setNotice({
        tone: "error",
        text: activate
          ? `Can't publish yet — ${reviewIssues[0].text}.`
          : `Can't save yet — ${reviewIssues[0].text}.`,
      });
      goToStep(first);
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const enabledTools = config.tools
        .filter((tool) => tool.enabled !== false)
        .map((tool) => tool.name);
      const payload = {
        name: config.name.trim() || config.businessName.trim(),
        businessName: config.businessName.trim(),
        description: config.description,
        language: config.language,
        supportedLanguages: config.supportedLanguages,
        timezone: config.timezone,
        systemPrompt: config.systemPrompt || buildPrompt(config, enabledTools),
        initialMessage: config.initialMessage,
        status: keep
          ? currentAutomation?.status || "active"
          : activate
            ? "active"
            : "draft",
        capabilities: enabledTools,
        onboarding: {
          businessProfile: config,
          capabilities: enabledTools,
          tools: config.tools,
          knowledgeSources: config.knowledge ? [config.knowledge] : [],
          setup: {
            ...config,
            setupCompleted: activate || keep,
            step: activate ? steps.length : step + 1,
          },
        },
      };
      const response = !isNew
        ? await axios.put(
          `${SERVER_URL}/api/whatsapp-automation/${automationId}`,
          payload,
        )
        : await axios.post(`${SERVER_URL}/api/whatsapp-automation`, payload);
      const id = response.data.automation?.id || automationId;
      if (id) {
        // Meta connection: only sent once the credentials are complete.
        if (connectionReady && config.meta.phoneNumber?.trim() && config.meta.phoneNumberId?.trim()) {
          const connection = currentAutomation?.connections?.[0];
          const connectionPayload = {
            provider: "cloud_api",
            phoneNumber: config.meta.phoneNumber.trim(),
            phoneNumberId: config.meta.phoneNumberId.trim(),
            businessId: config.meta.businessId.trim(),
            apiToken: config.meta.apiToken.trim(),
            verifyToken: config.meta.verifyToken.trim(),
            appSecret: config.meta.appSecret.trim() || undefined,
          };
          let savedConn = connection;
          try {
            if (connection?.id) {
              await axios.put(
                `${SERVER_URL}/api/whatsapp-automation/${id}/connections/${connection.id}`,
                connectionPayload,
              );
            } else {
              const res = await axios.post(
                `${SERVER_URL}/api/whatsapp-automation/${id}/connections`,
                connectionPayload,
              );
              savedConn = res.data?.connection;
            }
          } catch (connErr) {
            if (connErr.response?.status === 409) {
              const conflictConn = connErr.response?.data?.connection;
              if (conflictConn?.id) {
                savedConn = conflictConn;
                await axios.put(
                  `${SERVER_URL}/api/whatsapp-automation/${id}/connections/${conflictConn.id}`,
                  connectionPayload,
                );
              }
            } else {
              throw connErr;
            }
          }

          if (savedConn || connection) {
            const activeConn = {
              ...(connection || {}),
              ...(savedConn || {}),
              ...connectionPayload,
              apiToken: "***",
              appSecret: connectionPayload.appSecret ? "***" : "",
            };
            setLoadedAutomation((prev) => {
              const conns = prev?.connections || [];
              const exists = conns.some(
                (c) => c.id === activeConn.id || c.phoneNumber === activeConn.phoneNumber
              );
              return {
                ...(prev || {}),
                id,
                connections: exists
                  ? conns.map((c) =>
                      c.id === activeConn.id || c.phoneNumber === activeConn.phoneNumber
                        ? activeConn
                        : c
                    )
                  : [activeConn, ...conns],
              };
            });
            setAutomations((prev) =>
              prev.map((auto) => {
                if (auto.id !== id) return auto;
                const conns = auto.connections || [];
                const exists = conns.some(
                  (c) => c.id === activeConn.id || c.phoneNumber === activeConn.phoneNumber
                );
                return {
                  ...auto,
                  connections: exists
                    ? conns.map((c) =>
                        c.id === activeConn.id || c.phoneNumber === activeConn.phoneNumber
                          ? activeConn
                          : c
                      )
                    : [activeConn, ...conns],
                };
              })
            );
          }
        }
        const existing = isNew
          ? { data: { rules: [] } }
          : await axios.get(
            `${SERVER_URL}/api/whatsapp-automation/${id}/auto-replies`,
          );
        const existingRules = existing.data.rules || [];
        const retained = new Set(
          config.rules.filter((rule) => rule.id).map((rule) => rule.id),
        );
        await Promise.all(
          existingRules
            .filter((rule) => !retained.has(rule.id))
            .map((rule) =>
              axios.delete(
                `${SERVER_URL}/api/whatsapp-automation/${id}/auto-replies/${rule.id}`,
              ),
            ),
        );
        for (const [index, rule] of config.rules.entries()) {
          const rulePayload = {
            ...rule,
            priority: index,
            response: JSON.stringify(rule.responseConfig),
            responseConfig: rule.responseConfig,
            responseType: rule.responseConfig?._type || rule.responseType,
          };
          if (rule.id && existingRules.some((item) => item.id === rule.id))
            await axios.put(
              `${SERVER_URL}/api/whatsapp-automation/${id}/auto-replies/${rule.id}`,
              rulePayload,
            );
          else
            await axios.post(
              `${SERVER_URL}/api/whatsapp-automation/${id}/auto-replies`,
              rulePayload,
            );
        }
      }
      snapshot.current = JSON.stringify(config);
      if (activate || setupDone || isEditMode) {
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.set("status", "edit");
            return p;
          },
          { replace: true },
        );
      }
      setNotice({
        tone: "success",
        text: keep
          ? "Changes saved."
          : activate
            ? (isEditMode ? "Automation updated." : "Automation published.")
            : "Draft saved.",
      });
      if (isNew || activate) navigate("/whatsapp", { replace: true });
    } catch (err) {
      setNotice({
        tone: "error",
        text: err.response?.data?.error || err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  /* test chat */
  const sendTest = (raw, id, opts = {}) => {
    const text = (raw ?? testInput).trim();
    if (!text) return;
    const base = opts.reset ? [] : testMessages;
    const result = runBot(config, {
      text,
      id,
      afterHours,
      isFirst: !base.some((m) => m.role === "user"),
    });
    const botMessages = result.silent
      ? [
        {
          role: "bot",
          text: "(no reply — bot stays silent after hours)",
          source: "Silent",
          muted: true,
        },
      ]
      : result.replies.map((reply) => ({ role: "bot", ...reply }));
    setTestMessages([...base, { role: "user", text }]);
    if (raw === undefined) setTestInput("");
    setTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      setTestMessages((cur) => [...cur, ...botMessages]);
      setTyping(false);
    }, 650);
  };

  const testRule = (rule) => {
    setPreviewOpen(true);
    const isId =
      rule.triggerType === "button_press" || rule.triggerType === "list_row";
    const text =
      rule.triggerType === "keyword" || isId
        ? rule.triggerValue || "hello"
        : "hello";
    // wait a tick so the panel mounts before messages arrive
    setTimeout(
      () => sendTest(text, isId ? rule.triggerValue : undefined, { reset: true }),
      30,
    );
  };

  const resetTest = () => {
    clearTimeout(typingTimer.current);
    setTyping(false);
    setTestMessages([]);
  };

  const leave = () => {
    if (
      dirty &&
      !window.confirm("You have unsaved changes. Leave without saving?")
    )
      return;
    navigate("/whatsapp");
  };

  if (!isAdmin)
    return (
      <div className="grid min-h-screen place-items-center bg-[#09090b] text-zinc-400">
        Admins only.
      </div>
    );

  const stepProps = { config, update, bind, touch };
  const isLast = step === steps.length - 1;

  return (
    <div className="min-h-screen bg-[#09090b] text-sm text-zinc-100 antialiased">
      {/* ───── header ───── */}
      <header className="sticky top-0 z-30 border-b border-[#26262b] bg-[#09090b]/90 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-7">
          <button
            type="button"
            onClick={leave}
            className="inline-flex items-center gap-1 text-zinc-400 transition hover:text-zinc-100"
          >
            <Icon name="arrowLeft" />
            <span className="hidden sm:inline">Automations</span>
          </button>
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-600/20 text-emerald-400">
              <Icon name="chat" />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-2">
                <strong className="block truncate text-[15px] font-semibold">
                  {config.name || (isEditMode ? "WhatsApp automation" : "New WhatsApp automation")}
                </strong>
                {isEditMode && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                    Edit Mode
                  </span>
                )}
              </div>
              <span className="text-[11px] text-zinc-500">
                {isEditMode ? "Editing Published Automation" : setupDone ? "Published" : "Draft"} · Step {step + 1} of{" "}
                {steps.length}
              </span>
            </div>
          </div>
          {dirty && (
            <Chip className="border-amber-500/40 bg-amber-500/10 text-amber-300">
              Unsaved changes
            </Chip>
          )}
          <span className="flex-1" />
          <div className="hidden items-center gap-2 md:flex">
            <span className="text-xs tabular-nums text-zinc-500">
              {progress}%
            </span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[#26262b]">
              <i
                className="block h-full rounded-full bg-gradient-to-r from-emerald-600 to-sky-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <Button
            onClick={() => save(false, setupDone || isEditMode)}
            disabled={saving || loading}
          >
            {saving ? "Saving…" : isEditMode ? "Save changes" : setupDone ? "Save changes" : "Save draft"}
          </Button>
          <Button
            variant={previewOpen ? "accent" : "default"}
            onClick={() => setPreviewOpen((v) => !v)}
            aria-pressed={previewOpen}
            className={previewOpen ? "ring-1 ring-sky-500/50" : ""}
          >
            <Icon name="phone" />
            Test
            <span
              className={cn(
                "ml-0.5 h-1.5 w-1.5 rounded-full",
                previewOpen ? "bg-sky-400" : "bg-zinc-600",
              )}
            />
          </Button>
          <Button
            variant="primary"
            onClick={() => save(true)}
            disabled={saving || loading}
          >
            <Icon name="rocket" />
            {saving ? "Updating…" : isEditMode ? "Update automation" : setupDone ? "Publish changes" : "Publish"}
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "mx-auto grid max-w-[1560px] gap-5 px-4 py-5 sm:px-7 lg:grid-cols-[230px_minmax(0,1fr)]",
          previewOpen && "xl:grid-cols-[230px_minmax(0,1fr)_380px]",
        )}
      >
        {/* ───── stepper ───── */}
        <nav
          aria-label="Setup steps"
          className="flex gap-1 overflow-x-auto lg:sticky lg:top-[84px] lg:flex-col lg:self-start lg:overflow-visible"
        >
          {steps.map(([title, subtitle], index) => {
            const active = index === step;
            const done = !active && stepDone(index);
            const bad =
              !active &&
              issueCount[index] > 0 &&
              (setupDone || attempted.includes(index) || (visited.includes(index) && index < step));
            return (
              <div key={title} className="relative">
                {index < steps.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-[21px] top-[38px] hidden h-[calc(100%-26px)] w-px lg:block",
                      done ? "bg-emerald-500/50" : "bg-[#26262b]",
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => tryGo(index)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "relative flex w-full shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : "border-transparent hover:bg-[#111114]",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs transition",
                      done
                        ? "border-emerald-500 bg-emerald-500 font-bold text-black"
                        : bad
                          ? "border-red-500/70 bg-red-500/10 text-red-300"
                          : active
                            ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                            : "border-[#26262b] bg-[#09090b] text-zinc-500",
                    )}
                  >
                    {done ? (
                      <Icon name="check" className="h-3.5 w-3.5" />
                    ) : bad ? (
                      "!"
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0 whitespace-nowrap lg:whitespace-normal">
                    <b
                      className={cn(
                        "block text-[13px] font-semibold",
                        active ? "text-zinc-50" : "text-zinc-300",
                      )}
                    >
                      {title}
                    </b>
                    <small className="hidden text-[11px] text-zinc-500 lg:block">
                      {subtitle}
                    </small>
                  </span>
                </button>
              </div>
            );
          })}
        </nav>

        {/* ───── main ───── */}
        <main className="min-w-0">
          {notice && (
            <Alert tone={notice.tone} onClose={() => setNotice(null)}>
              {notice.text}
            </Alert>
          )}
          {loading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-xl border border-[#26262b] bg-[#111114]"
                />
              ))}
            </div>
          ) : (
            <div key={step} className="animate-[fadeIn_.25s_ease-out]">
              {step === STEP.business && <BusinessStep {...stepProps} />}
              {step === STEP.knowledge && <KnowledgeStep {...stepProps} />}
              {step === STEP.behavior && <BehaviorStep {...stepProps} />}
              {step === STEP.hours && <HoursStep {...stepProps} />}
              {step === STEP.rules && (
                <RulesStep
                  {...stepProps}
                  updateRule={updateRule}
                  updateRuleResponse={updateRuleResponse}
                  testRule={testRule}
                />
              )}
              {step === STEP.channel && (
                <ChannelStep
                  {...stepProps}
                  updateMeta={updateMeta}
                  hasConnection={hasConnection}
                  currentAutomation={currentAutomation}
                />
              )}
              {step === STEP.review && (
                <ReviewStep
                  config={config}
                  hasConnection={hasConnection}
                  connectionReady={connectionReady}
                  issues={reviewIssues}
                  goTo={(target) => {
                    markAttempted(target);
                    goToStep(target);
                  }}
                  onActivate={() => save(true)}
                  onTest={() => setPreviewOpen(true)}
                  saving={saving}
                  setupDone={setupDone}
                  isEditMode={isEditMode}
                />
              )}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between">
            <Button onClick={() => tryGo(step - 1)} disabled={step === 0}>
              <Icon name="arrowLeft" />
              Back
            </Button>
            {isLast ? (
              <Button
                variant="primary"
                onClick={() => save(true)}
                disabled={saving || reviewIssues.length > 0}
              >
                <Icon name="rocket" />
                {saving
                  ? "Saving…"
                  : isEditMode
                  ? "Update & save changes"
                  : setupDone
                  ? "Publish changes"
                  : "Publish automation"}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => tryGo(step + 1)}>
                {step === STEP.channel ? "Review" : "Continue"}
                <Icon name="arrowRight" />
              </Button>
            )}
          </div>
        </main>

        {/* ───── toggleable WhatsApp panel ───── */}
        {previewOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/60 xl:hidden"
              onClick={() => setPreviewOpen(false)}
              aria-hidden
            />
            <TestPanel
              config={config}
              messages={testMessages}
              typing={typing}
              input={testInput}
              setInput={setTestInput}
              send={sendTest}
              afterHours={afterHours}
              setAfterHours={setAfterHours}
              reset={resetTest}
              onClose={() => setPreviewOpen(false)}
            />
          </>
        )}
      </div>

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}`}</style>
    </div>
  );
}

/* ───────────────────────────── steps ───────────────────────────── */

function BusinessStep({ config, update, bind }) {
  const toggleLang = (code) => {
    if (code === config.language) return;
    update(
      "supportedLanguages",
      config.supportedLanguages.includes(code)
        ? config.supportedLanguages.filter((l) => l !== code)
        : [...config.supportedLanguages, code],
    );
  };
  return (
    <Card
      title="Business profile"
      subtitle="Tell the assistant who it represents and how it should communicate."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Automation name"
          required
          value={config.name}
          onChange={(v) => update("name", v)}
          placeholder="Customer support bot"
          max={60}
          {...bind("name")}
        />
        <TextField
          label="Business name"
          required
          value={config.businessName}
          onChange={(v) => update("businessName", v)}
          placeholder="Acme Solar"
          max={80}
          {...bind("businessName")}
        />
        <SelectField
          label="Industry"
          value={config.industry}
          onChange={(v) => update("industry", v)}
          options={industries}
        />
        <TextField
          label="Business phone"
          value={config.businessPhone}
          onChange={(v) => update("businessPhone", v)}
          placeholder="+91 98765 43210"
          inputMode="tel"
          {...bind("businessPhone")}
        />
        <TextField
          label="Business email"
          type="email"
          value={config.businessEmail}
          onChange={(v) => update("businessEmail", v)}
          placeholder="hello@business.com"
          {...bind("businessEmail")}
        />
        <TextField
          label="Website"
          value={config.websiteUrl}
          onChange={(v) => update("websiteUrl", v)}
          placeholder="https://"
          inputMode="url"
          {...bind("websiteUrl")}
        />
        <TextArea
          className="sm:col-span-2"
          label="Business description"
          rows={3}
          max={500}
          value={config.description}
          onChange={(v) => update("description", v)}
          placeholder="What do you sell and who do you help?"
          {...bind("description")}
        />
        <TextArea
          className="sm:col-span-2"
          label="Address"
          rows={2}
          max={300}
          value={config.address}
          onChange={(v) => update("address", v)}
          {...bind("address")}
        />
        <SelectField
          label="Primary language"
          value={config.language}
          onChange={(v) => {
            update("language", v);
            if (!config.supportedLanguages.includes(v))
              update("supportedLanguages", [...config.supportedLanguages, v]);
          }}
          options={languages}
        />
        <SelectField
          label="Timezone"
          required
          value={config.timezone}
          onChange={(v) => update("timezone", v)}
          options={
            timezones.includes(config.timezone)
              ? timezones
              : [config.timezone, ...timezones]
          }
          {...bind("timezone")}
        />
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-xs font-medium text-zinc-300">
            Languages the assistant can reply in
          </p>
          <div className="flex flex-wrap gap-2">
            {languages.map(([code, name]) => {
              const on = config.supportedLanguages.includes(code);
              const primary = code === config.language;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleLang(code)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition",
                    on
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                      : "border-[#26262b] text-zinc-400 hover:border-[#3a3a42] hover:text-zinc-200",
                  )}
                >
                  {name}
                  {primary && " · primary"}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function KnowledgeStep({ config, update, bind }) {
  const add = (key, item) => update(key, [...config[key], item]);
  const remove = (key, index) =>
    update(
      key,
      config[key].filter((_, i) => i !== index),
    );
  const suggestions = [
    "What are your opening hours?",
    "Do you offer delivery?",
    "What payment methods do you accept?",
    "What is your refund policy?",
  ];
  return (
    <Card
      title="Knowledge base"
      subtitle="Add facts the assistant can use without inventing answers."
    >
      <TextArea
        label="Business policies, services, delivery, payment and other facts"
        rows={6}
        max={5000}
        value={config.knowledge}
        onChange={(v) => update("knowledge", v)}
        placeholder="Opening hours, service areas, policies…"
        {...bind("knowledge")}
      />

      <H3>
        Products and services{" "}
        <span className="ml-1 text-xs font-normal text-zinc-500">
          ({config.products.length})
        </span>
      </H3>
      <div className="space-y-3">
        {config.products.map((product, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-xl border border-[#26262b] bg-[#16161a] p-3 sm:grid-cols-[1.2fr_0.6fr_1.6fr_auto]"
          >
            <TextField
              label="Name"
              required
              value={product.name}
              onChange={(v) =>
                update("products", patchAt(config.products, index, { name: v }))
              }
              {...bind(`products.${index}.name`)}
            />
            <TextField
              label="Price"
              value={product.price}
              onChange={(v) =>
                update("products", patchAt(config.products, index, { price: v }))
              }
              placeholder="₹55,000"
              {...bind(`products.${index}.price`)}
            />
            <TextField
              label="Description"
              value={product.description}
              onChange={(v) =>
                update(
                  "products",
                  patchAt(config.products, index, { description: v }),
                )
              }
              {...bind(`products.${index}.description`)}
            />
            <Button
              variant="danger"
              size="icon"
              className="self-start sm:mt-6"
              onClick={() => remove("products", index)}
              aria-label={`Remove product ${index + 1}`}
            >
              <Icon name="x" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        size="sm"
        className="mt-3"
        onClick={() => add("products", { name: "", description: "", price: "" })}
      >
        <Icon name="plus" className="h-3.5 w-3.5" />
        Add product
      </Button>

      <H3>
        FAQs{" "}
        <span className="ml-1 text-xs font-normal text-zinc-500">
          ({config.faqs.length})
        </span>
      </H3>
      <div className="space-y-3">
        {config.faqs.map((faq, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-xl border border-[#26262b] bg-[#16161a] p-3 sm:grid-cols-[1fr_1.4fr_auto]"
          >
            <TextField
              label="Question"
              required
              value={faq.question}
              onChange={(v) =>
                update("faqs", patchAt(config.faqs, index, { question: v }))
              }
              {...bind(`faqs.${index}.question`)}
            />
            <TextField
              label="Answer"
              required
              value={faq.answer}
              onChange={(v) =>
                update("faqs", patchAt(config.faqs, index, { answer: v }))
              }
              {...bind(`faqs.${index}.answer`)}
            />
            <Button
              variant="danger"
              size="icon"
              className="self-start sm:mt-6"
              onClick={() => remove("faqs", index)}
              aria-label={`Remove FAQ ${index + 1}`}
            >
              <Icon name="x" />
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => add("faqs", { question: "", answer: "" })}
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
          Add FAQ
        </Button>
        <span className="text-[11px] text-zinc-600">or start from:</span>
        {suggestions
          .filter((q) => !config.faqs.some((f) => f.question === q))
          .map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => add("faqs", { question: q, answer: "" })}
              className="rounded-full border border-[#26262b] px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-emerald-500/50 hover:text-emerald-300"
            >
              + {q}
            </button>
          ))}
      </div>
      {!config.knowledge.trim() &&
        !config.products.length &&
        !config.faqs.length && (
          <p className="mt-5 text-xs text-amber-300/90">
            Tip: with no knowledge added, the AI will have very little to answer
            from.
          </p>
        )}
    </Card>
  );
}

function BehaviorStep({ config, update, bind }) {
  const toggleTool = (name, enabled) =>
    update(
      "tools",
      enabled
        ? config.tools.map((tool) =>
          tool.name === name ? { ...tool, enabled: false } : tool,
        )
        : config.tools.some((tool) => tool.name === name)
          ? config.tools.map((tool) =>
            tool.name === name ? { ...tool, enabled: true } : tool,
          )
          : [...config.tools, { name, enabled: true }],
    );
  const generate = () =>
    update(
      "systemPrompt",
      buildPrompt(
        config,
        config.tools.filter((t) => t.enabled !== false).map((t) => t.name),
      ),
    );
  return (
    <Card
      title="Agent behavior"
      subtitle="Set the tone, fallback behavior, handoff, and tools."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-300">Tone</p>
          <Segmented
            value={config.tone}
            onChange={(v) => update("tone", v)}
            options={[
              ["friendly", "Friendly"],
              ["professional", "Professional"],
              ["casual", "Casual"],
              ["formal", "Formal"],
            ]}
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-300">
            Reply length
          </p>
          <Segmented
            value={config.responseLength}
            onChange={(v) => update("responseLength", v)}
            options={[
              ["concise", "Short"],
              ["balanced", "Balanced"],
              ["detailed", "Detailed"],
            ]}
          />
        </div>
        <TextArea
          className="sm:col-span-2"
          label="Initial greeting"
          rows={2}
          max={1024}
          value={config.initialMessage}
          onChange={(v) => update("initialMessage", v)}
          placeholder="Hi! 👋 Welcome to… How can I help?"
          {...bind("initialMessage")}
        />
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-300">
              System instructions
            </span>
            <Button size="sm" variant="accent" onClick={generate}>
              <Icon name="sparkle" className="h-3.5 w-3.5" />
              Generate from my details
            </Button>
          </div>
          <TextArea
            rows={7}
            max={8000}
            value={config.systemPrompt}
            onChange={(v) => update("systemPrompt", v)}
            placeholder="The assistant is helpful, concise and uses only confirmed business information. (Leave blank to auto-generate on save.)"
            hint="If left blank, a prompt is generated from your profile and knowledge when you save."
            {...bind("systemPrompt")}
          />
        </div>
        <TextField
          label="Handoff keywords"
          value={config.handoffKeywords}
          onChange={(v) => update("handoffKeywords", v)}
          hint="Comma separated, e.g. human, agent, complaint"
          {...bind("handoffKeywords")}
        />
        <TextField
          label="Handoff message"
          value={config.handoffMessage}
          onChange={(v) => update("handoffMessage", v)}
          {...bind("handoffMessage")}
        />
        <SelectField
          label="When no rule matches"
          value={config.fallbackMode}
          onChange={(v) => update("fallbackMode", v)}
          options={[
            ["ai", "AI answers (uses LLM)"],
            ["fixed", "Send a fixed message"],
          ]}
        />
        <TextField
          label="Fallback message"
          required={config.fallbackMode === "fixed"}
          value={config.fallbackMessage}
          onChange={(v) => update("fallbackMessage", v)}
          {...bind("fallbackMessage")}
        />
      </div>
      <H3>Custom tools</H3>
      <CustomToolsEditor
        tools={config.tools}
        onChange={(tools) => update("tools", tools)}
      />
      <H3>Enabled tools</H3>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {toolOptions.map(([name, label]) => {
          const enabled = config.tools.some(
            (tool) => tool.name === name && tool.enabled !== false,
          );
          return (
            <button
              key={name}
              type="button"
              role="checkbox"
              aria-checked={enabled}
              onClick={() => toggleTool(name, enabled)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition",
                enabled
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                  : "border-[#26262b] bg-[#16161a] text-zinc-300 hover:border-[#3a3a42]",
              )}
            >
              <span
                className={cn(
                  "grid h-4 w-4 shrink-0 place-items-center rounded border",
                  enabled
                    ? "border-emerald-500 bg-emerald-500 text-black"
                    : "border-zinc-600",
                )}
              >
                {enabled && <Icon name="check" className="h-3 w-3" />}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function HoursStep({ config, update, bind, touch }) {
  const copyFirst = () => {
    const source = config.hours.find((h) => h.enabled);
    if (source)
      update(
        "hours",
        config.hours.map((h) =>
          h.enabled
            ? { ...h, openTime: source.openTime, closeTime: source.closeTime }
            : h,
        ),
      );
  };
  const preset = (days, open, close) =>
    update(
      "hours",
      config.hours.map((h) => ({
        ...h,
        enabled: days.includes(h.dayOfWeek),
        openTime: open,
        closeTime: close,
      })),
    );
  const hoursError = bind("hours").error;
  return (
    <Card
      title="Business hours"
      subtitle="Control away messages and after-hours behavior."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">Quick presets:</span>
        {[
          ["Mon–Fri · 9–6", [0, 1, 2, 3, 4], "09:00", "18:00"],
          ["Mon–Sat · 10–8", [0, 1, 2, 3, 4, 5], "10:00", "20:00"],
          ["Every day · 9–9", [0, 1, 2, 3, 4, 5, 6], "09:00", "21:00"],
        ].map(([label, days, o, c]) => (
          <button
            key={label}
            type="button"
            onClick={() => preset(days, o, c)}
            className="rounded-full border border-[#26262b] px-3 py-1 text-xs text-zinc-300 transition hover:border-emerald-500/50 hover:text-emerald-300"
          >
            {label}
          </button>
        ))}
      </div>
      {hoursError && <Alert tone="error">{hoursError}</Alert>}
      <div className="space-y-2">
        {config.hours.map((hour, index) => {
          const closeError = bind(`hours.${index}.closeTime`).error;
          const openError = bind(`hours.${index}.openTime`).error;
          return (
            <div key={hour.dayOfWeek}>
              <div className="grid grid-cols-[100px_44px_1fr_1fr] items-center gap-3 sm:grid-cols-[120px_60px_160px_160px]">
                <b
                  className={cn(
                    "font-medium",
                    hour.enabled ? "text-zinc-100" : "text-zinc-500",
                  )}
                >
                  {dayNames[index]}
                </b>
                <Toggle
                  ariaLabel={`${dayNames[index]} open`}
                  checked={hour.enabled}
                  onChange={(v) =>
                    update("hours", patchAt(config.hours, index, { enabled: v }))
                  }
                />
                <input
                  type="time"
                  aria-label={`${dayNames[index]} opens`}
                  disabled={!hour.enabled}
                  value={hour.openTime}
                  onBlur={() => touch(`hours.${index}.openTime`)}
                  onChange={(e) =>
                    update(
                      "hours",
                      patchAt(config.hours, index, { openTime: e.target.value }),
                    )
                  }
                  className={cn(inputBase, inputTone(openError))}
                />
                <input
                  type="time"
                  aria-label={`${dayNames[index]} closes`}
                  disabled={!hour.enabled}
                  value={hour.closeTime}
                  onBlur={() => touch(`hours.${index}.closeTime`)}
                  onChange={(e) =>
                    update(
                      "hours",
                      patchAt(config.hours, index, { closeTime: e.target.value }),
                    )
                  }
                  className={cn(inputBase, inputTone(closeError))}
                />
              </div>
              {(openError || closeError) && (
                <p
                  role="alert"
                  className="ml-0 mt-1 text-xs text-red-400 sm:ml-[180px]"
                >
                  {openError || closeError}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <Button size="sm" className="mt-3" onClick={copyFirst}>
        Copy first open day’s times to all open days
      </Button>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <TextArea
          className="sm:col-span-2"
          label="Away message"
          required={config.afterHoursMode !== "none"}
          rows={2}
          max={1024}
          value={config.awayMessage}
          onChange={(v) => update("awayMessage", v)}
          {...bind("awayMessage")}
        />
        <SelectField
          label="Outside-hours behavior"
          value={config.afterHoursMode}
          onChange={(v) => update("afterHoursMode", v)}
          options={[
            ["away", "Away message only"],
            ["both", "Away + auto-replies / AI"],
            ["none", "Stay silent"],
          ]}
        />
        <SelectField
          label="Typing delay"
          value={config.typingDelay}
          onChange={(v) => update("typingDelay", v)}
          options={[
            ["0", "None"],
            ["1", "1 second"],
            ["2", "2 seconds"],
          ]}
        />
      </div>
      <p className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
        <b>24-hour rule:</b> after a customer’s last message you can reply
        freely for 24 hours. After that WhatsApp only allows pre-approved
        template messages.
      </p>
    </Card>
  );
}

/* ───────────────────────── auto-reply step ───────────────────────── */

function RulesStep({
  config,
  update,
  bind,
  updateRule,
  updateRuleResponse,
  testRule,
}) {
  const [collapsed, setCollapsed] = useState(() =>
    config.rules.length > 1 ? config.rules.map((_, i) => i) : [],
  );
  const toggleCollapsed = (i) =>
    setCollapsed((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));

  // IDs already created in other rules, offered as suggestions for button / list triggers
  const knownIds = useMemo(() => {
    const out = { button_press: [], list_row: [] };
    const seen = { button_press: new Set(), list_row: new Set() };
    const add = (kind, id, title, from) => {
      if (!id || seen[kind].has(id)) return;
      seen[kind].add(id);
      out[kind].push({ id, label: `${title || id} (from ${from})` });
    };
    config.rules.forEach((rule, i) => {
      const from = rule.name || `Rule ${i + 1}`;
      const rc = rule.responseConfig || {};
      (rc.buttons || []).forEach((x) => add("button_press", x.id, x.title, from));
      (rc.sections || []).forEach((sec) =>
        (sec.rows || []).forEach((x) => add("list_row", x.id, x.title, from)),
      );
    });
    return out;
  }, [config.rules]);

  // Auto-generate button / row IDs from the rule name (unless the user typed their own)
  useEffect(() => {
    let changed = false;
    const fix = (items, kind, rule, ri) =>
      items.map((it, k) => {
        if (it.id && !AUTO_ID.test(it.id)) return it;
        const id = autoId(rule.name, kind, k + 1, ri);
        if (it.id === id) return it;
        changed = true;
        return { ...it, id };
      });
    const next = config.rules.map((rule, ri) => {
      const rc = rule.responseConfig || {};
      let nrc = rc;
      if (Array.isArray(rc.buttons) && rc.buttons.length)
        nrc = { ...nrc, buttons: fix(rc.buttons, "btn", rule, ri) };
      const sec = rc.sections?.[0];
      if (sec?.rows?.length)
        nrc = {
          ...nrc,
          sections: [
            { ...sec, rows: fix(sec.rows, "row", rule, ri) },
            ...rc.sections.slice(1),
          ],
        };
      return nrc === rc ? rule : { ...rule, responseConfig: nrc };
    });
    if (changed) update("rules", next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.rules]);

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= config.rules.length) return;
    setCollapsed((c) =>
      c.map((x) => (x === index ? target : x === target ? index : x)),
    );
    const next = [...config.rules];
    [next[index], next[target]] = [next[target], next[index]];
    update("rules", next);
  };
  const duplicate = (index) => {
    const src = config.rules[index];
    const rc = JSON.parse(JSON.stringify(src.responseConfig || {}));
    (rc.buttons || []).forEach((b) => (b.id = ""));
    (rc.sections || []).forEach((s) => (s.rows || []).forEach((r) => (r.id = "")));
    const copy = {
      ...src,
      id: undefined,
      name: `${src.name || "Rule"} copy`,
      responseConfig: rc,
    };
    setCollapsed((c) => c.map((x) => (x > index ? x + 1 : x)));
    const next = [...config.rules];
    next.splice(index + 1, 0, copy);
    update("rules", next);
  };
  const remove = (index) => {
    setCollapsed((c) =>
      c.filter((x) => x !== index).map((x) => (x > index ? x - 1 : x)),
    );
    update(
      "rules",
      config.rules.filter((_, i) => i !== index),
    );
  };
  const addRule = (template) =>
    update("rules", [
      ...config.rules,
      {
        ...blankRule(),
        ...(template || {}),
        priority: config.rules.length,
      },
    ]);

  const activeCount = config.rules.filter((r) => r.enabled).length;
  const used = new Set(config.rules.map((r) => r.name));

  return (
    <Card
      title="Auto-replies"
      subtitle="Rules run before the AI and save LLM usage. The first matching rule wins — top to bottom."
      badge={
        <Chip className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
          {activeCount} active / {config.rules.length}
        </Chip>
      }
    >
      {/* pipeline */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
        {[
          ["Customer message", "border-[#26262b] text-zinc-400", "chat"],
          ["Away / handoff words", "border-amber-500/40 text-amber-300", "alert"],
          ["Auto-reply rules", "border-emerald-500/60 bg-emerald-500/10 text-emerald-300", "bolt"],
          ["AI / fixed fallback", "border-sky-500/40 text-sky-300", "sparkle"],
        ].map(([label, tone, icon], i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border bg-[#16161a] px-3 py-2",
                tone,
              )}
            >
              <Icon name={icon} className="h-3.5 w-3.5" />
              {label}
            </span>
            {i < 3 && <Icon name="arrowRight" className="h-3.5 w-3.5 text-zinc-600" />}
          </div>
        ))}
      </div>

      {/* trigger colour legend */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {triggerTypes.map((t) => (
          <Chip key={t} className={triggerMeta[t].chip}>
            <Icon name={triggerMeta[t].icon} className="h-3 w-3" />
            {triggerMeta[t].label}
          </Chip>
        ))}
      </div>

      {/* quick templates */}
      <div className="mb-5 rounded-xl border border-dashed border-[#2d2d34] bg-[#0f0f12] p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
          <Icon name="sparkle" className="h-3.5 w-3.5 text-emerald-400" />
          Start from a template
        </p>
        <div className="flex flex-wrap gap-2">
          {ruleTemplates.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => addRule(JSON.parse(JSON.stringify(t.rule)))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-[#26262b] bg-[#16161a] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-emerald-500/50 hover:text-emerald-300",
                used.has(t.rule.name) && "opacity-60",
              )}
            >
              <span>{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!config.rules.length && (
        <div className="rounded-xl border border-dashed border-[#26262b] p-10 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-400">
            <Icon name="bolt" className="h-6 w-6" />
          </span>
          <p className="font-medium text-zinc-200">No rules yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            Pick a template above or create a rule from scratch.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {config.rules.map((rule, index) => {
          const p = `rules.${index}`;
          const r = rule.responseConfig || {};
          const b = (path) => bind(`${p}.${path}`);
          const meta = triggerMeta[rule.triggerType] || triggerMeta.keyword;
          const rmeta = responseMeta[rule.responseType] || responseMeta.text;
          const hasError = Boolean(
            b("name").error ||
            b("triggerValue").error ||
            b("triggerType").error,
          );
          const isCollapsed = collapsed.includes(index) && !hasError;
          const preview = responseText(r);
          const needsValue = !["always", "first_message"].includes(
            rule.triggerType,
          );
          const changeType = (type) =>
            updateRule(index, {
              responseType: type,
              responseConfig: {
                ...defaultResponse(type, responseText(rule.responseConfig)),
                ...(r.attachment ? { attachment: r.attachment } : {}),
              },
            });
          return (
            <div
              key={index}
              className={cn(
                "relative overflow-hidden rounded-xl border bg-[#15151a] transition",
                hasError ? "border-red-500/50" : "border-[#26262b]",
                !rule.enabled && "opacity-60",
              )}
            >
              <span
                className={cn("absolute inset-y-0 left-0 w-1", meta.bar)}
                aria-hidden
              />
              {/* header row */}
              <div className="flex flex-wrap items-center gap-2 py-3 pl-5 pr-3">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(index)}
                  aria-expanded={!isCollapsed}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span
                    className={cn(
                      "inline-flex text-zinc-500 transition-transform",
                      isCollapsed && "-rotate-90",
                    )}
                  >
                    <Icon name="down" />
                  </span>
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#0c0c0f] text-[11px] font-semibold tabular-nums text-zinc-400">
                    {index + 1}
                  </span>
                  <span className="truncate text-sm font-semibold text-zinc-100">
                    {rule.name || "Untitled rule"}
                  </span>
                  <Chip className={cn("hidden sm:inline-flex", meta.chip)}>
                    <Icon name={meta.icon} className="h-3 w-3" />
                    {meta.label}
                    {needsValue && rule.triggerValue
                      ? `: ${rule.triggerValue}`
                      : ""}
                  </Chip>
                  <Chip className="hidden border-[#2d2d34] text-zinc-400 md:inline-flex">
                    <Icon name={rmeta.icon} className="h-3 w-3" />
                    {rmeta.label}
                  </Chip>
                </button>
                <div className="flex items-center gap-1">
                  <Toggle
                    ariaLabel={`Rule ${index + 1} enabled`}
                    checked={rule.enabled}
                    onChange={(v) => updateRule(index, { enabled: v })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => testRule(rule)}
                    aria-label="Try this rule in the test panel"
                    title="Try this rule"
                  >
                    <Icon name="eye" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    <Icon name="up" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => move(index, 1)}
                    disabled={index === config.rules.length - 1}
                    aria-label="Move down"
                  >
                    <Icon name="down" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => duplicate(index)}
                    aria-label="Duplicate rule"
                    title="Duplicate"
                  >
                    <Icon name="dup" />
                  </Button>
                  <Button
                    size="icon"
                    variant="danger"
                    onClick={() => remove(index)}
                    aria-label="Remove rule"
                    title="Remove"
                  >
                    <Icon name="trash" />
                  </Button>
                </div>
              </div>

              {isCollapsed && preview && (
                <p className="truncate pb-3 pl-14 pr-4 text-xs text-zinc-500">
                  ↳ {preview}
                </p>
              )}

              {!isCollapsed && (
                <div className="grid gap-4 border-t border-[#26262b] p-4 pl-5 lg:grid-cols-2">
                  {/* WHEN */}
                  <div className="space-y-3 rounded-lg border border-[#26262b] bg-[#0f0f12] p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      <span className={cn("h-2 w-2 rounded-full", meta.bar)} />
                      When
                    </p>
                    <TextField
                      label="Rule name"
                      required
                      value={rule.name}
                      onChange={(v) => updateRule(index, { name: v })}
                      placeholder="Pricing question"
                      max={60}
                      {...b("name")}
                    />
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-zinc-300">
                        Trigger
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
                        {triggerTypes.map((t) => {
                          const m = triggerMeta[t];
                          const on = rule.triggerType === t;
                          return (
                            <button
                              key={t}
                              type="button"
                              title={m.desc}
                              onClick={() => updateRule(index, { triggerType: t })}
                              aria-pressed={on}
                              className={cn(
                                "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs transition",
                                on
                                  ? m.tile
                                  : "border-[#26262b] text-zinc-400 hover:border-[#3a3a42] hover:text-zinc-200",
                              )}
                            >
                              <Icon name={m.icon} className="h-3.5 w-3.5 shrink-0" />
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] text-zinc-500">
                        {meta.desc}
                      </p>
                      {b("triggerType").error && (
                        <p role="alert" className="mt-1 text-xs text-red-400">
                          {b("triggerType").error}
                        </p>
                      )}
                    </div>
                    {needsValue && (
                      <>
                        <TextField
                          label={
                            rule.triggerType === "keyword"
                              ? "Keyword / phrase"
                              : "Trigger ID"
                          }
                          required
                          value={rule.triggerValue}
                          onChange={(v) => updateRule(index, { triggerValue: v })}
                          placeholder={
                            rule.triggerType === "keyword" ? "price" : "our_services"
                          }
                          list={
                            knownIds[rule.triggerType]?.length
                              ? `known-ids-${rule.triggerType}-${index}`
                              : undefined
                          }
                          hint={
                            knownIds[rule.triggerType]?.length
                              ? "Click the field to pick from IDs you already created."
                              : undefined
                          }
                          {...b("triggerValue")}
                        />
                        {knownIds[rule.triggerType]?.length > 0 && (
                          <datalist id={`known-ids-${rule.triggerType}-${index}`}>
                            {knownIds[rule.triggerType].map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </datalist>
                        )}
                      </>
                    )}
                    {rule.triggerType === "keyword" && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-zinc-300">
                          Match mode
                        </p>
                        <Segmented
                          value={rule.matchMode || "contains"}
                          onChange={(v) => updateRule(index, { matchMode: v })}
                          options={[
                            ["contains", "Contains"],
                            ["exact", "Exact"],
                            ["starts_with", "Starts with"],
                          ]}
                        />
                      </div>
                    )}
                  </div>

                  {/* THEN */}
                  <div className="space-y-3 rounded-lg border border-[#26262b] bg-[#0f0f12] p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Then reply with
                    </p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {responseTypes.map((t) => {
                        const on = rule.responseType === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => changeType(t)}
                            aria-pressed={on}
                            className={cn(
                              "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] transition",
                              on
                                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                                : "border-[#26262b] text-zinc-400 hover:border-[#3a3a42] hover:text-zinc-200",
                            )}
                          >
                            <Icon name={responseMeta[t].icon} />
                            {responseMeta[t].label}
                          </button>
                        );
                      })}
                    </div>
                    <ResponseEditor
                      rule={rule}
                      r={r}
                      b={b}
                      index={index}
                      updateRuleResponse={updateRuleResponse}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => addRule()}>
          <Icon name="plus" />
          New auto-reply
        </Button>
        {!!config.rules.length && (
          <span className="text-xs text-zinc-500">
            Tip: use the <Icon name="eye" className="inline h-3.5 w-3.5" /> icon
            on a rule to try it live in the Test panel.
          </span>
        )}
      </div>
    </Card>
  );
}

function ResponseEditor({ rule, r, b, index, updateRuleResponse }) {
  const buttons = r.buttons || [];
  const rows = r.sections?.[0]?.rows || [];
  const setRows = (next) =>
    updateRuleResponse(index, {
      sections: [{ title: r.sections?.[0]?.title || "Options", rows: next }],
    });
  return (
    <div className="space-y-3">
      {rule.responseType === "text" && (
        <TextArea
          label="Reply text"
          required
          rows={4}
          max={1024}
          value={r.text}
          onChange={(v) => updateRuleResponse(index, { text: v })}
          placeholder="Automatic reply"
          {...b("body")}
        />
      )}

      {rule.responseType === "button" && (
        <>
          <TextArea
            label="Reply text"
            required
            rows={2}
            max={1024}
            value={r.body}
            onChange={(v) => updateRuleResponse(index, { body: v })}
            {...b("body")}
          />
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-300">
              Buttons ({buttons.length}/3)
            </p>
            <div className="space-y-2">
              {buttons.map((button, j) => (
                <div
                  key={j}
                  className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-2"
                >
                  <div className="space-y-1.5">
                    <TextField
                      aria-label={`Button ${j + 1} title`}
                      placeholder="Button title"
                      max={20}
                      value={button.title}
                      onChange={(v) =>
                        updateRuleResponse(index, {
                          buttons: patchAt(buttons, j, { title: v }),
                        })
                      }
                      {...b(`buttons.${j}.title`)}
                    />
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <span>ID</span>
                      <input
                        aria-label={`Button ${j + 1} ID`}
                        value={button.id || ""}
                        onChange={(e) =>
                          updateRuleResponse(index, {
                            buttons: patchAt(buttons, j, { id: e.target.value }),
                          })
                        }
                        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-violet-300 outline-none hover:border-[#26262b] focus:border-violet-500"
                      />
                    </div>
                    {b(`buttons.${j}.id`).error && (
                      <p role="alert" className="text-xs text-red-400">
                        {b(`buttons.${j}.id`).error}
                      </p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="danger"
                    onClick={() =>
                      updateRuleResponse(index, {
                        buttons: buttons.filter((_, k) => k !== j),
                      })
                    }
                    aria-label="Remove button"
                  >
                    <Icon name="x" />
                  </Button>
                </div>
              ))}
            </div>
            {b("buttons").error && (
              <p role="alert" className="mt-1 text-xs text-red-400">
                {b("buttons").error}
              </p>
            )}
            {buttons.length < 3 && (
              <Button
                size="sm"
                className="mt-2"
                onClick={() =>
                  updateRuleResponse(index, {
                    buttons: [...buttons, { id: "", title: "" }],
                  })
                }
              >
                <Icon name="plus" className="h-3.5 w-3.5" />
                Add button
              </Button>
            )}
          </div>
        </>
      )}

      {rule.responseType === "list" && (
        <>
          <TextArea
            label="Message shown above the list"
            required
            rows={2}
            max={1024}
            value={r.body}
            onChange={(v) => updateRuleResponse(index, { body: v })}
            {...b("body")}
          />
          <TextField
            label="Menu button label"
            required
            max={20}
            value={r.buttonLabel}
            onChange={(v) => updateRuleResponse(index, { buttonLabel: v })}
            placeholder="View options"
            {...b("buttonLabel")}
          />
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-300">
              List options ({rows.length}/10)
            </p>
            <div className="space-y-2">
              {rows.map((row, j) => {
                const q = `sections.0.rows.${j}`;
                const setRow = (patch) => setRows(patchAt(rows, j, patch));
                return (
                  <div
                    key={j}
                    className="space-y-1.5 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-2"
                  >
                    <div className="grid grid-cols-[1fr_auto] items-start gap-2">
                      <TextField
                        aria-label={`Row ${j + 1} title`}
                        placeholder="Row title"
                        max={24}
                        value={row.title}
                        onChange={(v) => setRow({ title: v })}
                        {...b(`${q}.title`)}
                      />
                      <Button
                        size="icon"
                        variant="danger"
                        onClick={() => setRows(rows.filter((_, k) => k !== j))}
                        aria-label="Remove row"
                      >
                        <Icon name="x" />
                      </Button>
                    </div>
                    <TextField
                      aria-label="Row description"
                      placeholder="Row description (optional)"
                      max={72}
                      value={row.description}
                      onChange={(v) => setRow({ description: v })}
                    />
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <span>ID</span>
                      <input
                        aria-label={`Row ${j + 1} ID`}
                        value={row.id || ""}
                        onChange={(e) => setRow({ id: e.target.value })}
                        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-fuchsia-300 outline-none hover:border-[#26262b] focus:border-fuchsia-500"
                      />
                    </div>
                    {b(`${q}.id`).error && (
                      <p role="alert" className="text-xs text-red-400">
                        {b(`${q}.id`).error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {b("rows").error && (
              <p role="alert" className="mt-1 text-xs text-red-400">
                {b("rows").error}
              </p>
            )}
            {rows.length < 10 && (
              <Button
                size="sm"
                className="mt-2"
                onClick={() => setRows([...rows, { id: "", title: "" }])}
              >
                <Icon name="plus" className="h-3.5 w-3.5" />
                Add option
              </Button>
            )}
          </div>
        </>
      )}

      {rule.responseType === "media" && (
        <div className="grid gap-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-300">
              Media type
            </p>
            <Segmented
              value={r.mediaType || "image"}
              onChange={(v) => updateRuleResponse(index, { mediaType: v })}
              options={[
                ["image", "Image"],
                ["video", "Video"],
                ["document", "Document"],
              ]}
            />
          </div>
          <TextField
            label="HTTPS media URL"
            required
            value={r.url}
            onChange={(v) => updateRuleResponse(index, { url: v })}
            placeholder="https://…"
            {...b("url")}
          />
          <TextField
            label="Caption"
            max={1024}
            value={r.caption}
            onChange={(v) => updateRuleResponse(index, { caption: v })}
            {...b("caption")}
          />
        </div>
      )}

      {rule.responseType === "cta_url" && (
        <>
          <TextArea
            label="Reply text"
            required
            rows={2}
            max={1024}
            value={r.body}
            onChange={(v) => updateRuleResponse(index, { body: v })}
            {...b("body")}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Button label"
              required
              max={20}
              value={r.displayText}
              onChange={(v) => updateRuleResponse(index, { displayText: v })}
              placeholder="Visit website"
              {...b("displayText")}
            />
            <TextField
              label="Link (https)"
              required
              value={r.url}
              onChange={(v) => updateRuleResponse(index, { url: v })}
              placeholder="https://…"
              {...b("url")}
            />
          </div>
        </>
      )}

      {rule.responseType !== "media" && (
        <div className="grid gap-3 border-t border-dashed border-[#26262b] pt-3">
          <SelectField
            label="Attach image / link (optional)"
            value={r.attachment?.kind || "none"}
            onChange={(v) =>
              updateRuleResponse(index, {
                attachment: { ...r.attachment, kind: v },
              })
            }
            options={[
              ["none", "No attachment"],
              ["image", "Image"],
              ["video", "Video"],
              ["document", "Document (PDF)"],
              ["link", "Link"],
            ]}
          />
          {r.attachment?.kind && r.attachment.kind !== "none" && (
            <TextField
              label={
                r.attachment.kind === "link" ? "Link (https://)" : "HTTPS media URL"
              }
              value={r.attachment.url}
              onChange={(v) =>
                updateRuleResponse(index, {
                  attachment: { ...r.attachment, url: v },
                })
              }
              placeholder="https://…"
              {...b("attachmentUrl")}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── WhatsApp connection (2nd-to-last step) ───────────────────────── */

const metaFields = [
  ["phoneNumber", "Display phone number", "text", "+1 555 010 0000"],
  ["phoneNumberId", "Phone Number ID", "text", "104829371650283"],
  ["businessId", "WhatsApp Business Account ID", "text", "219384756102938"],
  ["appSecret", "App secret (optional)", "password", "Used to verify webhook signatures"],
];

function ChannelStep({ config, updateMeta, bind, touch, hasConnection, currentAutomation }) {
  const [copied, setCopied] = useState(false);
  const [verifyState, setVerifyState] = useState(() => {
    if (hasConnection && config.meta?.phoneNumber) {
      return {
        status: "ok",
        displayPhoneNumber: config.meta.phoneNumber,
        verifiedName: config.businessName || null,
      };
    }
    return { status: "idle" };
  });
  const webhook = `${SERVER_URL}/api/whatsapp-automation/webhook`;
  const { phoneNumberId, businessId, apiToken } = config.meta;

  useEffect(() => {
    if (hasConnection && config.meta?.phoneNumber && apiToken === "***") {
      setVerifyState({
        status: "ok",
        displayPhoneNumber: config.meta.phoneNumber,
        verifiedName: config.businessName || null,
      });
    } else if (apiToken !== "***") {
      setVerifyState({ status: "idle" });
    }
  }, [phoneNumberId, businessId, apiToken, hasConnection, config.meta?.phoneNumber, config.businessName]);

  const verify = async () => {
    if (!phoneNumberId.trim() || !apiToken.trim()) {
      setVerifyState({
        status: "error",
        error: "Enter the Phone Number ID and access token first.",
      });
      return;
    }
    if (apiToken.trim() === "***" && hasConnection) {
      setVerifyState({
        status: "ok",
        displayPhoneNumber: config.meta.phoneNumber || null,
        verifiedName: config.businessName || null,
      });
      return;
    }
    setVerifyState({ status: "loading" });
    try {
      const { data } = await axios.post(
        `${SERVER_URL}/api/whatsapp-automation/verify-cloud`,
        {
          phoneNumberId: phoneNumberId.trim(),
          businessId: businessId.trim(),
          apiToken: apiToken.trim(),
        },
      );
      setVerifyState(
        data.ok
          ? { status: "ok", ...data }
          : { status: "error", error: data.error || "Verification failed" },
      );
    } catch (err) {
      setVerifyState({
        status: "error",
        error: err.response?.data?.error || err.message,
      });
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(webhook);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  const instructions = [
    <>Open <b>developers.facebook.com → your app → WhatsApp → Configuration</b>.</>,
    <>Paste the <b>Callback URL</b> and <b>Verify token</b>, then click Verify and save.</>,
    <>Under Webhook fields, subscribe to <b>messages</b>.</>,
    <>Copy Phone Number ID and WABA ID from <b>API Setup</b>; paste them below.</>,
    <>Click <b>Verify connection</b> at the bottom.</>,
  ];
  return (
    <Card
      title={hasConnection ? "WhatsApp Connection" : "Connect WhatsApp"}
      subtitle={
        hasConnection
          ? "Your WhatsApp phone number is connected via Meta Cloud API. Review or update your credentials below."
          : "Last setup step — link your Meta Cloud API number. Everything else is already configured."
      }
      badge={
        <Chip
          className={
            hasConnection
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-medium"
              : "border-zinc-600/40 bg-zinc-500/10 text-zinc-400"
          }
        >
          {hasConnection
            ? `● Connected · ${config.meta.phoneNumber || "Saved"}`
            : "Not connected yet"}
        </Chip>
      }
    >
      {hasConnection ? (
        <div className="space-y-5">
          {/* Active Connected Banner */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 font-bold">
                  <Icon name="chat" className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-zinc-100 font-mono tracking-wide">
                      {config.meta.phoneNumber || "Connected WhatsApp"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Active &amp; Connected
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Meta Cloud API · {config.businessName || "Verified Assistant"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={verify}
                  disabled={verifyState.status === "loading"}
                >
                  <Icon name="sparkle" />
                  {verifyState.status === "loading" ? "Verifying…" : "Re-verify connection"}
                </Button>
              </div>
            </div>
            {verifyState.status === "ok" && (
              <p className="mt-2.5 text-xs text-emerald-400">
                ✓ Connection verified and active on Meta Cloud API.
              </p>
            )}
            {verifyState.status === "error" && (
              <p role="alert" className="mt-2.5 text-xs text-red-300">
                {verifyState.error}
              </p>
            )}
          </div>

          {/* Connected Credentials Fields */}
          <div className="grid gap-5 md:grid-cols-2">
            {/* Column 1: Phone & Meta IDs */}
            <div className="space-y-4 rounded-xl border border-[#26262b] bg-[#16161a] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Phone &amp; Meta Account IDs
              </p>
              <TextField
                label="Display phone number"
                required
                value={config.meta.phoneNumber}
                onChange={(v) => updateMeta("phoneNumber", v)}
                placeholder="+1 555 010 0000"
                {...bind("meta.phoneNumber")}
              />
              <TextField
                label="Phone Number ID"
                required
                value={config.meta.phoneNumberId}
                onChange={(v) => updateMeta("phoneNumberId", v)}
                placeholder="104829371650283"
                {...bind("meta.phoneNumberId")}
              />
              <TextField
                label="WhatsApp Business Account ID"
                required
                value={config.meta.businessId}
                onChange={(v) => updateMeta("businessId", v)}
                placeholder="219384756102938"
                {...bind("meta.businessId")}
              />
            </div>

            {/* Column 2: Security & Tokens */}
            <div className="space-y-4 rounded-xl border border-[#26262b] bg-[#16161a] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Access Token &amp; App Secret
              </p>
              <TextField
                label="Permanent access token"
                required
                type="password"
                placeholder="EAAG…"
                hint="Permanent access token from Meta System User."
                autoComplete="off"
                value={config.meta.apiToken}
                onChange={(v) => updateMeta("apiToken", v)}
                {...bind("meta.apiToken")}
              />
              <TextField
                label="App secret (optional)"
                type="password"
                placeholder="32 hex characters"
                hint="Used to verify incoming webhook signatures."
                autoComplete="off"
                value={config.meta.appSecret}
                onChange={(v) => updateMeta("appSecret", v)}
                {...bind("meta.appSecret")}
              />
            </div>
          </div>

          {/* Webhook Configuration Strip */}
          <div className="rounded-xl border border-[#26262b] bg-[#16161a] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Webhook Configuration
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-300">
                  Webhook Callback URL
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={webhook}
                    onFocus={(e) => e.target.select()}
                    className={cn(inputBase, inputTone(false), "font-mono text-xs")}
                    aria-label="Webhook callback URL"
                  />
                  <Button onClick={copy}>
                    <Icon name="copy" />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <div>
                <TextField
                  label="Webhook verify token"
                  required
                  hint="Must match the verify token configured in Meta App Webhooks."
                  autoComplete="off"
                  value={config.meta.verifyToken}
                  onChange={(v) => updateMeta("verifyToken", v)}
                  {...bind("meta.verifyToken")}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* First-time connection onboarding layout with instructions */
        <>
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-zinc-300">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
              <Icon name="check" className="h-3.5 w-3.5" />
            </span>
            <div>
              <b className="text-zinc-100">Meta Cloud API</b> · official, stable,
              supports buttons, lists &amp; templates.
              <p className="mt-1 text-xs text-zinc-400">
                You need a Meta Business account, a Meta developer app with the
                WhatsApp product, and a phone number that is <u>not</u> already on
                the WhatsApp mobile app.
              </p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            {/* left: webhook + steps */}
            <div className="space-y-4">
              <div className="rounded-xl border border-[#26262b] bg-[#16161a] p-4">
                <p className="mb-2 text-xs font-medium text-zinc-300">
                  1 · Webhook callback URL
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={webhook}
                    onFocus={(e) => e.target.select()}
                    className={cn(inputBase, inputTone(false), "font-mono text-xs")}
                    aria-label="Webhook callback URL"
                  />
                  <Button onClick={copy}>
                    <Icon name="copy" />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="mt-4">
                  <TextField
                    label="2 · Webhook verify token"
                    required
                    hint="Any secret string; must match what you paste in Meta."
                    autoComplete="off"
                    value={config.meta.verifyToken}
                    onChange={(v) => updateMeta("verifyToken", v)}
                    {...bind("meta.verifyToken")}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      updateMeta("verifyToken", randomToken());
                      touch("meta.verifyToken");
                    }}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                  >
                    <Icon name="sparkle" className="h-3 w-3" />
                    Generate a token
                  </button>
                </div>
              </div>
              <ol className="space-y-2 rounded-xl border border-[#26262b] bg-[#16161a] p-4 text-sm text-zinc-300">
                {instructions.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 border-b border-dashed border-[#26262b] pb-2 last:border-0 last:pb-0"
                  >
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#26262b] text-xs text-zinc-400">
                      {i + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* right: credentials */}
            <div className="space-y-4 rounded-xl border border-[#26262b] bg-[#16161a] p-4">
              <p className="text-xs font-medium text-zinc-300">3 · Credentials</p>
              {metaFields.map(([field, label, type, placeholder]) => (
                <TextField
                  key={field}
                  label={label}
                  required={field === "phoneNumberId" || field === "businessId" || field === "phoneNumber"}
                  type={type}
                  placeholder={placeholder}
                  autoComplete="off"
                  value={config.meta[field]}
                  onChange={(v) => updateMeta(field, v)}
                  {...bind(`meta.${field}`)}
                />
              ))}
              <TextField
                label="Permanent access token"
                required
                type="password"
                placeholder="EAAG…"
                hint="Create it from a System User in Meta Business Settings so it never expires."
                autoComplete="off"
                value={config.meta.apiToken}
                onChange={(v) => updateMeta("apiToken", v)}
                {...bind("meta.apiToken")}
              />
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="primary"
                  onClick={verify}
                  disabled={verifyState.status === "loading"}
                >
                  {verifyState.status === "loading"
                    ? "Verifying…"
                    : "Verify connection"}
                </Button>
                {verifyState.status === "ok" && (
                  <Chip className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                    ● Connected
                  </Chip>
                )}
                {verifyState.status === "error" && (
                  <Chip className="border-red-500/40 bg-red-500/10 text-red-300">
                    ● Failed
                  </Chip>
                )}
                {verifyState.status === "ok" && (
                  <span className="text-xs text-zinc-400">
                    {[verifyState.verifiedName, verifyState.displayPhoneNumber]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </div>
              {verifyState.status === "ok" && verifyState.warning && (
                <p className="text-xs text-amber-300">{verifyState.warning}</p>
              )}
              {verifyState.status === "error" && (
                <p role="alert" className="text-sm text-red-300">
                  {verifyState.error}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/* ───────────────────────── review ───────────────────────── */

function ReviewStep({
  config,
  hasConnection,
  connectionReady,
  issues,
  goTo,
  onActivate,
  onTest,
  saving,
  setupDone,
  isEditMode,
}) {
  const enabledTools = config.tools.filter((tool) => tool.enabled !== false).length;
  const cards = [
    [
      STEP.business,
      "Business",
      [
        config.businessName || "Not set",
        `${languages.find(([v]) => v === config.language)?.[1] || config.language} · ${config.timezone}`,
      ],
    ],
    [
      STEP.knowledge,
      "Knowledge",
      [
        `${config.products.length} products · ${config.faqs.length} FAQs`,
        config.knowledge ? "General facts added" : "No general facts",
      ],
    ],
    [
      STEP.behavior,
      "Behavior",
      [
        `${enabledTools} tools · tone: ${config.tone}`,
        `Fallback: ${config.fallbackMode === "ai" ? "AI" : "fixed message"}`,
      ],
    ],
    [
      STEP.hours,
      "Hours",
      [
        `${config.hours.filter((h) => h.enabled).length} open days a week`,
        `After hours: ${config.afterHoursMode}`,
      ],
    ],
    [
      STEP.rules,
      "Auto-replies",
      [
        `${config.rules.filter((r) => r.enabled).length} active rules`,
        `${config.rules.length} total`,
      ],
    ],
    [
      STEP.channel,
      "WhatsApp",
      [
        "Meta Cloud API",
        hasConnection || connectionReady
          ? `Connected · ${config.meta.phoneNumber || "Configured"}`
          : "Credentials incomplete",
      ],
    ],
  ];
  return (
    <Card
      title="Review and publish"
      subtitle="Check the setup, try it in the test panel, then go live."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([target, title, lines]) => (
          <button
            key={title}
            type="button"
            onClick={() => goTo(target)}
            className="group rounded-xl border border-[#26262b] bg-[#16161a] p-4 text-left transition hover:border-emerald-500/40"
          >
            <div className="flex items-center justify-between">
              <b className="text-zinc-100">{title}</b>
              <span className="text-[11px] text-zinc-600 transition group-hover:text-emerald-400">
                Edit
              </span>
            </div>
            {lines.map((line) => (
              <p key={line} className="mt-1 text-zinc-400">
                {line}
              </p>
            ))}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <Button variant="accent" onClick={onTest}>
          <Icon name="phone" />
          Open test panel
        </Button>
      </div>
      <H3>Go-live checklist</H3>
      {issues.length ? (
        <ul className="space-y-2">
          {issues.map((issue) => (
            <li
              key={issue.text}
              className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-red-200"
            >
              <span className="flex items-center gap-2">
                <Icon name="alert" />
                {issue.text}
              </span>
              <Button size="sm" onClick={() => goTo(issue.step)}>
                Fix
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-emerald-200">
          <Icon name="check" />
          Everything looks good — you can publish this automation.
        </p>
      )}
      <Button
        variant="primary"
        className="mt-5"
        onClick={onActivate}
        disabled={saving || issues.length > 0}
      >
        <Icon name="rocket" />
        {saving
          ? "Saving…"
          : isEditMode
          ? "Update & save changes"
          : setupDone
          ? "Publish changes"
          : "Publish automation"}
      </Button>
    </Card>
  );
}

/* ───────────────────────── toggleable WhatsApp test panel ───────────────────────── */

function TestPanel({
  config,
  messages,
  typing,
  input,
  setInput,
  send,
  afterHours,
  setAfterHours,
  reset,
  onClose,
}) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);
  const name = config.businessName || "Your business";
  const quick = [
    ...new Set(
      [
        "hello",
        ...config.rules
          .filter(
            (r) =>
              r.enabled && r.triggerType === "keyword" && r.triggerValue.trim(),
          )
          .map((r) => r.triggerValue.trim()),
        splitList(config.handoffKeywords)[0],
      ].filter(Boolean),
    ),
  ].slice(0, 6);
  const bubble =
    "max-w-[85%] rounded-lg px-2.5 py-1.5 text-[13px] leading-snug text-[#e9edef] shadow-sm";
  return (
    <aside
      aria-label="WhatsApp test panel"
      className="fixed inset-y-0 right-0 z-40 flex w-[390px] max-w-[100vw] flex-col gap-3 border-l border-[#26262b] bg-[#09090b] p-3 shadow-2xl animate-[fadeIn_.2s_ease-out] xl:sticky xl:inset-y-auto xl:right-auto xl:top-[84px] xl:z-auto xl:max-h-[calc(100vh-100px)] xl:w-auto xl:self-start xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-500/15 text-sky-300">
          <Icon name="phone" className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <b className="block text-[13px]">Live test</b>
          <small className="text-[11px] text-zinc-500">
            Uses your current, unsaved settings
          </small>
        </div>
        <span className="flex-1" />
        <Button size="icon" variant="ghost" onClick={reset} aria-label="Reset chat" title="Reset chat">
          <Icon name="reset" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close test panel">
          <Icon name="x" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-[#26262b] bg-black p-2.5 shadow-2xl shadow-black/60">
        <div className="flex h-[560px] max-h-full min-h-[380px] flex-1 flex-col overflow-hidden rounded-[20px] bg-[#0b141a]">
          <div className="flex items-center gap-2.5 bg-[#202c33] px-3 py-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500 font-bold text-black">
              {name[0].toUpperCase()}
            </span>
            <div className="min-w-0">
              <b className="block truncate text-sm">{name}</b>
              <small className="text-[11px] text-[#8696a0]">
                {typing ? "typing…" : "online"}
              </small>
            </div>
          </div>
          <div
            ref={ref}
            className="flex flex-1 flex-col gap-1.5 overflow-auto p-3"
            aria-live="polite"
          >
            {config.initialMessage && (
              <div className={cn(bubble, "self-start bg-[#202c33]")}>
                {config.initialMessage}
              </div>
            )}
            {!config.initialMessage && !messages.length && (
              <div className={cn(bubble, "self-start bg-[#202c33] text-[#8696a0]")}>
                Send a message below to see how your automation responds.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  bubble,
                  m.role === "user" ? "self-end bg-[#005c4b]" : "self-start bg-[#202c33]",
                  m.muted && "italic text-[#8696a0]",
                )}
              >
                {m.media && (
                  <div className="mb-1 rounded bg-black/30 px-2 py-6 text-center text-[11px] text-[#8696a0]">
                    [{m.media.mediaType || "media"}]
                  </div>
                )}
                <span className="whitespace-pre-wrap">{m.text}</span>
                {m.listLabel && (
                  <div className="mt-1.5 flex items-center justify-center gap-1 rounded-md bg-[#2a3942] py-1.5 font-medium text-[#53bdeb]">
                    <Icon name="list" className="h-3.5 w-3.5" />
                    {m.listLabel}
                  </div>
                )}
                {m.buttons?.map((b, j) => (
                  <button
                    key={j}
                    type="button"
                    onClick={() => send(b.title, b.id)}
                    className="mt-1.5 block w-full rounded-md bg-[#2a3942] py-1.5 text-center font-medium text-[#53bdeb] transition hover:bg-[#33444e]"
                  >
                    {b.title}
                  </button>
                ))}
                {m.cta?.displayText && (
                  <div className="mt-1.5 flex items-center justify-center gap-1 rounded-md bg-[#2a3942] py-1.5 font-medium text-[#53bdeb]">
                    <Icon name="link" className="h-3.5 w-3.5" />
                    {m.cta.displayText}
                  </div>
                )}
                {m.source && (
                  <small className="mt-1 block text-[10px] text-[#53bdeb]">
                    {m.source}
                  </small>
                )}
              </div>
            ))}
            {typing && (
              <div className={cn(bubble, "flex w-14 items-center gap-1 self-start bg-[#202c33]")}>
                {[0, 1, 2].map((d) => (
                  <i
                    key={d}
                    className="h-1.5 w-1.5 rounded-full bg-[#8696a0]"
                    style={{ animation: `dot 1s ${d * 0.15}s infinite` }}
                  />
                ))}
              </div>
            )}
          </div>
          <form
            className="flex items-center gap-2 bg-[#202c33] p-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message"
              aria-label="Test message"
              className="min-w-0 flex-1 rounded-full bg-[#2a3942] px-3.5 py-2 text-[13px] text-[#e9edef] outline-none placeholder:text-[#8696a0]"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send"
              className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-black transition hover:bg-emerald-400 disabled:opacity-40"
            >
              <Icon name="send" className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => send(q)}
            className="rounded-full border border-[#26262b] bg-[#0c0c0f] px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-sky-500 hover:text-sky-300"
          >
            {q}
          </button>
        ))}
      </div>
      <Toggle
        label="Simulate after-hours"
        checked={afterHours}
        onChange={setAfterHours}
      />
    </aside>
  );
}