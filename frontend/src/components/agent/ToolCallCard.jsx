import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, Clock, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function useTimer(startTime, active) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(id);
  }, [active, startTime]);
  return elapsed;
}

export default function ToolCallCard({ entry, onComplete }) {
  const { toolName, args, result, completed, duration, startTime } = entry;
  const [expanded, setExpanded] = useState(true);
  const [showResultInput, setShowResultInput] = useState(false);
  const [manualResult, setManualResult] = useState('{"success": true}');
  const liveElapsed = useTimer(startTime, !completed);
  const displayDuration = completed ? duration : liveElapsed;

  const handleComplete = () => {
    let parsed = manualResult.trim();
    if (parsed.startsWith('{') || parsed.startsWith('[')) {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // keep as string if JSON parse fails
      }
    }
    onComplete(entry.toolCallId, { success: true, result: parsed });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
            entry.isFrontend
              ? 'text-amber-400 bg-amber-950/30 border border-amber-500/30'
              : 'text-indigo-400 bg-indigo-950/30 border border-indigo-500/30'
          }`}>
            {entry.isFrontend ? 'Frontend Tool' : 'Tool Call'}
          </span>
          <span className="font-mono text-xs text-zinc-300">{toolName}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Clock className="w-3 h-3" />
          <span>{formatDuration(displayDuration)}</span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 hover:bg-zinc-800 rounded transition-colors"
          >
            {expanded ? <ChevronDown className="w-3 h-3 text-zinc-400" /> : <ChevronRight className="w-3 h-3 text-zinc-400" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2">
          <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-lg p-3">
            <div className="text-xs text-zinc-500 mb-1">Arguments</div>
            <pre className="text-xs text-indigo-300 whitespace-pre-wrap font-mono">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>

          {completed && result && (
            <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 text-amber-400" />
                  <span className="text-xs text-zinc-500">Response</span>
                  <span className="text-xs text-zinc-500">({formatDuration(duration)})</span>
                </div>
                <button
                  onClick={() => copyToClipboard(JSON.stringify(result, null, 2))}
                  className="p-0.5 hover:bg-zinc-800 rounded transition-colors"
                >
                  <Copy className="w-3 h-3 text-zinc-500" />
                </button>
              </div>
              <pre className="text-xs text-amber-300 whitespace-pre-wrap font-mono">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {!completed && showResultInput && (
            <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-3">
              <div className="text-xs text-zinc-400 mb-2">Provide result for this tool call</div>
              <textarea
                value={manualResult}
                onChange={e => setManualResult(e.target.value)}
                placeholder='Enter result as JSON, e.g. {"success": true, "message": "Done"}'
                className="w-full bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 resize-y rounded-md px-2.5 py-1.5"
                rows={4}
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    handleComplete();
                  }
                }}
              />
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  className="text-xs h-7"
                  onClick={handleComplete}
                  disabled={!manualResult.trim()}
                >
                  Send Result
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={() => setShowResultInput(false)}
                >
                  Cancel
                </Button>
              </div>
              <div className="text-xs text-zinc-600 mt-1">
                Tip: Press Ctrl+Enter to submit
              </div>
            </div>
          )}

          {!completed && entry.isFrontend && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 border-amber-500/30 hover:bg-amber-950/30 text-amber-300"
              onClick={() => setShowResultInput(true)}
            >
              Complete Tool Call
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
