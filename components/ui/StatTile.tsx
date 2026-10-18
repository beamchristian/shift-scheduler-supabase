import { cardClass } from "../../lib/ui/styles";

// A summary tile: a label, a large value, and an optional note. Turns amber when `isWarning` is set.
export function StatTile({
  label,
  value,
  sub,
  isWarning,
}: {
  label: string;
  value: string;
  sub?: string;
  isWarning?: boolean;
}) {
  return (
    <div className={`${cardClass} p-4`}>
      <div className='text-xs font-medium uppercase tracking-wide text-slate-500'>
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${isWarning ? "text-amber-600" : "text-slate-900"}`}
      >
        {value}
      </div>
      {sub && <div className='mt-0.5 text-xs text-slate-500'>{sub}</div>}
    </div>
  );
}
