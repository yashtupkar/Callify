import React, { useState } from "react";
import axios from "axios";
import {
  Sparkles,
  Bot,
  X,
  Check,
  AlertCircle,
  ArrowRight,
  Layers,
  HelpCircle,
  ShoppingBag,
  Zap,
  RefreshCw,
} from "lucide-react";
import { SERVER_URL } from "@/lib/constants";

const GOAL_PRESETS = [
  {
    id: "leads",
    title: "Lead Capture & Consultations",
    desc: "Collect user contact info, book consultations, and guide inquiries to sales.",
    promptHint: "Focus heavily on lead qualification, booking consultations, and capturing phone/email.",
    icon: Zap,
  },
  {
    id: "sales",
    title: "Product Catalog & Orders",
    desc: "Showcase popular products, share pricing details, and provide order links.",
    promptHint: "Highlight our top products, pricing options, and direct purchase or quotation inquiries.",
    icon: ShoppingBag,
  },
  {
    id: "support",
    title: "Customer Support & FAQs",
    desc: "Answer frequent questions instantly and offer seamless human agent handover.",
    promptHint: "Focus on rapid troubleshooting, answering FAQs, and quick escalation to human support.",
    icon: HelpCircle,
  },
  {
    id: "booking",
    title: "Appointments & Visits",
    desc: "Operating hours, clinic/store location, and appointment scheduling.",
    promptHint: "Guide customers to schedule visits or appointments, check hours, and get directions.",
    icon: Layers,
  },
];

export default function AiFlowGeneratorModal({
  isOpen,
  onClose,
  config,
  onApplyRules,
}) {
  const [selectedGoal, setSelectedGoal] = useState("leads");
  const [customPrompt, setCustomPrompt] = useState("");
  const [applyMode, setApplyMode] = useState("replace"); // 'replace' | 'append'
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const businessName = config.businessName || config.name || "Your Business";
  const industry = config.industry || "General";
  const productCount = Array.isArray(config.products) ? config.products.length : 0;
  const faqCount = Array.isArray(config.faqs) ? config.faqs.length : 0;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setLoadingStep(1);

    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 1200);

    try {
      const activePreset = GOAL_PRESETS.find((p) => p.id === selectedGoal);
      const combinedPrompt = [
        activePreset?.promptHint || "",
        customPrompt.trim(),
      ].filter(Boolean).join(" ");

      const payload = {
        businessName: config.businessName || config.name,
        industry: config.industry,
        description: config.description,
        products: config.products,
        faqs: config.faqs,
        websiteUrl: config.websiteUrl,
        address: config.address,
        businessPhone: config.businessPhone,
        language: config.language || "en-US",
        prompt: combinedPrompt,
      };

      const res = await axios.post(
        `${SERVER_URL}/api/whatsapp-automation/generate-flow`,
        payload,
        { withCredentials: true }
      );

      clearInterval(stepInterval);

      const generatedRules = res.data?.rules;
      if (!Array.isArray(generatedRules) || !generatedRules.length) {
        throw new Error("No rules were generated. Please try again.");
      }

      onApplyRules(generatedRules, applyMode);
      onClose();
    } catch (err) {
      clearInterval(stepInterval);
      console.error("[AiFlowGeneratorModal] Error generating flow:", err);
      setError(
        err.response?.data?.error ||
        err.message ||
        "Failed to generate flow. Please check your network and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-[fadeIn_.2s_ease-out]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        onClick={!loading ? onClose : undefined}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-700/80 bg-[#121216] shadow-2xl shadow-black/80 overflow-hidden z-10">
        {/* Glow accent */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500" />

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-zinc-800/80 p-5 sm:p-6 bg-[#16161b]/50">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-sky-500/20 border border-emerald-500/30 text-emerald-400">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-100">
                  AI WhatsApp Flow Generator
                </h3>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Zero Code
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Automatically generate an interconnected WhatsApp decision tree tailored to your business.
              </p>
            </div>
          </div>
          {!loading && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Business Context Detected */}
          <div className="rounded-xl border border-zinc-800 bg-[#0c0c0f] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5 text-emerald-400" />
                Detected Knowledge Sources
              </span>
              <span className="text-[11px] text-zinc-500">Auto-pulled from setup</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-xs text-zinc-200">
                🏢 <strong className="font-medium">{businessName}</strong>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-xs text-zinc-300">
                🏷️ {industry}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-xs text-zinc-300">
                📦 {productCount} {productCount === 1 ? "Product" : "Products"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-xs text-zinc-300">
                ❓ {faqCount} {faqCount === 1 ? "FAQ" : "FAQs"}
              </span>
            </div>
          </div>

          {/* Flow Objective Presets */}
          <div>
            <label className="block text-xs font-semibold text-zinc-200 mb-2">
              Select Primary Flow Goal
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {GOAL_PRESETS.map((preset) => {
                const IconComp = preset.icon;
                const isSelected = selectedGoal === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedGoal(preset.id)}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-500/10 shadow-sm shadow-emerald-950/40"
                        : "border-zinc-800 bg-[#16161b] hover:border-zinc-700 hover:bg-[#1a1a20]"
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg mt-0.5 ${
                        isSelected
                          ? "bg-emerald-500 text-black"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      <IconComp className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-semibold ${
                          isSelected ? "text-emerald-300" : "text-zinc-200"
                        }`}
                      >
                        {preset.title}
                      </p>
                      <p className="text-[11px] text-zinc-400 leading-tight mt-0.5 line-clamp-2">
                        {preset.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Prompt Refinement */}
          <div>
            <label className="block text-xs font-semibold text-zinc-200 mb-1.5">
              Custom Directives & Special Offers (Optional)
            </label>
            <textarea
              rows={2}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. Include our 15% weekend discount, focus on WhatsApp consultation booking, and mention free delivery on orders over $50..."
              className="w-full rounded-xl border border-zinc-800 bg-[#0c0c0f] px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition resize-none"
            />
          </div>

          {/* Application Mode */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-zinc-800/80">
            <span className="text-xs font-medium text-zinc-300">How to apply rules:</span>
            <div className="inline-flex rounded-lg border border-zinc-800 bg-[#0c0c0f] p-1">
              <button
                type="button"
                onClick={() => setApplyMode("replace")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  applyMode === "replace"
                    ? "bg-emerald-600 text-white shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Replace current rules
              </button>
              <button
                type="button"
                onClick={() => setApplyMode("append")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  applyMode === "append"
                    ? "bg-emerald-600 text-white shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Append to current rules
              </button>
            </div>
          </div>

          {/* Loading status indicator */}
          {loading && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center space-y-2 animate-pulse">
              <div className="flex items-center justify-center gap-2 text-emerald-400 font-semibold text-xs">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {loadingStep === 1 && "Synthesizing conversational tree from profile..."}
                {loadingStep === 2 && "Designing interactive buttons and branches..."}
                {loadingStep === 3 && "Finalizing WhatsApp-compliant rules schema..."}
              </div>
              <p className="text-[11px] text-zinc-400">
                Generating high-converting WhatsApp message paths...
              </p>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-zinc-800/80 p-4 sm:p-5 bg-[#16161b]/40">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-transparent px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Generating Flow…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Generate WhatsApp Flow
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
