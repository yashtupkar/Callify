import { cn } from '@/lib/utils';

const TONES = {
  default: 'bg-muted text-muted-foreground border-border',
  neutral: 'bg-muted text-foreground border-border',
  primary: 'bg-primary/15 text-primary border-primary/25',
  indigo:  'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  violet:  'bg-violet-500/15 text-violet-300 border-violet-500/25',
  blue:    'bg-blue-500/15 text-blue-300 border-blue-500/25',
  sky:     'bg-sky-500/15 text-sky-300 border-sky-500/25',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  green:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  amber:   'bg-amber-500/15 text-amber-300 border-amber-500/25',
  orange:  'bg-orange-500/15 text-orange-300 border-orange-500/25',
  red:     'bg-red-500/15 text-red-300 border-red-500/25',
  rose:    'bg-rose-500/15 text-rose-300 border-rose-500/25',
  pink:    'bg-pink-500/15 text-pink-300 border-pink-500/25',
  slate:   'bg-slate-500/15 text-slate-300 border-slate-500/25',
};

export function Badge({ tone = 'default', className, children, dot = false, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap',
        TONES[tone] || TONES.default,
        className
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full bg-current opacity-90')} />}
      {children}
    </span>
  );
}

const STATUS_TONES = {
  confirmed: 'emerald',
  completed: 'emerald',
  active: 'emerald',
  success: 'emerald',
  scheduled: 'blue',
  pending: 'amber',
  processing: 'amber',
  warning: 'amber',
  draft: 'slate',
  inactive: 'slate',
  archived: 'slate',
  rescheduled: 'violet',
  cancelled: 'red',
  failed: 'red',
  error: 'red',
  unknown: 'slate',
};

export function StatusBadge({ status, className }) {
  const s = (status || 'unknown').toLowerCase();
  return (
    <Badge tone={STATUS_TONES[s] || 'default'} dot className={className} capitalize>
      {status}
    </Badge>
  );
}
