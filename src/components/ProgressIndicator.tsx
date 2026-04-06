import type { GeocodingProgress } from "@/types";

interface Props {
  progress: GeocodingProgress;
}

export default function ProgressIndicator({ progress }: Props) {
  const { total, done, failed } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const succeeded = done - failed;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">Geocoding in progress&hellip;</span>
        <span className="text-slate-500">{done} / {total}</span>
      </div>

      <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-green-500 transition-all duration-300"
          style={{ width: `${total > 0 ? (succeeded / total) * 100 : 0}%` }}
        />
        <div
          className="h-full bg-red-400 transition-all duration-300"
          style={{ width: `${total > 0 ? (failed / total) * 100 : 0}%` }}
        />
      </div>

      <div className="flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full inline-block" />
          {succeeded} geocoded
        </span>
        {failed > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-red-400 rounded-full inline-block" />
            {failed} failed
          </span>
        )}
        <span className="ml-auto font-semibold">{pct}%</span>
      </div>
    </div>
  );
}
