import React from 'react';
import { 
  Search,
  Wand2,
  Play,
  Check,
  ChevronDown,
  Edit2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ModeToggle } from '../components/mode-toggle';

function Card({ title, subtitle, icon, provider, metrics }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-border/80 transition-all cursor-pointer">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <div className="w-2 h-2 rounded-full bg-primary" />
          {title}
        </div>
        <button className="text-muted-foreground hover:text-foreground">
          <Edit2 size={14} />
        </button>
      </div>
      
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">{subtitle}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
          {icon} {provider}
        </div>
      </div>
      
      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border/50">
        {metrics.map((metric, i) => (
          <div key={i}>
            <p className="text-[11px] text-muted-foreground mb-0.5">{metric.label}</p>
            <p className="text-sm font-medium text-foreground">{metric.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Composer() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/95 backdrop-blur z-10 sticky top-0 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-800 rounded flex items-center justify-center">
              <span className="text-xs font-medium">LI</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground flex items-center gap-2">
                Learnexa Interview agent
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="bg-emerald-500/10 text-emerald-500 px-1 rounded text-[10px] font-medium">v1</span>
                828356...881cf6
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/80 transition-colors">
            <Wand2 size={16} className="text-primary" />
            Composer
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors">
            <Play size={16} className="text-emerald-500" />
            Talk
            <ChevronDown size={14} className="text-muted-foreground ml-1" />
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-background border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors">
            <Check size={16} className="text-muted-foreground" />
            Published
          </button>
          <ModeToggle />
        </div>
      </header>

      {/* Main Scrollable Area */}
      <div className="flex-1 overflow-auto p-6 max-w-[1200px] w-full mx-auto">
        {/* Nav Tabs */}
        <div className="flex items-center justify-between border-b border-border mb-6">
          <div className="flex gap-6">
            {['Assistant', 'Logs', 'Tools', 'Analysis', 'Advanced'].map((tab, i) => (
              <button 
                key={tab}
                className={cn(
                  "pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                  i === 0 ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                {i === 0 && <Wand2 size={16} />}
                {tab}
              </button>
            ))}
          </div>
          <div className="pb-3">
            <Search size={16} className="text-muted-foreground" />
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="flex gap-8 mb-8 bg-card border border-border p-4 rounded-xl">
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground font-medium">Cost</span>
              <span className="font-semibold text-foreground">~$0.10 <span className="text-muted-foreground font-normal text-xs">/min</span></span>
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden flex">
              <div className="bg-emerald-500 w-1/3"></div>
              <div className="bg-blue-500 w-1/4"></div>
              <div className="bg-purple-500 w-1/5"></div>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground font-medium">Latency</span>
              <span className="font-semibold text-foreground">~1,560 <span className="text-muted-foreground font-normal text-xs">ms</span></span>
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden flex">
              <div className="bg-orange-500 w-1/3"></div>
              <div className="bg-blue-500 w-1/4"></div>
              <div className="bg-purple-500 w-1/5"></div>
            </div>
          </div>
        </div>

        {/* Model Presets */}
        <div className="flex items-center gap-4 mb-6">
          <span className="text-xs font-semibold text-muted-foreground">Model Presets</span>
          <div className="flex gap-2">
            {['Balanced', 'High Intelligence', 'Ultra Fast', 'Cost Saver', 'Customized'].map((preset, i) => (
              <button 
                key={preset}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  i === 0 ? "bg-accent border-border text-foreground" : "bg-transparent border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Configuration Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card 
            title="Transcriber"
            subtitle="Flux General English"
            icon={<div className="w-3 h-3 bg-white rounded-sm" />}
            provider="Deepgram · English"
            metrics={[
              { label: "Latency", value: "380ms" },
              { label: "Cost", value: "$0.01/min" },
              { label: "Accuracy", value: "2.3% WER" },
            ]}
          />
          <Card 
            title="Model"
            subtitle="GPT-4.1"
            icon={<div className="w-3 h-3 bg-white rounded-full" />}
            provider="OpenAI"
            metrics={[
              { label: "Latency", value: "690ms" },
              { label: "Cost", value: "$0.02/min" },
              { label: "Intelligence", value: "19" },
            ]}
          />
          <Card 
            title="Voice"
            subtitle="Elliot"
            icon={<div className="w-3 h-3 bg-white rotate-45" />}
            provider="Vapi"
            metrics={[
              { label: "Latency", value: "490ms" },
              { label: "Cost", value: "$0.02/min" },
              { label: "Humanness", value: "—" },
            ]}
          />
        </div>

        {/* Text Areas */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
              <span className="text-sm font-semibold text-foreground">First Message</span>
              <button className="text-xs bg-accent border border-border rounded flex items-center px-2 py-1 gap-1">
                Assistant speaks first <ChevronDown size={12} />
              </button>
            </div>
            <textarea 
              className="w-full bg-card text-sm p-4 text-foreground resize-none focus:outline-none min-h-[100px]"
              defaultValue="Hello I am Rohan"
            />
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
              <span className="text-sm font-semibold text-foreground">System Prompt</span>
              <div className="flex items-center gap-2">
                <Search size={14} className="text-muted-foreground" />
                <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">Ctrl I</span>
                <button className="text-xs bg-primary/10 text-primary border border-primary/20 rounded flex items-center px-2 py-1 gap-1 font-medium ml-2">
                  <Wand2 size={12} /> Generate
                </button>
              </div>
            </div>
            <textarea 
              className="w-full bg-card text-sm p-4 text-foreground resize-none focus:outline-none min-h-[150px]"
              defaultValue="You are Rohan, an expert and friendly interviewer."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
