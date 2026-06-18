import { useState } from "react";

type TileState = "idle" | "uploading" | "done";

export default function BulkIngest() {
  const [sheets, setSheets] = useState<TileState>("idle");
  const [docs, setDocs] = useState<TileState>("idle");
  const [drive, setDrive] = useState<"idle" | "connecting" | "connected">("idle");

  function fakeUpload(setter: (s: TileState) => void) {
    setter("uploading");
    setTimeout(() => setter("done"), 1400);
  }

  function fakeConnectDrive() {
    setDrive("connecting");
    setTimeout(() => setDrive("connected"), 1200);
  }

  return (
    <section className="bg-white rounded-2xl border border-stone-200 p-6 space-y-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-stone-900 tracking-tight">
              Bulk import from your systems
            </h2>
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
              Beta
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Let our agent scan your existing IP records — no manual entry.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tile
          title="Spreadsheets"
          subtitle="CSV, XLSX up to 50MB"
          icon="table"
          state={sheets}
          successText="3 files queued · agent extracting IPs"
          onClick={() => fakeUpload(setSheets)}
        />
        <Tile
          title="Documents"
          subtitle="PDF, DOCX, TXT"
          icon="doc"
          state={docs}
          successText="7 documents queued · agent extracting IPs"
          onClick={() => fakeUpload(setDocs)}
        />
        <DriveTile state={drive} onClick={fakeConnectDrive} />
      </div>

      <div className="pt-4 border-t border-stone-100">
        <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-3">
          Enterprise integrations
        </div>
        <div className="flex flex-wrap gap-2">
          {["Notion", "SharePoint", "Airtable", "Salesforce", "Custom API"].map((name) => (
            <span
              key={name}
              title="Coming soon"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-400 bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-full cursor-not-allowed hover:bg-stone-100 transition-colors"
            >
              <LockIcon />
              {name}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-stone-400">
          We plug into your internal systems and databases — no migration required.
        </p>
      </div>
    </section>
  );
}

function Tile({
  title,
  subtitle,
  icon,
  state,
  successText,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: "table" | "doc";
  state: TileState;
  successText: string;
  onClick: () => void;
}) {
  const isDone = state === "done";
  const isUploading = state === "uploading";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isUploading}
      className={`group relative text-left rounded-2xl border-2 border-dashed p-5 transition-all ${
        isDone
          ? "border-emerald-300 bg-emerald-50/40"
          : "border-stone-200 hover:border-red-400 hover:bg-red-50/30"
      } ${isUploading ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
            isDone ? "bg-emerald-100 text-emerald-600" : "bg-stone-100 text-stone-500 group-hover:bg-red-100 group-hover:text-red-600"
          } transition-colors`}
        >
          {icon === "table" ? <TableIcon /> : <DocIcon />}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-stone-900 text-sm">{title}</div>
          <div className="text-xs text-stone-500 mt-0.5">{subtitle}</div>
        </div>
      </div>
      <div className="mt-4 text-xs">
        {isUploading ? (
          <div className="flex items-center gap-2 text-stone-500">
            <div className="w-3 h-3 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
            Uploading...
          </div>
        ) : isDone ? (
          <div className="text-emerald-700 font-semibold">✓ {successText}</div>
        ) : (
          <div className="text-stone-400">Drop files here or click to browse</div>
        )}
      </div>
    </button>
  );
}

function DriveTile({
  state,
  onClick,
}: {
  state: "idle" | "connecting" | "connected";
  onClick: () => void;
}) {
  const isConnected = state === "connected";
  const isConnecting = state === "connecting";

  return (
    <div
      className={`rounded-2xl border-2 p-5 transition-all ${
        isConnected ? "border-emerald-300 bg-emerald-50/40" : "border-stone-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
            isConnected ? "bg-emerald-100 text-emerald-600" : "bg-stone-100 text-stone-500"
          }`}
        >
          <DriveIcon />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-stone-900 text-sm">Google Drive</div>
          <div className="text-xs text-stone-500 mt-0.5">
            Continuously sync a Drive folder
          </div>
        </div>
      </div>

      <div className="mt-4">
        {isConnected ? (
          <div className="space-y-2">
            <div className="text-xs text-emerald-700 font-semibold">
              ✓ Connected · scanning 1,247 files
            </div>
            <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
              <div className="h-full w-[62%] bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" />
            </div>
            <div className="text-[10px] text-emerald-600">62% indexed</div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClick}
            disabled={isConnecting}
            className="w-full px-3 py-2 bg-white text-stone-700 rounded-lg text-xs font-semibold border border-stone-200 hover:bg-stone-50 hover:border-stone-300 disabled:opacity-50 transition-all"
          >
            {isConnecting ? "Connecting..." : "Connect Drive"}
          </button>
        )}
      </div>
    </div>
  );
}

function TableIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M9 4v16M3 6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3l4.5 8 4.5-8M3 15l4.5-8M21 15l-4.5-8M3 15l4.5 6h9L21 15M3 15h18" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v4m-6 5h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-12V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}
