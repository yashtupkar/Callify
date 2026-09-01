import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, ChevronsUpDown, MoreHorizontal, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/data-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function compareValues(a, b, sortBy) {
  const av = sortBy.accessor ? sortBy.accessor(a) : a[sortBy.key];
  const bv = sortBy.accessor ? sortBy.accessor(b) : b[sortBy.key];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (av instanceof Date || bv instanceof Date) {
    return new Date(av) - new Date(bv);
  }
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
}

export function DataTable({
  columns,
  rows,
  searchPlaceholder = 'Search…',
  searchKeys = [],
  emptyState = null,
  onRowClick = null,
  rowKey = (row, i) => row.id ?? i,
  pageSize = 25,
}) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim() || searchKeys.length === 0) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter(row =>
      searchKeys.some(k => {
        const v = typeof k === 'function' ? k(row) : row[k];
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
  }, [rows, query, searchKeys]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return filtered;
    const arr = [...filtered].sort((a, b) => compareValues(a, b, col));
    return sort.dir === 'asc' ? arr : arr.reverse();
  }, [filtered, sort, columns]);

  const page = sorted.slice(0, pageSize);

  const toggleSort = (col) => {
    if (!col.sortable) return;
    setSort(prev => {
      if (prev.key !== col.key) return { key: col.key, dir: 'asc' };
      if (prev.dir === 'asc') return { key: col.key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {(searchKeys.length > 0) && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            <Badge tone="neutral" className="font-mono">
              {sorted.length} {sorted.length === 1 ? 'result' : 'results'}
            </Badge>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {columns.map(col => {
                const isSorted = sort.key === col.key;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground select-none',
                      col.sortable && 'cursor-pointer hover:text-foreground transition-colors',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.width && `w-[${col.width}]`
                    )}
                    onClick={() => toggleSort(col)}
                  >
                    <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'flex-row-reverse')}>
                      {col.header}
                      {col.sortable && (
                        isSorted
                          ? (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
                          : <ChevronsUpDown className="w-3 h-3 opacity-40" />
                      )}
                    </span>
                  </th>
                );
              })}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {page.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-16 text-center text-muted-foreground">
                  {emptyState || 'No results'}
                </td>
              </tr>
            ) : (
              page.map((row, i) => {
                const isClickable = !!onRowClick;
                return (
                  <tr
                    key={rowKey(row, i)}
                    onClick={isClickable ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-border last:border-0 transition-colors',
                      isClickable && 'cursor-pointer hover:bg-muted/40'
                    )}
                  >
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-3 align-middle',
                          col.align === 'right' && 'text-right',
                          col.align === 'center' && 'text-center',
                          col.cellClassName
                        )}
                      >
                        {col.render ? col.render(row) : (
                          <span className="truncate">{row[col.key]}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right">
                      <RowActions row={row} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
          Showing {page.length} of {sorted.length}
        </div>
      )}
    </div>
  );
}

function RowActions({ row }) {
  const actions = row.__actions;
  if (!actions || actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {actions.map((a, i) =>
          a.separator ? (
            <div key={i} className="h-px bg-border my-1" />
          ) : (
            <DropdownMenuItem
              key={i}
              onSelect={(e) => {
                e.preventDefault();
                a.onClick?.(row);
              }}
              className={cn(a.destructive && 'text-destructive focus:text-destructive')}
            >
              {a.icon && <a.icon className="w-3.5 h-3.5 mr-2" />}
              {a.label}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
