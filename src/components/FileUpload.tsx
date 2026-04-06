"use client";

import { useCallback, useState, useRef } from "react";
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react";
import clsx from "clsx";

interface Props {
  onFileAccepted: (file: File) => void;
}

const ACCEPTED = [".xlsx", ".xls", ".csv", ".ods"];

export default function FileUpload({ onFileAccepted }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ACCEPTED.includes(ext)) {
        setError(`Unsupported file type: ${ext}. Please upload ${ACCEPTED.join(", ")}`);
        return;
      }
      onFileAccepted(file);
    },
    [onFileAccepted]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="w-full max-w-xl">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          "border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all",
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 hover:border-blue-400 hover:bg-slate-50 bg-white"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          onChange={onInputChange}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-3">
          <div className={clsx(
            "w-14 h-14 rounded-xl flex items-center justify-center transition-colors",
            isDragging ? "bg-blue-100" : "bg-slate-100"
          )}>
            {isDragging ? (
              <FileSpreadsheet className="w-7 h-7 text-blue-600" />
            ) : (
              <Upload className="w-7 h-7 text-slate-500" />
            )}
          </div>
          <div>
            <p className="font-semibold text-slate-700">
              {isDragging ? "Drop your file here" : "Drag & drop your file here"}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              or <span className="text-blue-600 font-medium">click to browse</span>
            </p>
            <p className="text-slate-400 text-xs mt-2">
              Supported: .xlsx, .xls, .csv, .ods
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}
    </div>
  );
}
