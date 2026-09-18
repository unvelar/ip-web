import { useId, useState } from "react";
import type { IpReviewFinding } from "../../../api";

export function ListingDescription({ finding: f }: { finding: IpReviewFinding }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const full = f.description_full_en || f.description_full;
  const description = full || f.description_summary;
  const canExpand = (description?.length ?? 0) > 180;
  const translated = f.description_full_en && f.description_full && f.description_full_en !== f.description_full;

  return (
    <section className="listing-description" aria-label="Listing description">
      <h4>{full ? "Listing description" : "Description summary"}{translated && <span> · Translated</span>}</h4>
      <p id={id} className={`text-sm text-stone-600 whitespace-pre-wrap ${canExpand && !expanded ? "line-clamp-4" : ""}`}>
        {description || "No description captured."}
      </p>
      {canExpand && <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>
        {expanded ? "Show less" : "Read full description"}
      </button>}
      {translated && <details className="text-xs text-stone-500">
        <summary>View original{f.description_language ? ` (${f.description_language.toUpperCase()})` : ""}</summary>
        <p className="whitespace-pre-wrap">{f.description_full}</p>
      </details>}
    </section>
  );
}
