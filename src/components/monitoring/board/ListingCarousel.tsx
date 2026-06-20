import { type MouseEvent, useMemo, useState } from "react";
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

/** Hero-with-thumbstrip carousel for the listing's product photos. When
 *  `gallery_scores` is present (worker scored each photo against the IP), the
 *  best-matched image is the default hero, marked MATCHED, and each thumb
 *  shows its similarity %. Falls back to discovery `image_url` only when the
 *  gallery is empty. The page screenshot is rendered separately below. */
export function ListingCarousel({
  f,
  ipId,
  compact = false,
}: {
  f: IpReviewFinding;
  ipId?: string;
  compact?: boolean;
}) {
  const scored = useMemo(() => f.gallery_scores ?? [], [f.gallery_scores]);
  const scoredByUrl = new Map(scored.map((s) => [s.url, s.similarity]));
  // Per-URL bbox in gallery-image pixel coords from the worker's keypoint
  // localizer. Drawn as an SVG overlay on the hero so the reviewer can see
  // where on the photo the IP (logo/label) was found.
  const bboxByUrl = new Map(
    scored.filter((s) => s.bbox).map((s) => [s.url, s.bbox!]),
  );
  // Order: page screenshot first (when captured — wide page context the lawyer
  // anchors on), then scored gallery (best-matched first), then any unscored
  // gallery URL, then the discovery thumbnail. Dedupe by URL.
  const urls = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (u: string | null | undefined) => {
      if (u && !seen.has(u)) {
        out.push(u);
        seen.add(u);
      }
    };
    add(f.screenshot_url);
    for (const s of scored) add(s.url);
    for (const u of f.image_urls ?? []) add(u);
    add(f.image_url);
    return out;
  }, [f.screenshot_url, scored, f.image_urls, f.image_url]);

  const [idx, setIdx] = useState(0);
  const [allowingUrl, setAllowingUrl] = useState<string | null>(null);
  const [allowedUrls, setAllowedUrls] = useState<Set<string>>(new Set());
  const [zoomPos, setZoomPos] = useState<{ x: number; y: number } | null>(null);
  // Natural dimensions of the active hero image — needed so the SVG bbox
  // overlay (in pixel coords) lines up under the same `object-contain`
  // letterboxing as the <img>. Keyed by URL so switching slides invalidates a
  // stale measurement during render (no setState-in-effect). Switching finding
  // remounts the whole panel via the `key` on <FindingComparison>, so `idx`
  // resets to 0 on its own — no reset effect needed.
  const [natural, setNatural] = useState<{ url: string; w: number; h: number } | null>(null);

  const active = urls[Math.min(idx, urls.length - 1)];

  if (urls.length === 0) {
    return (
      <div className="w-full aspect-square bg-stone-50 border border-stone-200 rounded-lg flex items-center justify-center text-xs text-stone-400">
        No image
      </div>
    );
  }

  const activeSim = scoredByUrl.get(active);
  const activeBbox = bboxByUrl.get(active);
  const bestUrl = scored[0]?.url;
  // Only honor the measurement when it belongs to the current slide.
  const activeNatural = natural?.url === active ? natural : null;
  const canAllowImage = !!ipId && !!active && active !== f.screenshot_url && !f.dismissed_at;
  const activeAllowed = active ? allowedUrls.has(active) : false;
  const canZoomHero = !compact;

  function updateHeroZoom(e: MouseEvent<HTMLAnchorElement>) {
    if (!canZoomHero) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    setZoomPos({ x, y });
  }

  async function allowImageUrl(e: MouseEvent, imageUrl: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!ipId || !imageUrl || allowingUrl) return;
    setAllowingUrl(imageUrl);
    try {
      await allowIpFindingProductImage(ipId, f.result_id, { image_url: imageUrl });
      setAllowedUrls((prev) => new Set(prev).add(imageUrl));
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
        title={canZoomHero ? "Hover to zoom; click to open full size" : "Open full size"}
        onMouseEnter={canZoomHero ? updateHeroZoom : undefined}
        onMouseMove={canZoomHero ? updateHeroZoom : undefined}
        onMouseLeave={canZoomHero ? () => setZoomPos(null) : undefined}
        className={`block w-full aspect-square bg-stone-50 border border-stone-200 rounded-lg overflow-hidden relative ${
          compact ? "max-h-[300px]" : "max-h-[480px]"
        } ${canZoomHero ? "cursor-zoom-in" : ""}`}
      >
        <div
          className={`absolute inset-0 pointer-events-none ${
            canZoomHero
              ? "transition-transform duration-150 ease-out will-change-transform motion-reduce:transition-none"
              : ""
          }`}
          style={
            canZoomHero
              ? {
                  transform: zoomPos ? "scale(2.15)" : "scale(1)",
                  transformOrigin: zoomPos ? `${zoomPos.x}% ${zoomPos.y}%` : "50% 50%",
                }
              : undefined
          }
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
              active === bestUrl
                ? "bg-emerald-600 text-white"
                : "bg-stone-900/80 text-white"
            }`}
            title={`Similarity to the protected IP: ${Math.round(activeSim * 100)}%`}
          >
            {active === bestUrl ? "MATCHED · " : ""}
            {Math.round(activeSim * 100)}%
          </span>
        )}
        {urls.length > 1 && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-900/70 text-white">
            {idx + 1} / {urls.length}
          </span>
        )}
        {canAllowImage && (
          <button
            type="button"
            onClick={(e) => allowImageUrl(e, active)}
            disabled={!!allowingUrl || activeAllowed}
            title="Allow this product image — future similar images for this IP will be ignored"
            className={`absolute bottom-2 left-2 rounded-md font-semibold shadow-sm disabled:opacity-60 ${
              compact
                ? "px-1.5 py-1 text-[10px] bg-white/95 text-teal-700"
                : "px-2.5 py-1.5 text-xs bg-white/95 text-teal-700 hover:bg-teal-50"
            }`}
          >
            {allowingUrl === active ? "Queuing…" : activeAllowed ? "Ignored going forward" : compact ? "Allow" : "Allow this image"}
          </button>
        )}
      </a>
      {allowedUrls.size > 0 && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-2.5 py-2 text-xs font-medium text-teal-800">
          Similar products will be ignored going forward.
        </div>
      )}

      {/* Thumb strip — horizontal scroll on overflow, matched thumb framed emerald. */}
      {urls.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {urls.map((u, i) => {
            const sim = scoredByUrl.get(u);
            const isActive = i === idx;
            const isBest = u === bestUrl;
            return (
              <button
                key={`${u}-${i}`}
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={(e) => {
                  e.preventDefault();
                  setIdx(i);
                }}
                className={`relative shrink-0 ${compact ? "w-11 h-11" : "w-14 h-14"} rounded overflow-hidden border-2 transition-colors ${
                  isActive
                    ? "border-stone-900"
                    : isBest
                      ? "border-emerald-500"
                      : "border-stone-200 hover:border-stone-400"
                }`}
                title={sim != null ? `${Math.round(sim * 100)}% match` : undefined}
              >
                <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" />
                {sim != null && (
                  <span className="absolute bottom-0 right-0 px-1 py-px bg-stone-900/80 text-white text-[9px] font-bold leading-tight">
                    {Math.round(sim * 100)}
                  </span>
                )}
                {ipId && u !== f.screenshot_url && !f.dismissed_at && (
                  <span
                    onClick={(e) => allowImageUrl(e, u)}
                    className={`absolute top-0 left-0 px-1 py-px text-[9px] font-bold leading-tight rounded-br ${
                      allowedUrls.has(u)
                        ? "bg-teal-600 text-white"
                        : "bg-white/90 text-teal-700 hover:bg-teal-50"
                    }`}
                    title="Allow this individual product image"
                  >
                    {allowingUrl === u ? "..." : allowedUrls.has(u) ? "OK" : "Allow"}
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
