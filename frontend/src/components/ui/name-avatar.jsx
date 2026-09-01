import { cn } from '@/lib/utils';

/**
 * Deterministic palette of name-hashed gradient backgrounds.
 * Same name always renders the same color pair.
 */
const GRADIENTS = [
  ['from-indigo-500', 'to-violet-500'],
  ['from-sky-500', 'to-blue-500'],
  ['from-emerald-500', 'to-teal-500'],
  ['from-amber-500', 'to-orange-500'],
  ['from-pink-500', 'to-rose-500'],
  ['from-violet-500', 'to-fuchsia-500'],
  ['from-cyan-500', 'to-indigo-500'],
  ['from-lime-500', 'to-emerald-500'],
  ['from-rose-500', 'to-pink-500'],
  ['from-orange-500', 'to-red-500'],
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getGradientFor(seed) {
  const idx = hashString(String(seed || '')) % GRADIENTS.length;
  return GRADIENTS[idx];
}

/**
 * NameAvatar – a gradient + initials avatar derived from a name/email.
 * Replaces the boring single-color initial chip with a visually rich,
 * deterministic, per-person gradient tile.
 */
export function NameAvatar({ name, email, size = 'md', className }) {
  const seed = name || email || 'user';
  const [from, to] = getGradientFor(seed);
  const initials = getInitials(name || email);

  const sizeClasses = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-7 w-7 text-xs',
    md: 'h-8 w-8 text-xs',
    lg: 'h-9 w-9 text-sm',
    xl: 'h-12 w-12 text-base',
  }[size] || 'h-8 w-8 text-xs';

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 select-none',
        'bg-gradient-to-br shadow-sm ring-1 ring-white/10',
        from, to,
        sizeClasses,
        className
      )}
      title={name || email}
      aria-label={name || email}
    >
      <span className="drop-shadow-sm">{initials}</span>
      <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/0 via-white/5 to-white/10 pointer-events-none" />
    </div>
  );
}

export default NameAvatar;
