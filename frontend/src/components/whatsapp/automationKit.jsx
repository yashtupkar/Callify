import { useCallback, useEffect, useId, useMemo, useState } from "react";
import axios from "axios";
import { Plus, Save, X, ShieldCheck, Copy, Check, Phone, AlertCircle, Bot } from "lucide-react";
import { SERVER_URL } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";

export const WEBHOOK_URL = `${SERVER_URL}/api/whatsapp-automation/webhook`;

export const toolOptions = [
  ["crm_get_contact", "View customer profile"],
  ["crm_update_contact", "Save customer details"],
  ["crm_set_stage", "Move lead stage"],
  ["crm_update_tags", "Tag customers"],
  ["crm_add_note", "Add CRM notes"],
  ["crm_create_task", "Create follow-ups & requests"],
  ["crm_list_tasks", "List open tasks"],
  ["crm_complete_task", "Complete tasks"],
  ["crm_create_deal", "Create deals"],
  ["crm_update_deal", "Update deals"],
  ["get_current_datetime", "Current date & time"],
  ["get_business_hours", "Business hours"],
  ["search_products", "Search products"],
  ["search_faq", "Search FAQs"],
  ["request_human_handoff", "Hand off to a person"],
];

export const languages = [
  ["en-US", "English"],
  ["hi-IN", "Hindi"],
  ["mr-IN", "Marathi"],
  ["gu-IN", "Gujarati"],
  ["ta-IN", "Tamil"],
  ["es-ES", "Spanish"],
  ["ar-SA", "Arabic"],
];
export const timezones = [
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
export const triggerTypes = [
  ["keyword", "Keyword"],
  ["button_press", "Button ID"],
  ["list_row", "List row ID"],
  ["flow_reply", "Flow reply"],
  ["first_message", "First message (welcome)"],
  ["always", "Always (catch-all)"],
];
export const responseTypes = [
  ["text", "Text"],
  ["button", "Text + buttons"],
  ["list", "Text + list"],
  ["media", "Image / video / document"],
  ["cta_url", "Text + website link"],
];
export const tabs = [
  ["overview", "Overview"],
  ["rules", "Auto-replies"],
  ["settings", "Settings"],
  ["channels", "Channels"],
];

export const createResponseDraft = (type = "text") => {
  if (type === "button")
    return { _type: "button", body: "", buttons: [{ id: "", title: "" }] };
  if (type === "media")
    return { _type: "media", mediaType: "image", url: "", caption: "" };
  if (type === "cta_url")
    return { _type: "cta_url", body: "", button: { title: "", url: "" } };
  if (type === "list")
    return {
      _type: "list",
      body: "",
      buttonLabel: "View Options",
      sections: [{ title: "Options", rows: [{ id: "", title: "" }] }],
    };
  return { _type: "text", text: "" };
};

export const newRuleDraft = () => ({
  name: "",
  triggerType: "keyword",
  triggerValue: "",
  matchMode: "exact",
  responseType: "text",
  responseConfig: createResponseDraft("text"),
  enabled: true,
  priority: 0,
});
export const emptyMeta = {
  phoneNumber: "",
  phoneNumberId: "",
  apiToken: "",
  apiVersion: "v20.0",
  verifyToken: "",
  appSecret: "",
  businessId: "",
};
export const emptyNew = {
  name: "",
  businessName: "",
  language: "en-US",
  systemPrompt: "",
  initialMessage: "",
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export const cn = (...parts) => parts.filter(Boolean).join(" ");
export const blank = (value) => !String(value ?? "").trim();
export const patchAt = (list, index, patch) =>
  list.map((item, i) => (i === index ? { ...item, ...patch } : item));
export const randomToken = () =>
  `verify_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
export const apiError = (err) =>
  err?.response?.data?.error || err?.message || "Something went wrong";
export const langLabel = (code) =>
  languages.find(([v]) => v === code)?.[1] || code || "â€”";
export const providerLabel = (provider) =>
  provider === "cloud_api" ? "Meta Cloud API" : "QR linked";

export const ago = (value) => {
  if (!value) return null;
  const seconds = Math.max(
    1,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (Number.isNaN(seconds)) return null;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
};

export const toolsOf = (automation) =>
  (automation.tools || automation.promptConfig?.onboarding?.tools || []).map(
    (tool) => ({
      name: tool.name,
      enabled: tool.enabled !== false,
      description: tool.description || "",
      config: tool.config || null,
      schema: tool.schema,
    }),
  );

/** Full PUT payload built from the saved automation so partial changes never wipe other fields. */
export function payloadOf(automation, { fields = {}, tools } = {}) {
  const nextTools = tools ?? toolsOf(automation);
  return {
    name: automation.name,
    businessName: automation.businessName || "",
    systemPrompt: automation.systemPrompt || "",
    initialMessage: automation.initialMessage || "",
    language: automation.language || "en-US",
    supportedLanguages: automation.supportedLanguages?.length
      ? automation.supportedLanguages
      : [automation.language || "en-US"],
    timezone: automation.timezone || "Asia/Kolkata",
    status: automation.status || "active",
    ...fields,
    onboarding: {
      ...(automation.promptConfig?.onboarding || {}),
      capabilities: nextTools.filter((t) => t.enabled).map((t) => t.name),
      tools: nextTools,
    },
  };
}

export function parseRule(rule) {
  let responseConfig = rule.responseConfig;
  if (!responseConfig) {
    try {
      responseConfig = JSON.parse(rule.response);
    } catch {
      responseConfig = createResponseDraft(rule.responseType || "text");
      if (rule.response) responseConfig.text = rule.response;
    }
  }
  return { ...rule, responseConfig };
}

export const ruleTrigger = (rule) => rule.triggerKey || rule.triggerValue || "";
export const ruleText = (rule) => {
  const r = parseRule(rule).responseConfig || {};
  return r.text || r.body || r.caption || r.url || "";
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export const isUrl = (value, httpsOnly = false) => {
  try {
    const u = new URL(value);
    return httpsOnly
      ? u.protocol === "https:"
      : ["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
};
export const isTimezone = (value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export function validateAutomationForm(f, requirePrompt = true) {
  const e = {};
  if (blank(f.name)) e.name = "Give this automation a name.";
  else if (f.name.trim().length < 3) e.name = "Use at least 3 characters.";
  else if (f.name.length > 60) e.name = "Keep it under 60 characters.";
  if ((f.businessName || "").length > 80)
    e.businessName = "Keep it under 80 characters.";
  if (
    f.timezone !== undefined &&
    (blank(f.timezone) || !isTimezone(f.timezone))
  )
    e.timezone = "Choose a valid timezone.";
  if (requirePrompt) {
    if (blank(f.systemPrompt))
      e.systemPrompt = "System instructions are required.";
    else if (f.systemPrompt.trim().length < 20)
      e.systemPrompt = "Describe the assistant in at least 20 characters.";
  }
  if ((f.systemPrompt || "").length > 8000)
    e.systemPrompt = "Keep instructions under 8,000 characters.";
  if ((f.initialMessage || "").length > 1024)
    e.initialMessage = "Max 1,024 characters.";
  return e;
}

export function validateMeta(m) {
  const e = {};
  if (blank(m.phoneNumber)) e.phoneNumber = "Phone number is required.";
  else if (!/^\+[1-9]\d{6,14}$/.test(m.phoneNumber.replace(/[\s()-]/g, "")))
    e.phoneNumber = "Use E.164 format, e.g. +919876543210.";
  if (blank(m.phoneNumberId)) e.phoneNumberId = "Phone Number ID is required.";
  else if (!/^\d{10,20}$/.test(m.phoneNumberId.trim()))
    e.phoneNumberId = "Use the numeric ID (10â€“20 digits) from Meta API Setup.";
  if (blank(m.apiToken)) e.apiToken = "Access token is required.";
  else if (/\s/.test(m.apiToken.trim()) || m.apiToken.trim().length < 20)
    e.apiToken = "Token looks too short or contains spaces.";
  if (blank(m.verifyToken)) e.verifyToken = "Verify token is required.";
  else if (!/^\S{8,64}$/.test(m.verifyToken.trim()))
    e.verifyToken = "Use 8â€“64 characters, no spaces.";
  if (!blank(m.apiVersion) && !/^v\d{1,2}\.\d$/.test(m.apiVersion.trim()))
    e.apiVersion = "Format like v20.0";
  if (!blank(m.appSecret) && !/^[a-f0-9]{32}$/i.test(m.appSecret.trim()))
    e.appSecret = "App secret should be 32 hex characters.";
  if (!blank(m.businessId) && !/^\d{10,20}$/.test(m.businessId.trim()))
    e.businessId = "WABA ID is 10â€“20 digits.";
  return e;
}

export function validateRule(d) {
  const e = {};
  const v = (d.triggerValue || "").trim();
  if (d.triggerType === "keyword") {
    if (!v) e.triggerValue = "Enter the keyword or phrase to match.";
    else if (v.length > 100) e.triggerValue = "Max 100 characters.";
  } else if (d.triggerType === "button_press" || d.triggerType === "list_row") {
    if (!v) e.triggerValue = "Enter the exact ID.";
    else if (!/^[\w-]{1,200}$/.test(v))
      e.triggerValue =
        "Letters, numbers, - and _ only (snake_case recommended).";
  } else if (d.triggerType === "flow_reply" && !v)
    e.triggerValue = "Enter the flow name or token.";
  if ((d.name || "").length > 60) e.name = "Max 60 characters.";

  const r = d.responseConfig || {};
  if (r.attachment?.kind && r.attachment.kind !== "none") {
    if (blank(r.attachment.url)) e.attachmentUrl = "URL is required.";
    else if (!isUrl(r.attachment.url.trim(), true))
      e.attachmentUrl = "Use a full https:// URL.";
  }
  if (d.responseType === "text") {
    if (blank(r.text)) e.text = "Reply text is required.";
    else if (r.text.length > 1024) e.text = "Max 1,024 characters.";
  } else if (d.responseType === "button") {
    if (blank(r.body)) e.body = "Message above the buttons is required.";
    else if (r.body.length > 1024) e.body = "Max 1,024 characters.";
    const buttons = r.buttons || [];
    if (!buttons.length) e.buttons = "Add at least one button.";
    const ids = new Set();
    buttons.forEach((b, i) => {
      if (blank(b.title)) e[`buttons.${i}.title`] = "Title required.";
      else if (b.title.length > 20)
        e[`buttons.${i}.title`] = "Max 20 characters.";
      if (blank(b.id)) e[`buttons.${i}.id`] = "ID required.";
      else if (!/^[\w-]{1,256}$/.test(b.id.trim()))
        e[`buttons.${i}.id`] = "Letters, numbers, - and _ only.";
      else if (ids.has(b.id.trim())) e[`buttons.${i}.id`] = "Duplicate ID.";
      else ids.add(b.id.trim());
    });
  } else if (d.responseType === "list") {
    if (blank(r.body)) e.body = "Message above the list is required.";
    if (blank(r.buttonLabel)) e.buttonLabel = "Menu button label is required.";
    else if (r.buttonLabel.length > 20) e.buttonLabel = "Max 20 characters.";
    const ids = new Set();
    let total = 0;
    (r.sections || []).forEach((section, si) =>
      (section.rows || []).forEach((row, ri) => {
        total += 1;
        const p = `sections.${si}.rows.${ri}`;
        if (blank(row.title)) e[`${p}.title`] = "Title required.";
        else if (row.title.length > 24) e[`${p}.title`] = "Max 24 characters.";
        if (blank(row.id)) e[`${p}.id`] = "ID required.";
        else if (!/^[\w-]{1,200}$/.test(row.id.trim()))
          e[`${p}.id`] = "Letters, numbers, - and _ only.";
        else if (ids.has(row.id.trim())) e[`${p}.id`] = "Duplicate ID.";
        else ids.add(row.id.trim());
      }),
    );
    if (!total) e.rows = "Add at least one row.";
    else if (total > 10) e.rows = "WhatsApp lists allow at most 10 rows.";
  } else if (d.responseType === "media") {
    if (blank(r.url)) e.url = "Media URL is required.";
    else if (!isUrl(r.url.trim(), true)) e.url = "Use a public https:// URL.";
    if ((r.caption || "").length > 1024) e.caption = "Max 1,024 characters.";
  } else if (d.responseType === "cta_url") {
    if (blank(r.body)) e.body = "Message is required.";
    if (blank(r.button?.title)) e.linkTitle = "Button title is required.";
    else if (r.button.title.length > 20) e.linkTitle = "Max 20 characters.";
    if (blank(r.button?.url)) e.linkUrl = "Link is required.";
    else if (!isUrl(r.button.url.trim(), true))
      e.linkUrl = "Use a full https:// URL.";
  }
  return e;
}

export function useFieldErrors(errors) {
  const [touched, setTouched] = useState({});
  const [all, setAll] = useState(false);
  const bind = (path) => ({
    error: all || touched[path] ? errors[path] : undefined,
    onBlur: () =>
      setTouched((current) =>
        current[path] ? current : { ...current, [path]: true },
      ),
  });
  return {
    bind,
    showAll: () => setAll(true),
    reset: () => {
      setTouched({});
      setAll(false);
    },
    valid: !Object.keys(errors).length,
  };
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ UI primitives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export const inputBase =
  "w-full rounded-lg border bg-[#0c0c0f] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50";
export const inputTone = (error) =>
  error
    ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/20"
    : "border-[#26262b] hover:border-[#3a3a42] focus:border-sky-500 focus:ring-sky-500/20";

export const variants = {
  default:
    "border-[#26262b] bg-[#16161a] text-zinc-100 hover:border-[#3a3a42] hover:bg-[#1b1b20]",
  primary:
    "border-sky-600 bg-sky-600 text-white hover:border-sky-500 hover:bg-sky-500 font-semibold",
  danger: "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20",
  solidDanger:
    "border-red-600 bg-red-600 text-white hover:bg-red-500 font-semibold",
  ghost: "border-transparent bg-transparent text-zinc-300 hover:bg-white/5",
};
export const sizes = {
  md: "px-3.5 py-2 text-sm",
  sm: "px-2.5 py-1.5 text-xs",
  icon: "h-8 w-8 justify-center",
};

export function Button({
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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export const badgeTones = {
  neutral: "border-[#26262b] bg-[#16161a] text-zinc-400",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  red: "border-red-500/40 bg-red-500/10 text-red-300",
  purple: "border-violet-500/40 bg-violet-500/10 text-violet-300",
};
export const Badge = ({ tone = "neutral", className, children }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
      badgeTones[tone],
      className,
    )}
  >
    {children}
  </span>
);

export function Field({
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
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  required,
  className,
  max,
  ...rest
}) {
  const id = useId();
  return (
    <Field
      id={id}
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
      count={(value || "").length}
      max={max}
    >
      <input
        id={id}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(inputBase, inputTone(error))}
        {...rest}
      />
    </Field>
  );
}

export function TextArea({
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
  mono,
  ...rest
}) {
  const id = useId();
  return (
    <Field
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
        className={cn(
          inputBase,
          inputTone(error),
          "resize-y",
          mono && "font-mono text-xs",
        )}
        {...rest}
      />
    </Field>
  );
}

export const chevron =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b8b95' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")";
export function SelectField({
  label,
  value,
  onChange,
  onBlur,
  options,
  error,
  hint,
  required,
  className,
  ...rest
}) {
  const id = useId();
  return (
    <Field
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
        style={{ backgroundImage: chevron }}
        {...rest}
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
    </Field>
  );
}

export function Toggle({ checked, onChange, label, ariaLabel, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className="group inline-flex items-center gap-2.5 text-sm text-zinc-200 focus-visible:outline-none disabled:opacity-50"
    >
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition group-focus-visible:ring-2 group-focus-visible:ring-sky-500/40",
          checked ? "bg-sky-600" : "bg-zinc-700",
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

export function Card({ title, action, children, className }) {
  return (
    <section
      className={cn(
        "mb-4 rounded-xl border border-[#26262b] bg-[#111114] p-5",
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Modal({ title, description, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex max-h-[92vh] w-full flex-col rounded-2xl border border-[#26262b] bg-[#111114] shadow-2xl shadow-black/60",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#26262b] p-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-50">{title}</h2>
            {description && (
              <p className="mt-1 text-xs text-zinc-400">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-500 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#26262b] p-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, body, confirmLabel, busy, onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="solidDanger" onClick={onConfirm} disabled={busy}>
            {busy ? "Workingâ€¦" : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-zinc-300">{body}</p>
    </Modal>
  );
}

export function CopyButton({ text, label = false }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <Button size="sm" onClick={copy} aria-label="Copy">
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {label && (copied ? "Copied" : "Copy")}
    </Button>
  );
}

export function Toasts({ items, dismiss }) {
  const tones = {
    success: "border-emerald-500/40 bg-emerald-950/90 text-emerald-100",
    error: "border-red-500/40 bg-red-950/90 text-red-100",
    info: "border-sky-500/40 bg-sky-950/90 text-sky-100",
  };
  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded-lg border px-3.5 py-3 text-sm shadow-lg backdrop-blur",
            tones[item.tone],
          )}
        >
          <span className="flex-1">{item.text}</span>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            aria-label="Dismiss"
            className="opacity-60 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */


export function Skeleton({ rows }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      {Array.from({ length: rows * 2 }).map((_, i) => (
        <div
          key={i}
          className="h-56 animate-pulse rounded-xl border border-[#26262b] bg-[#111114]"
        />
      ))}
    </div>
  );
}

export function useAutomationsController({ onCreated, onRemoved } = {}) {
  const { isAdmin } = useAuth();
  const [automations, setAutomations] = useState([]);
  const [instances, setInstances] = useState([]);
  const [rulesBy, setRulesBy] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null); // { type, ... }
  const [busy, setBusy] = useState(false);

  const toast = useCallback((text, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((current) => [...current, { id, text, tone }]);
    setTimeout(
      () => setToasts((current) => current.filter((item) => item.id !== id)),
      tone === "error" ? 6000 : 3000,
    );
  }, []);
  const dismissToast = (id) =>
    setToasts((current) => current.filter((item) => item.id !== id));

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const [automationsResponse, instancesResponse] = await Promise.all([
        axios.get(`${SERVER_URL}/api/whatsapp-automation`),
        axios
          .get(`${SERVER_URL}/api/baileys/instances`)
          .catch(() => ({ data: [] })),
      ]);
      const loaded = automationsResponse.data.automations || [];
      setAutomations(loaded);
      setInstances(instancesResponse.data || []);
      const entries = await Promise.all(
        loaded.map(async (automation) => {
          try {
            return [
              automation.id,
              (
                await axios.get(
                  `${SERVER_URL}/api/whatsapp-automation/${automation.id}/auto-replies`,
                )
              ).data.rules || [],
            ];
          } catch {
            return [automation.id, []];
          }
        }),
      );
      setRulesBy(Object.fromEntries(entries));
      setLoadError("");
    } catch (err) {
      setLoadError(apiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  /** Runs an API action with toast feedback. Resolves true on success. */
  const run = async (action, successText) => {
    try {
      await action();
      if (successText) toast(successText);
      return true;
    } catch (err) {
      toast(apiError(err), "error");
      return false;
    }
  };

  const actions = {
    create: (form) =>
      run(async () => {
        const response = await axios.post(
          `${SERVER_URL}/api/whatsapp-automation`,
          {
            ...form,
            name: form.name.trim(),
            businessName: form.businessName.trim(),
            status: "active",
            supportedLanguages: [form.language],
            onboarding: { capabilities: [], tools: [] },
          },
        );
        await load(true);
        const id = response.data.automation?.id;
        if (id) onCreated?.(id);
      }, "Automation created â€” now connect a WhatsApp number."),
    update: (automation, options, text = "Changes saved") =>
      run(async () => {
        await axios.put(
          `${SERVER_URL}/api/whatsapp-automation/${automation.id}`,
          payloadOf(automation, options),
        );
        await load(true);
      }, text),
    remove: (id) =>
      run(async () => {
        await axios.delete(`${SERVER_URL}/api/whatsapp-automation/${id}`);
        onRemoved?.();
        await load(true);
      }, "Automation deleted"),
    connectMeta: (automationId, meta) =>
      run(async () => {
        await axios.post(
          `${SERVER_URL}/api/whatsapp-automation/${automationId}/connections`,
          {
            provider: "cloud_api",
            phoneNumber: meta.phoneNumber.replace(/[\s()-]/g, ""),
            phoneNumberId: meta.phoneNumberId.trim(),
            apiToken: meta.apiToken.trim(),
            verifyToken: meta.verifyToken.trim(),
            appSecret: meta.appSecret ? meta.appSecret.trim() : null,
            businessId: meta.businessId ? meta.businessId.trim() : null,
            credentials: { apiVersion: meta.apiVersion.trim() || "v20.0" },
          },
        );
        await load(true);
      }, "Meta Cloud API connected"),
    connectQr: (automation, instance) =>
      run(async () => {
        await axios.post(
          `${SERVER_URL}/api/whatsapp-automation/${automation.id}/connections`,
          {
            provider: "baileys",
            phoneNumber: instance.phoneNumber,
            instanceId: instance.instanceId,
          },
        );
        await load(true);
      }, "Device linked"),
    disconnect: (automationId, connectionId) =>
      run(async () => {
        await axios.delete(
          `${SERVER_URL}/api/whatsapp-automation/${automationId}/connections/${connectionId}`,
        );
        await load(true);
      }, "Number disconnected"),
    saveRule: (automationId, draft, ruleId) =>
      run(
        async () => {
          const rc = draft.responseConfig;
          const payload = {
            ...draft,
            response: JSON.stringify(rc),
            responseType: rc._type,
            responseConfig: rc,
          };
          if (["button_press", "list_row"].includes(payload.triggerType)) {
            payload.triggerKey = payload.triggerValue.trim();
            payload.triggerValue = null;
          } else payload.triggerValue = payload.triggerValue.trim();
          const response = ruleId
            ? await axios.put(
                `${SERVER_URL}/api/whatsapp-automation/${automationId}/auto-replies/${ruleId}`,
                payload,
              )
            : await axios.post(
                `${SERVER_URL}/api/whatsapp-automation/${automationId}/auto-replies`,
                payload,
              );
          const saved = response.data.rule || { ...payload, id: ruleId };
          setRulesBy((current) => ({
            ...current,
            [automationId]: ruleId
              ? (current[automationId] || []).map((r) =>
                  r.id === ruleId ? saved : r,
                )
              : [...(current[automationId] || []), saved],
          }));
        },
        ruleId ? "Auto-reply updated" : "Auto-reply added",
      ),
    toggleRule: (automationId, rule) =>
      run(async () => {
        const next = { ...rule, enabled: !rule.enabled };
        await axios.put(
          `${SERVER_URL}/api/whatsapp-automation/${automationId}/auto-replies/${rule.id}`,
          next,
        );
        setRulesBy((current) => ({
          ...current,
          [automationId]: (current[automationId] || []).map((r) =>
            r.id === rule.id ? next : r,
          ),
        }));
      }),
    deleteRule: (automationId, ruleId) =>
      run(async () => {
        await axios.delete(
          `${SERVER_URL}/api/whatsapp-automation/${automationId}/auto-replies/${ruleId}`,
        );
        setRulesBy((current) => ({
          ...current,
          [automationId]: (current[automationId] || []).filter(
            (r) => r.id !== ruleId,
          ),
        }));
      }, "Auto-reply deleted"),
  };

  const toggleStatus = (automation) =>
    actions.update(
      automation,
      {
        fields: {
          status: automation.status === "active" ? "paused" : "active",
        },
      },
      automation.status === "active"
        ? `${automation.name} paused`
        : `${automation.name} resumed`,
    );

  const confirm = async (fn) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) setModal(null);
  };

  const connectedInstanceIds = useMemo(
    () =>
      new Set(
        automations.flatMap((a) =>
          (a.connections || []).map((c) => c.instanceId).filter(Boolean),
        ),
      ),
    [automations],
  );
  const availableInstances = useMemo(
    () =>
      instances.filter((instance) => {
        const status =
          typeof instance.status === "object"
            ? instance.status?.status || instance.status?.connection
            : instance.status;
        return (
          (status === "connected" || status === "open") &&
          instance.phoneNumber &&
          !instance.agentId &&
          !connectedInstanceIds.has(instance.instanceId)
        );
      }),
    [instances, connectedInstanceIds],
  );


  return {
    isAdmin,
    automations,
    rulesBy,
    loading,
    setLoading,
    refreshing,
    loadError,
    load,
    toasts,
    dismissToast,
    modal,
    setModal,
    busy,
    confirm,
    actions,
    toggleStatus,
    availableInstances,
  };
}

export function AutomationModals({ c, navigate }) {
  const { modal, setModal, busy, confirm, actions, toasts, dismissToast } = c;
  return (
    <>
      {modal?.type === "new" && (
        <NewAutomationModal
          onClose={() => setModal(null)}
          onCreate={(form) => confirm(() => actions.create(form))}
          busy={busy}
          onGuided={() => navigate("/whatsapp/setup")}
        />
      )}
      {modal?.type === "meta" && (
        <MetaModal
          onClose={() => setModal(null)}
          busy={busy}
          onSave={(meta) =>
            confirm(() => actions.connectMeta(modal.automation.id, meta))
          }
        />
      )}
      {modal?.type === "rule" && (
        <RuleModal
          onClose={() => setModal(null)}
          busy={busy}
          rule={modal.rule}
          onSave={(draft) =>
            confirm(() =>
              actions.saveRule(modal.automation.id, draft, modal.rule?.id),
            )
          }
        />
      )}
      {modal?.type === "delete" && (
        <ConfirmModal
          title={`Delete â€œ${modal.automation.name}â€?`}
          body="This removes the automation, its auto-replies and its channel connections. The WhatsApp number itself stays on your account. This cannot be undone."
          confirmLabel="Delete automation"
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() => confirm(() => actions.remove(modal.automation.id))}
        />
      )}
      {modal?.type === "deleteRule" && (
        <ConfirmModal
          title="Delete this auto-reply?"
          body={`The rule â€œ${ruleTrigger(modal.rule)}â€ will stop answering customers immediately.`}
          confirmLabel="Delete rule"
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() =>
            confirm(() =>
              actions.deleteRule(modal.automation.id, modal.rule.id),
            )
          }
        />
      )}
      {modal?.type === "disconnect" && (
        <ConfirmModal
          title="Disconnect this number?"
          body={`${modal.connection.phoneNumber} will no longer be handled by â€œ${modal.automation.name}â€.`}
          confirmLabel="Disconnect"
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() =>
            confirm(() =>
              actions.disconnect(modal.automation.id, modal.connection.id),
            )
          }
        />
      )}

      <Toasts items={toasts} dismiss={dismissToast} />
    </>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ modals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export function NewAutomationModal({ onClose, onCreate, onGuided, busy }) {
  const [form, setForm] = useState(emptyNew);
  const errors = useMemo(
    () => validateAutomationForm({ ...form, timezone: undefined }),
    [form],
  );
  const fields = useFieldErrors(errors);
  const set = (k, v) => setForm((current) => ({ ...current, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    if (!fields.valid) {
      fields.showAll();
      return;
    }
    onCreate(form);
  };
  return (
    <Modal
      title="New automation"
      description="Quick-create a bot now, or use the guided setup for knowledge, hours and auto-replies."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={onGuided}>
            Use guided setup instead â†’
          </Button>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            <Plus className="h-4 w-4" />
            {busy ? "Creatingâ€¦" : "Create automation"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          label="Automation name"
          required
          max={60}
          value={form.name}
          onChange={(v) => set("name", v)}
          placeholder="e.g. Customer Support Bot"
          autoFocus
          {...fields.bind("name")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Business name"
            max={80}
            value={form.businessName}
            onChange={(v) => set("businessName", v)}
            placeholder="e.g. Acme Corp"
            {...fields.bind("businessName")}
          />
          <SelectField
            label="Primary language"
            value={form.language}
            onChange={(v) => set("language", v)}
            options={languages}
          />
        </div>
        <TextArea
          label="System instructions / prompt"
          required
          mono
          rows={6}
          max={8000}
          value={form.systemPrompt}
          onChange={(v) => set("systemPrompt", v)}
          placeholder="You are a helpful customer service assistant for Acme Corpâ€¦"
          {...fields.bind("systemPrompt")}
        />
        <TextField
          label="Initial greeting (optional)"
          max={1024}
          value={form.initialMessage}
          onChange={(v) => set("initialMessage", v)}
          placeholder="Hi! How can I help you today?"
          {...fields.bind("initialMessage")}
        />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function MetaModal({ onClose, onSave, busy }) {
  const [meta, setMeta] = useState(() => ({
    ...emptyMeta,
    verifyToken: randomToken(),
  }));
  const errors = useMemo(() => validateMeta(meta), [meta]);
  const fields = useFieldErrors(errors);
  const set = (k, v) => setMeta((current) => ({ ...current, [k]: v }));
  const submit = () => {
    if (!fields.valid) {
      fields.showAll();
      return;
    }
    onSave(meta);
  };
  return (
    <Modal
      wide
      title="Connect Meta WhatsApp Cloud API"
      description="Store your Meta developer credentials to enable automated messaging via the official WhatsApp Graph API."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Savingâ€¦" : "Save & connect"}
          </Button>
        </>
      }
    >
      <TextField
        label="Phone number (E.164 with country code)"
        required
        value={meta.phoneNumber}
        onChange={(v) => set("phoneNumber", v)}
        placeholder="+919876543210"
        hint="Your verified WhatsApp business phone number."
        inputMode="tel"
        {...fields.bind("phoneNumber")}
      />
      <TextField
        label="Phone Number ID"
        required
        value={meta.phoneNumberId}
        onChange={(v) => set("phoneNumberId", v)}
        placeholder="104829384812345"
        hint="Meta App Dashboard â†’ WhatsApp â†’ API Setup."
        {...fields.bind("phoneNumberId")}
      />
      <TextArea
        label="Access token"
        required
        mono
        rows={3}
        value={meta.apiToken}
        onChange={(v) => set("apiToken", v)}
        placeholder="EAAGâ€¦"
        hint="Permanent System User token (recommended) or a 24-hour temporary token."
        autoComplete="off"
        spellCheck={false}
        {...fields.bind("apiToken")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="API version"
          value={meta.apiVersion}
          onChange={(v) => set("apiVersion", v)}
          placeholder="v20.0"
          {...fields.bind("apiVersion")}
        />
        <div>
          <TextField
            label="Webhook verify token"
            required
            value={meta.verifyToken}
            onChange={(v) => set("verifyToken", v)}
            {...fields.bind("verifyToken")}
          />
          <button
            type="button"
            onClick={() => set("verifyToken", randomToken())}
            className="mt-1.5 text-xs text-sky-400 hover:text-sky-300"
          >
            Generate a new token
          </button>
        </div>
      </div>
      <TextField
        label="App secret (optional)"
        type="password"
        value={meta.appSecret}
        onChange={(v) => set("appSecret", v)}
        placeholder="Used to verify webhook signatures"
        autoComplete="off"
        {...fields.bind("appSecret")}
      />
      <TextField
        label="WhatsApp Business Account ID (optional)"
        value={meta.businessId}
        onChange={(v) => set("businessId", v)}
        placeholder="109823485723412"
        {...fields.bind("businessId")}
      />

      <div className="space-y-3 rounded-lg border border-[#26262b] bg-[#16161a] p-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
          <ShieldCheck className="h-4 w-4" />
          Meta webhook configuration
        </div>
        {[
          ["Callback URL", WEBHOOK_URL],
          ["Verify token", meta.verifyToken],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="mb-1 text-[11px] text-zinc-500">{label}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 select-all truncate rounded border border-[#26262b] bg-[#0c0c0f] px-2 py-1 text-[11px]">
                {value}
              </code>
              <CopyButton text={value} />
            </div>
          </div>
        ))}
        <p className="text-[11px] text-zinc-500">
          In the Meta dashboard, subscribe to the{" "}
          <b className="text-zinc-300">messages</b> webhook field.
        </p>
      </div>
    </Modal>
  );
}

export function RuleModal({ rule, onClose, onSave, busy }) {
  const [draft, setDraft] = useState(() => {
    if (!rule) return newRuleDraft();
    const parsed = parseRule(rule);
    return {
      ...newRuleDraft(),
      ...parsed,
      triggerValue: ruleTrigger(parsed),
      matchMode: parsed.matchMode || "exact",
      name: parsed.name || "",
    };
  });
  const errors = useMemo(() => validateRule(draft), [draft]);
  const fields = useFieldErrors(errors);
  const rc = draft.responseConfig || {};
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const setRc = (patch) =>
    setDraft((current) => ({
      ...current,
      responseConfig: { ...current.responseConfig, ...patch },
    }));
  const changeType = (type) => {
    const carried = rc.text || rc.body || rc.caption || "";
    const fresh = createResponseDraft(type);
    if (type === "text") fresh.text = carried;
    else if ("body" in fresh) fresh.body = carried;
    else if ("caption" in fresh) fresh.caption = carried;
    if (rc.attachment) fresh.attachment = rc.attachment;
    set({ responseType: type, responseConfig: fresh });
  };
  const submit = () => {
    if (!fields.valid) {
      fields.showAll();
      return;
    }
    onSave(draft);
  };
  const buttons = rc.buttons || [];
  const sections = rc.sections || [];
  const setRow = (si, ri, patch) =>
    setRc({
      sections: sections.map((s, i) =>
        i === si ? { ...s, rows: patchAt(s.rows || [], ri, patch) } : s,
      ),
    });
  const triggerPlaceholder = {
    keyword: "pricing",
    button_press: "get_quote",
    list_row: "pricing",
    flow_reply: "flow name",
    first_message: "",
    always: "",
  }[draft.triggerType];
  const rowCount = sections.reduce((n, s) => n + (s.rows || []).length, 0);

  return (
    <Modal
      wide
      title={rule ? "Edit auto-reply" : "New auto-reply"}
      description="Runs before the AI. The customer sees the button title; WhatsApp sends the hidden ID, which is case-sensitive."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            <Save className="h-4 w-4" />
            {busy ? "Savingâ€¦" : "Save auto-reply"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Rule name (optional)"
          max={60}
          value={draft.name}
          onChange={(v) => set({ name: v })}
          placeholder="Pricing question"
          {...fields.bind("name")}
        />
        <SelectField
          label="Trigger type"
          value={draft.triggerType}
          onChange={(v) => set({ triggerType: v })}
          options={triggerTypes}
        />
        {!["always", "first_message"].includes(draft.triggerType) && (
          <TextField
            label={
              draft.triggerType === "keyword"
                ? "Keyword / phrase"
                : "Trigger ID"
            }
            required
            value={draft.triggerValue}
            onChange={(v) => set({ triggerValue: v })}
            placeholder={triggerPlaceholder}
            {...fields.bind("triggerValue")}
          />
        )}
        {draft.triggerType === "keyword" && (
          <SelectField
            label="Match mode"
            value={draft.matchMode}
            onChange={(v) => set({ matchMode: v })}
            options={[
              ["exact", "Exact match"],
              ["contains", "Contains"],
              ["starts_with", "Starts with"],
            ]}
          />
        )}
      </div>

      <SelectField
        label="Response type"
        value={draft.responseType}
        onChange={changeType}
        options={responseTypes}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {draft.responseType !== "media" && (
          <>
            <SelectField
              label="Attach image / link (optional)"
              value={rc.attachment?.kind || "none"}
              onChange={(v) => setRc({ attachment: { ...rc.attachment, kind: v } })}
              options={[
        ["none", "No attachment"],
        ["image", "Image"],
        ["video", "Video"],
        ["document", "Document (PDF)"],
        ["link", "Link"],
      ]}
            />
            {rc.attachment?.kind && rc.attachment.kind !== "none" && (
              <TextField
                label={rc.attachment.kind === "link" ? "Link (https://)" : "HTTPS media URL"}
                value={rc.attachment.url}
                onChange={(v) => setRc({ attachment: { ...rc.attachment, url: v } })}
                placeholder="https://…"
                {...fields.bind("attachmentUrl")}
              />
            )}
          </>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-[#26262b] bg-[#16161a] p-4">
        {draft.responseType === "text" && (
          <TextArea
            label="Reply text"
            required
            rows={4}
            max={1024}
            value={rc.text}
            onChange={(v) => setRc({ text: v })}
            placeholder="Write the automatic replyâ€¦"
            {...fields.bind("text")}
          />
        )}

        {draft.responseType === "button" && (
          <>
            <TextArea
              label="Message shown above the buttons"
              required
              rows={2}
              max={1024}
              value={rc.body}
              onChange={(v) => setRc({ body: v })}
              {...fields.bind("body")}
            />
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-300">
                Buttons (max 3)
              </p>
              <div className="space-y-2">
                {buttons.map((b, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_1fr_auto] items-start gap-2"
                  >
                    <TextField
                      aria-label={`Button ${i + 1} ID`}
                      placeholder="ID, e.g. get_quote"
                      value={b.id}
                      onChange={(v) =>
                        setRc({ buttons: patchAt(buttons, i, { id: v }) })
                      }
                      {...fields.bind(`buttons.${i}.id`)}
                    />
                    <TextField
                      aria-label={`Button ${i + 1} title`}
                      placeholder="Title, e.g. Get a Quote"
                      max={20}
                      value={b.title}
                      onChange={(v) =>
                        setRc({ buttons: patchAt(buttons, i, { title: v }) })
                      }
                      {...fields.bind(`buttons.${i}.title`)}
                    />
                    <Button
                      size="icon"
                      variant="danger"
                      onClick={() =>
                        setRc({ buttons: buttons.filter((_, k) => k !== i) })
                      }
                      aria-label="Remove button"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {fields.bind("buttons").error && (
                <p role="alert" className="mt-1 text-xs text-red-400">
                  {fields.bind("buttons").error}
                </p>
              )}
              {buttons.length < 3 && (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    setRc({ buttons: [...buttons, { id: "", title: "" }] })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add button
                </Button>
              )}
            </div>
          </>
        )}

        {draft.responseType === "list" && (
          <>
            <TextArea
              label="Message shown above the list"
              required
              rows={2}
              max={1024}
              value={rc.body}
              onChange={(v) => setRc({ body: v })}
              {...fields.bind("body")}
            />
            <TextField
              label="Menu button label"
              required
              max={20}
              value={rc.buttonLabel}
              onChange={(v) => setRc({ buttonLabel: v })}
              placeholder="View options"
              {...fields.bind("buttonLabel")}
            />
            {sections.map((section, si) => (
              <div key={si}>
                <p className="mb-1.5 text-xs font-medium text-zinc-300">
                  {section.title || "Rows"}{" "}
                  <span className="text-zinc-600">({rowCount}/10 rows)</span>
                </p>
                <div className="space-y-2">
                  {(section.rows || []).map((row, ri) => (
                    <div
                      key={ri}
                      className="space-y-2 rounded-lg border border-[#26262b] p-2"
                    >
                    <div className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                      <TextField
                        aria-label={`Row ${ri + 1} ID`}
                        placeholder="Row ID, e.g. pricing"
                        value={row.id}
                        onChange={(v) => setRow(si, ri, { id: v })}
                        {...fields.bind(`sections.${si}.rows.${ri}.id`)}
                      />
                      <TextField
                        aria-label={`Row ${ri + 1} title`}
                        placeholder="Row title"
                        max={24}
                        value={row.title}
                        onChange={(v) => setRow(si, ri, { title: v })}
                        {...fields.bind(`sections.${si}.rows.${ri}.title`)}
                      />
                      <Button
                        size="icon"
                        variant="danger"
                        onClick={() =>
                          setRc({
                            sections: sections.map((s, i) =>
                              i === si
                                ? {
                                    ...s,
                                    rows: s.rows.filter((_, k) => k !== ri),
                                  }
                                : s,
                            ),
                          })
                        }
                        aria-label="Remove row"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <TextField
                      aria-label="Row description"
                      placeholder="Row description (optional)"
                      max={72}
                      value={row.description}
                      onChange={(v) => setRow(si, ri, { description: v })}
                    />
                    </div>
                  ))}
                </div>
                {rowCount < 10 && (
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() =>
                      setRc({
                        sections: sections.map((s, i) =>
                          i === si
                            ? {
                                ...s,
                                rows: [
                                  ...(s.rows || []),
                                  { id: "", title: "" },
                                ],
                              }
                            : s,
                        ),
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add row
                  </Button>
                )}
              </div>
            ))}
            {fields.bind("rows").error && (
              <p role="alert" className="text-xs text-red-400">
                {fields.bind("rows").error}
              </p>
            )}
          </>
        )}

        {draft.responseType === "media" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Media type"
              value={rc.mediaType || "image"}
              onChange={(v) => setRc({ mediaType: v })}
              options={[
                ["image", "Image"],
                ["video", "Video"],
                ["document", "Document"],
              ]}
            />
            <TextField
              label="Public HTTPS media URL"
              required
              value={rc.url}
              onChange={(v) => setRc({ url: v })}
              placeholder="https://â€¦"
              {...fields.bind("url")}
            />
            <TextField
              className="sm:col-span-2"
              label="Caption (optional)"
              max={1024}
              value={rc.caption}
              onChange={(v) => setRc({ caption: v })}
              {...fields.bind("caption")}
            />
          </div>
        )}

        {draft.responseType === "cta_url" && (
          <>
            <TextArea
              label="Message shown with the link"
              required
              rows={2}
              max={1024}
              value={rc.body}
              onChange={(v) => setRc({ body: v })}
              {...fields.bind("body")}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Link button title"
                required
                max={20}
                value={rc.button?.title}
                onChange={(v) => setRc({ button: { ...rc.button, title: v } })}
                placeholder="Visit website"
                {...fields.bind("linkTitle")}
              />
              <TextField
                label="Link (https)"
                required
                value={rc.button?.url}
                onChange={(v) => setRc({ button: { ...rc.button, url: v } })}
                placeholder="https://example.com"
                {...fields.bind("linkUrl")}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
