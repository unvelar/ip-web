import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, X } from "lucide-react";
import { allowIpFindingProductImage, type IpReviewFinding } from "../../../api";

/** Modern "detected region" overlay: four rounded corner brackets in an
 *  indigo→fuchsia gradient with a soft glow, plus a near-invisible fill tint
 *  inside the box. The brackets stay short relative to the bbox so they
 *  read as focal markers (not a frame), and the gradient + glow lift the
 *  feel from a "red rectangle" alarm to a quiet annotation. */
function BboxOverlay({
  naturalW,
  naturalH,
  bbox,
}: {
  naturalW: number;
  naturalH: number;
  bbox: [number, number, number, number];
}) {
  const [x, y, w, h] = bbox;
  const longSide = Math.max(naturalW, naturalH);
  // Scale visuals to the image's pixel space so they read the same regardless
  // of how the SVG is letterboxed by the surrounding container.
  const sw = Math.max(3, longSide / 220);
  const radius = Math.max(6, longSide / 120);
  const armLen = Math.max(Math.min(w, h) * 0.22, longSide / 35);
  const arm = Math.min(armLen, Math.min(w, h) / 2.2);
  const x2 = x + w;
  const y2 = y + h;
  // Path per corner: arm in along the long edge → quarter-arc → arm in along
  // the short edge. Stroke-linecap=round softens the cut ends.
  const corners = [
    // top-left
    `M ${x} ${y + arm} L ${x} ${y + radius} Q ${x} ${y} ${x + radius} ${y} L ${x + arm} ${y}`,
    // top-right
    `M ${x2 - arm} ${y} L ${x2 - radius} ${y} Q ${x2} ${y} ${x2} ${y + radius} L ${x2} ${y + arm}`,
    // bottom-right
    `M ${x2} ${y2 - arm} L ${x2} ${y2 - radius} Q ${x2} ${y2} ${x2 - radius} ${y2} L ${x2 - arm} ${y2}`,
    // bottom-left
    `M ${x + arm} ${y2} L ${x + radius} ${y2} Q ${x} ${y2} ${x} ${y2 - radius} L ${x} ${y2 - arm}`,
  ];
  return (
    <svg
      viewBox={`0 0 ${naturalW} ${naturalH}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      <defs>
        <linearGradient id="bbox-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="60%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <filter
          id="bbox-glow"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feGaussianBlur stdDeviation={sw * 1.2} result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Quiet area tint — same gradient, near-invisible. Rounded so the
          fill never escapes the corner brackets. */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
        fill="url(#bbox-grad)"
        fillOpacity={0.06}
      />
      <g
        stroke="url(#bbox-grad)"
        strokeWidth={sw}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#bbox-glow)"
      >
        {corners.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

const IMAGE_FILE_RE = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const RESIZE_PATH_SEGMENT_RE = /^(?:f\d{2,5}|\d{2,5}x\d{2,5}|[wh]\d{2,5})$/i;
const PRESENTATION_PATH_SEGMENT_RE = /^(?:thumbs?|thumbnails?|previews?)$/i;
const FILENAME_SIZE_SUFFIX_RE = /[-_]\d{2,5}x\d{2,5}$/i;
const TRANSFORM_FILENAME_RE = /^(?:(?:s|m|l|w|h|f|q|fit|fill|crop|resize|thumb|thumbnail|small|medium|large)[-_]?){1,3}\d{2,5}$/i;

/** Generic CDN identity: retain the object path while discarding only common
 * presentation transforms. No marketplace hostname or selector is special. */
function logicalImageKey(raw: string) {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = decodeURIComponent(parsed.pathname);
    if (!IMAGE_FILE_RE.test(path)) return `exact:${parsed.href}`;

    const segments = path
      .replace(/\/+$/, "")
      .split("/")
      .filter((segment) => !PRESENTATION_PATH_SEGMENT_RE.test(segment))
      .map((segment) => RESIZE_PATH_SEGMENT_RE.test(segment) ? "{size}" : segment);
    const filename = segments.at(-1) ?? "";
    const dot = filename.lastIndexOf(".");
    const stem = (dot > 0 ? filename.slice(0, dot) : filename)
      .replace(FILENAME_SIZE_SUFFIX_RE, "");
    segments[segments.length - 1] = TRANSFORM_FILENAME_RE.test(stem)
      ? "{size}"
      : stem;
    return `asset:${host}${segments.join("/")}`;
  } catch {
    return `exact:${raw}`;
  }
}

function imageResolutionHint(raw: string) {
  try {
    const path = decodeURIComponent(new URL(raw).pathname);
    const hints: number[] = [];
    for (const segment of path.replace(/\/+$/, "").split("/")) {
      if (!RESIZE_PATH_SEGMENT_RE.test(segment)) continue;
      hints.push(...(segment.match(/\d{2,5}/g) ?? []).map(Number));
    }
    const filename = path.split("/").at(-1) ?? "";
    const dot = filename.lastIndexOf(".");
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const suffix = stem.match(FILENAME_SIZE_SUFFIX_RE)?.[0];
    if (suffix) hints.push(...(suffix.match(/\d{2,5}/g) ?? []).map(Number));
    if (TRANSFORM_FILENAME_RE.test(stem)) {
      const trailing = stem.match(/\d{2,5}$/)?.[0];
      if (trailing) hints.push(Number(trailing));
    }
    return Math.max(0, ...hints);
  } catch {
    return 0;
  }
}

type GalleryItem = {
  key: string;
  url: string;
  sourceUrl: string | null;
  similarity?: number;
  bbox?: [number, number, number, number];
  isScreenshot: boolean;
  isBest: boolean;
};

function buildGalleryItems(f: IpReviewFinding): GalleryItem[] {
  const scored = f.gallery_scores ?? [];
  const scoreByUrl = new Map(scored.map((score) => [score.url, score]));
  const bestScoreByKey = new Map<string, (typeof scored)[number]>();
  for (const score of scored) {
    const key = logicalImageKey(score.url);
    const current = bestScoreByKey.get(key);
    if (!current || score.similarity > current.similarity) {
      bestScoreByKey.set(key, score);
    }
  }
  const bestLogicalKey = scored[0] ? logicalImageKey(scored[0].url) : null;

  type RawGroup = { sourceUrl: string; resolution: number };
  const rawByKey = new Map<string, RawGroup>();
  const rawOrder: string[] = [];
  const addRaw = (sourceUrl: string | null | undefined) => {
    if (!sourceUrl) return;
    const key = logicalImageKey(sourceUrl);
    const resolution = imageResolutionHint(sourceUrl);
    const current = rawByKey.get(key);
    if (!current) {
      rawByKey.set(key, { sourceUrl, resolution });
      rawOrder.push(key);
    } else if (resolution > current.resolution) {
      current.sourceUrl = sourceUrl;
      current.resolution = resolution;
    }
  };
  for (const score of scored) addRaw(score.url);
  for (const sourceUrl of f.image_urls ?? []) addRaw(sourceUrl);
  addRaw(f.image_url);

  type ArchivedImage = NonNullable<IpReviewFinding["archived_images"]>[number];
  const archiveByKey = new Map<string, ArchivedImage>();
  const archiveOrder: string[] = [];
  for (const archive of f.archived_images ?? []) {
    const key = logicalImageKey(archive.source_url ?? archive.url);
    const current = archiveByKey.get(key);
    if (!current) {
      archiveByKey.set(key, archive);
      archiveOrder.push(key);
    } else if (archive.width * archive.height > current.width * current.height) {
      archiveByKey.set(key, archive);
    }
  }

  const out: GalleryItem[] = [];
  if (f.screenshot_url) {
    out.push({
      key: `screenshot:${f.screenshot_url}`,
      url: f.screenshot_url,
      sourceUrl: null,
      isScreenshot: true,
      isBest: false,
    });
  }

  const usedArchiveKeys = new Set<string>();
  for (const key of rawOrder) {
    const raw = rawByKey.get(key)!;
    const archive = archiveByKey.get(key);
    if (archive) usedArchiveKeys.add(key);
    const sourceScore = scoreByUrl.get(raw.sourceUrl);
    out.push({
      key: `image:${key}`,
      url: archive?.url ?? raw.sourceUrl,
      sourceUrl: raw.sourceUrl,
      similarity: bestScoreByKey.get(key)?.similarity,
      bbox: archive ? undefined : sourceScore?.bbox,
      isScreenshot: false,
      isBest: key === bestLogicalKey,
    });
  }

  // Historical archived views that no longer appear in the current raw
  // gallery remain available once each, grouped by their original source.
  for (const key of archiveOrder) {
    if (usedArchiveKeys.has(key)) continue;
    const archive = archiveByKey.get(key)!;
    out.push({
      key: `archive:${key}`,
      url: archive.url,
      sourceUrl: archive.source_url,
      similarity: bestScoreByKey.get(key)?.similarity,
      isScreenshot: false,
      isBest: key === bestLogicalKey,
    });
  }

  // During a rolling deploy an older API may expose only unstructured archive
  // URLs without source identity. Use those only when there is no gallery to
  // replace; appending them recreates the duplicate-slide bug.
  if (rawOrder.length === 0 && archiveOrder.length === 0) {
    const seen = new Set<string>();
    for (const url of f.archived_image_urls ?? []) {
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({
        key: `legacy-archive:${url}`,
        url,
        sourceUrl: null,
        isScreenshot: false,
        isBest: false,
      });
    }
  }
  return out;
}

/** Hero-with-thumbstrip carousel for the listing's product photos. When
 *  `gallery_scores` is present (worker scored each photo against the IP), the
 *  best-matched photo is marked MATCHED and each thumb shows its similarity %.
 *  Archived copies replace their original sources instead of becoming extra
 *  slides. The page screenshot stays first as listing-level evidence. */
export function ListingCarousel({
  f,
  ipId,
  compact = false,
  initialView = "screenshot",
}: {
  f: IpReviewFinding;
  ipId?: string;
  compact?: boolean;
  initialView?: "screenshot" | "product";
}) {
  const items = useMemo(() => buildGalleryItems(f), [f]);

  const [idx, setIdx] = useState(() => initialView === "product"
    ? Math.max(0, items.findIndex((item) => !item.isScreenshot)) : 0);
  const [allowingUrl, setAllowingUrl] = useState<string | null>(null);
  const [allowedSourceUrls, setAllowedSourceUrls] = useState<Set<string>>(new Set());
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerZoom, setViewerZoom] = useState(1);
  const viewerRef = useRef<HTMLDialogElement>(null);
  const viewerImageRef = useRef<HTMLDivElement>(null);
  // Natural dimensions of the active hero image — needed so the SVG bbox
  // overlay (in pixel coords) lines up under the same `object-contain`
  // letterboxing as the <img>. Keyed by URL so switching slides invalidates a
  // stale measurement during render (no setState-in-effect). Switching finding
  // remounts the whole panel via the `key` on <FindingComparison>, so `idx`
  // resets to the initial view on its own — no reset effect needed.
  const [natural, setNatural] = useState<{ url: string; w: number; h: number } | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (viewerOpen && !viewer.open) viewer.showModal();
    if (!viewerOpen && viewer.open) viewer.close();
    return () => { if (viewer.open) viewer.close(); };
  }, [viewerOpen]);

  useEffect(() => {
    if (!viewerOpen) return;
    const frame = requestAnimationFrame(() => {
      const viewport = viewerImageRef.current;
      if (!viewport) return;
      viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
      viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [viewerOpen, viewerZoom, idx]);

  const activeItem = items[Math.min(idx, items.length - 1)];

  if (!activeItem) {
    return (
      <div className="w-full aspect-square bg-stone-50 border border-stone-200 rounded-lg flex items-center justify-center text-xs text-stone-400">
        No image
      </div>
    );
  }

  const active = activeItem.url;
  const activeSourceUrl = activeItem.sourceUrl;
  const activeSim = activeItem.similarity;
  const activeBbox = activeItem.bbox;
  // Only honor the measurement when it belongs to the current slide.
  const activeNatural = natural?.url === active ? natural : null;
  const canAllowImage = f.protected_term_assessment?.outcome !== "matched" && !!ipId && !!activeSourceUrl && !activeItem.isScreenshot &&
    !f.dismissed_at;
  const activeAllowed = activeSourceUrl
    ? allowedSourceUrls.has(activeSourceUrl)
    : false;
  const canZoomHero = !compact;

  async function allowImageUrl(e: MouseEvent, imageUrl: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!ipId || !imageUrl || allowingUrl) return;
    setAllowingUrl(imageUrl);
    try {
      await allowIpFindingProductImage(ipId, f.result_id, { image_url: imageUrl });
      setAllowedSourceUrls((prev) => new Set(prev).add(imageUrl));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to allow product image");
    } finally {
      setAllowingUrl(null);
    }
  }

  return (
    <div className="space-y-2">
      {/* Hero */}
      <a
        href={active}
        target="_blank"
        rel="noreferrer"
        aria-label={activeItem.isScreenshot ? "Enlarge listing screenshot" : `Enlarge product photo ${Math.min(idx, items.length - 1) + 1}`}
        title={canZoomHero ? "Click to inspect the full photo" : "Open full size"}
        onClick={compact ? undefined : (event) => {
          event.preventDefault();
          setViewerZoom(activeItem.isScreenshot ? 1 : 2);
          setViewerOpen(true);
        }}
        className={`block w-full aspect-square bg-stone-50 border border-stone-200 rounded-lg overflow-hidden relative ${
          compact ? "max-h-[300px]" : "max-h-[600px]"
        } ${canZoomHero ? "cursor-zoom-in" : ""}`}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={canZoomHero && !activeItem.isScreenshot ? { transform: "scale(1.7)" } : undefined}
        >
          <img
            src={active}
            alt=""
            className="w-full h-full object-contain"
            onLoad={(e) => {
              const img = e.currentTarget;
              setNatural({ url: active, w: img.naturalWidth, h: img.naturalHeight });
            }}
          />
          {activeBbox && activeNatural && (
            // SVG laid over the container with its viewBox = the image's natural
            // pixel space. Default preserveAspectRatio ("xMidYMid meet") matches
            // <img>'s `object-contain` letterboxing, so the overlay lands on the
            // same pixels regardless of the container's aspect ratio.
            <BboxOverlay
              naturalW={activeNatural.w}
              naturalH={activeNatural.h}
              bbox={activeBbox}
            />
          )}
        </div>
        {activeSim != null && (
          <span
            className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold ${
              activeItem.isBest
                ? "bg-emerald-600 text-white"
                : "bg-stone-900/80 text-white"
            }`}
            title={`Similarity to the protected IP: ${Math.round(activeSim * 100)}%`}
          >
            {activeItem.isBest ? "MATCHED · " : ""}
            {Math.round(activeSim * 100)}%
          </span>
        )}
        {!compact && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[10px] font-semibold text-stone-700 shadow-sm" aria-hidden="true">
            <Maximize2 size={11} /> View full photo
          </span>
        )}
        {items.length > 1 && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-900/70 text-white">
            {Math.min(idx, items.length - 1) + 1} / {items.length}
          </span>
        )}
        {canAllowImage && (
          <button
            type="button"
            onClick={(e) => allowImageUrl(e, activeSourceUrl!)}
            disabled={!!allowingUrl || activeAllowed}
            title="Allow this product image — future similar images for this IP will be ignored"
            className={`absolute bottom-2 left-2 rounded-md font-semibold shadow-sm disabled:opacity-60 ${
              compact
                ? "px-1.5 py-1 text-[10px] bg-white/95 text-teal-700"
                : "px-2.5 py-1.5 text-xs bg-white/95 text-teal-700 hover:bg-teal-50"
            }`}
          >
            {allowingUrl === activeSourceUrl ? "Queuing…" : activeAllowed ? "Ignored going forward" : compact ? "Allow" : "Allow this image"}
          </button>
        )}
      </a>
      {!compact && (
        <dialog
          ref={viewerRef}
          aria-label="Enlarged listing photo"
          aria-modal={viewerOpen ? "true" : undefined}
          onClose={() => setViewerOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" && idx > 0) {
              event.preventDefault();
              setIdx(idx - 1);
              setViewerZoom(items[idx - 1].isScreenshot ? 1 : 2);
            }
            if (event.key === "ArrowRight" && idx < items.length - 1) {
              event.preventDefault();
              setIdx(idx + 1);
              setViewerZoom(items[idx + 1].isScreenshot ? 1 : 2);
            }
          }}
          className="m-auto h-[min(96dvh,1000px)] w-[min(96vw,1200px)] max-h-none max-w-none overflow-hidden rounded-xl border border-stone-200 bg-white p-0 shadow-2xl backdrop:bg-stone-950/80"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-3 border-b border-stone-200 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900">
                {activeItem.isScreenshot ? "Listing screenshot" : "Product photo"}
                {items.length > 1 && ` · ${idx + 1} of ${items.length}`}
              </span>
              <div className="flex shrink-0 items-center gap-1 rounded-md border border-stone-200" aria-label="Image zoom">
                <button type="button" onClick={() => setViewerZoom((value) => Math.max(1, value - 0.5))} disabled={viewerZoom === 1}
                  className="rounded-l-md p-1.5 text-stone-600 hover:bg-stone-100 disabled:opacity-40" aria-label="Zoom out">
                  <Minus size={15} aria-hidden />
                </button>
                <span className="w-12 text-center text-xs tabular-nums text-stone-600">{Math.round(viewerZoom * 100)}%</span>
                <button type="button" onClick={() => setViewerZoom((value) => Math.min(4, value + 0.5))} disabled={viewerZoom === 4}
                  className="rounded-r-md p-1.5 text-stone-600 hover:bg-stone-100 disabled:opacity-40" aria-label="Zoom in">
                  <Plus size={15} aria-hidden />
                </button>
              </div>
              <button type="button" onClick={() => setViewerZoom(1)} className="shrink-0 text-xs font-medium text-stone-600 hover:underline">
                Fit
              </button>
              <a href={active} target="_blank" rel="noreferrer" className="text-xs font-medium text-stone-600 underline-offset-2 hover:underline">
                Open original
              </a>
              <button type="button" onClick={() => viewerRef.current?.close()} className="rounded-md p-1.5 text-stone-600 hover:bg-stone-100" aria-label="Close enlarged photo">
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="relative min-h-0 flex-1 bg-stone-100">
              <div ref={viewerImageRef} className="h-full overflow-auto p-4">
                <img src={active} alt={activeItem.isScreenshot ? "Enlarged listing screenshot" : "Enlarged product photo"}
                  className={viewerZoom === 1 ? "mx-auto h-full w-full object-contain" : "mx-auto block max-w-none object-contain"}
                  style={viewerZoom === 1 ? undefined : { height: `${viewerZoom * 100}%`, width: "auto" }} />
              </div>
              {items.length > 1 && (
                <>
                  <button type="button" onClick={() => {
                    const nextIndex = Math.max(0, idx - 1);
                    setIdx(nextIndex);
                    setViewerZoom(items[nextIndex].isScreenshot ? 1 : 2);
                  }} disabled={idx === 0}
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/95 p-2 text-stone-700 shadow-md hover:bg-white disabled:opacity-40"
                    aria-label="Previous photo"><ChevronLeft size={20} aria-hidden /></button>
                  <button type="button" onClick={() => {
                    const nextIndex = Math.min(items.length - 1, idx + 1);
                    setIdx(nextIndex);
                    setViewerZoom(items[nextIndex].isScreenshot ? 1 : 2);
                  }} disabled={idx === items.length - 1}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/95 p-2 text-stone-700 shadow-md hover:bg-white disabled:opacity-40"
                    aria-label="Next photo"><ChevronRight size={20} aria-hidden /></button>
                </>
              )}
            </div>
            {items.length > 1 && (
              <div className="flex shrink-0 justify-center gap-2 overflow-x-auto border-t border-stone-200 px-4 py-3">
                {items.map((item, imageIndex) => (
                  <button key={item.key} type="button" onClick={() => {
                    setIdx(imageIndex);
                    setViewerZoom(item.isScreenshot ? 1 : 2);
                  }}
                    aria-label={item.isScreenshot ? "View listing screenshot enlarged" : `View product photo ${imageIndex + 1} enlarged`}
                    aria-pressed={imageIndex === idx}
                    className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 ${imageIndex === idx ? "border-stone-900" : "border-stone-200 hover:border-stone-400"}`}>
                    <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </dialog>
      )}
      {allowedSourceUrls.size > 0 && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-2.5 py-2 text-xs font-medium text-teal-800">
          Similar products will be ignored going forward.
        </div>
      )}

      {/* Thumb strip — horizontal scroll on overflow, matched thumb framed emerald. */}
      {items.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {items.map((item, i) => {
            const sim = item.similarity;
            const isActive = i === idx;
            const sourceUrl = item.sourceUrl;
            return (
              <button
                key={item.key}
                type="button"
                aria-label={item.isScreenshot ? "View listing screenshot" : `View product photo ${i + 1}`}
                aria-pressed={isActive}
                onMouseEnter={() => setIdx(i)}
                onClick={(e) => {
                  e.preventDefault();
                  setIdx(i);
                }}
                className={`relative shrink-0 ${compact ? "w-11 h-11" : "w-14 h-14"} rounded overflow-hidden border-2 transition-colors ${
                  isActive
                    ? "border-stone-900"
                    : item.isBest
                      ? "border-emerald-500"
                      : "border-stone-200 hover:border-stone-400"
                }`}
                title={sim != null ? `${Math.round(sim * 100)}% match` : undefined}
              >
                <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                {sim != null && (
                  <span className="absolute bottom-0 right-0 px-1 py-px bg-stone-900/80 text-white text-[9px] font-bold leading-tight">
                    {Math.round(sim * 100)}
                  </span>
                )}
                {ipId && sourceUrl && !item.isScreenshot && !f.dismissed_at && (
                  <span
                    onClick={(e) => allowImageUrl(e, sourceUrl)}
                    className={`absolute top-0 left-0 px-1 py-px text-[9px] font-bold leading-tight rounded-br ${
                      allowedSourceUrls.has(sourceUrl)
                        ? "bg-teal-600 text-white"
                        : "bg-white/90 text-teal-700 hover:bg-teal-50"
                    }`}
                    title="Allow this individual product image"
                  >
                    {allowingUrl === sourceUrl ? "..." : allowedSourceUrls.has(sourceUrl) ? "OK" : "Allow"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
