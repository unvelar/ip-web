import { useState } from "react";
import type { IpReviewFinding } from "../../../api";
import {
  QTY_FALLBACK,
  actionabilityMeta,
  compactListingTitle,
  estimatedMarket,
  findingChips,
  findingStatusBadge,
  formatAgo,
  formatMoney,
  tableImageUrls,
} from "./utils";

function FindingTableThumbnail({
  urls,
  title,
}: {
  urls: string[];
  title: string;
}) {
  const [idx, setIdx] = useState(0);
  const src = urls[idx];

  if (!src) {
    return (
      <div
        className="h-12 w-12 min-w-12 rounded-md bg-stone-100 border border-stone-200"
        aria-label="No listing image"
      />
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="block h-12 w-12 min-w-12 rounded-md overflow-hidden border border-stone-200 bg-stone-100 hover:border-stone-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
      title="Open listing image"
    >
      <img
        src={src}
        alt={title ? `${title} listing image` : "Listing image"}
        className="block h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setIdx((current) => current + 1)}
      />
    </a>
  );
}

/** Table cells (columns 2-9) for one finding — a single dense line. The
 *  enclosing <tr> owns row selection and inspector activation. */
export function FindingRow({
  f,
  active,
  showIp,
}: {
  f: IpReviewFinding;
  active: boolean;
  showIp?: boolean;
}) {
  const similarity = f.similarity_score ?? f.enforcement_priority;
  const thumbUrls = tableImageUrls(f);
  const market = estimatedMarket(f);
  const sb = findingStatusBadge(f);
  const foundAgo = formatAgo(f.found_at) ?? "—";
  const updatedAgo = formatAgo(f.updated_at) ?? "—";
  const checkedAgo = formatAgo(f.last_checked_at);
  const title = compactListingTitle(f);
  const sellerLine = f.seller_name || "—";
  // Show the USD-normalized price so the Price column reads monotonically when
  // sorted (the sort key is USD across mixed currencies). Native price + est.
  // market live in the tooltip.
  const priceUsd =
    f.price_value_usd != null ? formatMoney(Number(f.price_value_usd), "USD") : null;
  const priceText = priceUsd ?? f.price ?? null;
  const chips = findingChips(f, showIp);
  const actionability = actionabilityMeta(f.actionability);

  return (
    <>
      {/* Similarity — secondary evidence; active marker owns row focus. */}
      <td className="py-1 px-2 align-middle whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`text-[10px] ${active ? "text-blue-600" : "text-stone-300"}`}
            aria-hidden
          >
            ▸
          </span>
          <span
            className="text-[10px] font-semibold tabular-nums rounded px-1 py-0.5 bg-stone-100 text-stone-500"
            title="Visual/text similarity"
          >
            {Number.isFinite(similarity) ? `${Math.round(similarity * 100)}%` : "—"}
          </span>
        </span>
      </td>

      {/* Thumbnail — fixed square so table layout cannot collapse the image. */}
      <td className="py-1.5 px-2 align-middle w-16">
        <FindingTableThumbnail urls={thumbUrls} title={title} />
      </td>

      {/* Listing — title + actionability badge + chips on one non-wrapping line. */}
      <td className="py-1 px-2 align-middle max-w-0 w-full">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className="font-semibold text-[13px] text-stone-900 truncate min-w-0">
            {title}
          </span>
          <span
            className={`shrink-0 px-1 py-0.5 rounded text-[9px] font-bold uppercase leading-none ${actionability.cls}`}
            title={actionability.reason}
          >
            {actionability.label}
          </span>
          {f.manual_candidate_outcome && (
            <span
              className="shrink-0 px-1 py-0.5 rounded text-[9px] font-bold uppercase leading-none bg-amber-100 text-amber-700"
              title="Manually moved during grouped triage"
            >
              Moved
            </span>
          )}
          {chips.slice(0, 3).map((chip) => (
            <span
              key={chip}
              className="shrink-0 px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[9px] font-semibold leading-none"
              title={chip}
            >
              {chip}
            </span>
          ))}
        </div>
      </td>

      {/* Seller. */}
      <td className="hidden md:table-cell py-1 px-2 align-middle max-w-[10rem] truncate text-[12px] text-stone-600">
        {sellerLine}
      </td>

      {/* Platform. */}
      <td className="hidden lg:table-cell py-1 px-2 align-middle whitespace-nowrap text-[12px] text-stone-600">
        {f.domain}
      </td>

      {/* Status. */}
      <td className="hidden sm:table-cell py-1 px-2 align-middle">
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${sb.cls}`}
        >
          {sb.label}
        </span>
      </td>

      {/* Price — listing price; tooltip carries the estimated unlicensed market. */}
      <td
        className="hidden md:table-cell py-1 px-2 align-middle text-right whitespace-nowrap text-[12px] font-semibold tabular-nums text-stone-800"
        title={
          [
            f.price ? `Listed ${f.price}` : null,
            market
              ? `Est. market ${formatMoney(market.value, market.currency)} (unit × qty ${f.quantity_available && f.quantity_available > 0 ? f.quantity_available : QTY_FALLBACK})`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No structured price yet"
        }
      >
        {priceText ?? <span className="text-stone-300">—</span>}
      </td>

      {/* Updated — reviewer-facing activity timestamp; tooltip carries context. */}
      <td
        className="py-1 px-2 align-middle text-right whitespace-nowrap text-[11px] text-stone-500 tabular-nums"
        title={[
          f.updated_at ? `Updated ${new Date(f.updated_at).toLocaleString()}` : null,
          `Found ${foundAgo}`,
          checkedAgo ? `Last checked ${checkedAgo}` : null,
        ].filter(Boolean).join(" · ")}
      >
        {updatedAgo}
      </td>
    </>
  );
}
