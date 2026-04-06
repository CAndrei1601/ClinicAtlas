import type { RawRow } from "@/types";

interface Props {
  headers: string[];
  rows: RawRow[];
}

export default function DataPreview({ headers, rows }: Props) {
  if (rows.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-700 mb-2">
        Preview (first {rows.length} rows)
      </h4>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
              >
                {headers.map((h) => (
                  <td
                    key={h}
                    className="px-3 py-2 text-slate-700 max-w-[200px] truncate"
                    title={String(row[h] ?? "")}
                  >
                    {String(row[h] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
