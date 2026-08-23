import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function AnalyticsModal({ open, onClose, usage, cost }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card text-foreground border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center pb-2 border-b border-border">
            Call Summary
          </DialogTitle>
        </DialogHeader>

        {cost && usage ? (
          <div className="space-y-6 py-4">
            {/* Total cost */}
            <div className="flex justify-center">
              <div className="text-center">
                <p className="text-sm text-zinc-400 mb-1">Estimated Cost</p>
                <p className="text-5xl font-bold text-emerald-400">${cost.totalCost.toFixed(5)}</p>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900/50 p-4 rounded-xl border border-border text-center">
                <p className="text-sm text-zinc-400 mb-1">Duration</p>
                <p className="text-xl font-semibold">{usage.callDurationSeconds}s</p>
              </div>
              <div className="bg-zinc-900/50 p-4 rounded-xl border border-border text-center">
                <p className="text-sm text-zinc-400 mb-1">Tools Called</p>
                <p className="text-xl font-semibold">{usage.toolCalls}</p>
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="space-y-3 bg-zinc-900/50 p-4 rounded-xl border border-border">
              <h4 className="font-medium text-sm text-zinc-300 border-b border-border pb-2">Cost Breakdown</h4>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">LLM Processing</span>
                <span className="font-mono">${cost.llmCost.toFixed(5)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Speech-to-Text</span>
                <span className="font-mono">${cost.sttCost.toFixed(5)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Text-to-Speech</span>
                <span className="font-mono">${cost.ttsCost.toFixed(5)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-zinc-500 text-sm">No usage data available.</div>
        )}

        <DialogFooter>
          <Button onClick={onClose} className="w-full">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
