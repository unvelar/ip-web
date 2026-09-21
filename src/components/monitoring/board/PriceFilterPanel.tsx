import { useId, useState } from "react";
import { X } from "lucide-react";
import { formatPriceBound, MAX_PRICE_BOUND, parsePriceBound } from "../../../lib/priceRange";
import "./PriceFilterPanel.css";

export interface PriceFilterPanelProps {
  min: number | null;
  max: number | null;
  bounds: { min: number | null; max: number | null; missing: number } | undefined;
  onClose?: () => void;
  onApply: (min: number | null, max: number | null) => void;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 2,
});
const isPrice = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_PRICE_BOUND;

function parsePrice(value: string): number | null {
  if (value.trim() === "") return null;
  return parsePriceBound(value) ?? NaN;
}

/** Mount when opened: incoming counts cannot move the slider underneath a draft. */
export function PriceFilterPanel({ min, max, bounds, onApply, onClose }: PriceFilterPanelProps) {
  const id = useId();
  const [initialBounds] = useState(bounds);
  const [minimum, setMinimum] = useState(() => min === null ? "" : isPrice(min) ? formatPriceBound(min) : String(min));
  const [maximum, setMaximum] = useState(() => max === null ? "" : isPrice(max) ? formatPriceBound(max) : String(max));
  const [badMinimum, setBadMinimum] = useState(false);
  const [badMaximum, setBadMaximum] = useState(false);
  const [scale, setScale] = useState(() => {
    const values = [bounds?.min, bounds?.max, min, max].filter(isPrice);
    // FX conversions can have fractional cents. Round the slider domain outward
    // so its cent-sized steps can reach a bound that includes every known price.
    return values.length ? {
      min: Math.floor(Math.min(...values) * 100) / 100,
      max: Math.ceil(Math.max(...values) * 100) / 100,
    } : null;
  });
  const parsedMin = parsePrice(minimum);
  const parsedMax = parsePrice(maximum);
  const invalidMinimum = badMinimum || (parsedMin !== null && !isPrice(parsedMin));
  const invalidMaximum = badMaximum || (parsedMax !== null && !isPrice(parsedMax));
  const reversed = isPrice(parsedMin) && isPrice(parsedMax) && parsedMin > parsedMax;
  const error = invalidMinimum || invalidMaximum
    ? "Enter a price from $0 to $1 trillion."
    : reversed ? "Minimum price must be no greater than maximum price." : null;
  const available = initialBounds !== undefined;
  const hasPrices = isPrice(initialBounds?.min) && isPrice(initialBounds?.max);
  const sliderEnabled = available && hasPrices && scale !== null && scale.min < scale.max;
  const lower = isPrice(parsedMin) ? parsedMin : scale?.min ?? 0;
  const upper = isPrice(parsedMax) ? parsedMax : scale?.max ?? 0;
  const scaleWidth = scale ? scale.max - scale.min : 0;
  const left = scaleWidth > 0 ? Math.max(0, Math.min(100, ((lower - scale!.min) / scaleWidth) * 100)) : 0;
  const right = scaleWidth > 0 ? Math.max(0, Math.min(100, ((upper - scale!.min) / scaleWidth) * 100)) : 100;
  const description = !available
    ? "Price filtering is not available yet."
    : !hasPrices ? "No listing prices are available in this view."
      : initialBounds.missing > 0
        ? `${initialBounds.missing.toLocaleString()} ${initialBounds.missing === 1 ? "listing has" : "listings have"} no price and will be excluded when a range is applied.`
        : "Only listings with a price are included when a range is applied.";

  function updateNumber(side: "min" | "max", value: string, badInput: boolean) {
    if (side === "min") { setMinimum(value); setBadMinimum(badInput); }
    else { setMaximum(value); setBadMaximum(badInput); }
    const parsed = parsePrice(value);
    if (isPrice(parsed)) {
      const lower = Math.floor(parsed * 100) / 100;
      const upper = Math.ceil(parsed * 100) / 100;
      setScale((previous) => previous
        ? { min: Math.min(previous.min, lower), max: Math.max(previous.max, upper) }
        : { min: lower, max: upper });
    }
  }

  return (
    <form className="price-filter-panel" aria-label="Price filter"
      onSubmit={(event) => {
        event.preventDefault();
        if (available && !error) onApply(parsedMin, parsedMax);
      }}>
      <div className="price-filter-heading">
        <h3>Price · USD</h3>
        {onClose && <button type="button" aria-label="Close filter options" onClick={onClose}><X size={16} aria-hidden /></button>}
      </div>
      {hasPrices && scale && (
        <div className="price-filter-range-wrap">
          <div className="price-filter-range" role="group" aria-label="Price range">
            <div className="price-filter-track" />
            {!reversed && <div className="price-filter-track price-filter-selected-track">
              <div className="price-filter-fill" style={{ left: `${left}%`, right: `${100 - right}%` }} />
            </div>}
            <input type="range" aria-label="Minimum price slider" aria-valuetext={parsedMin === null ? "No minimum" : usd.format(lower)}
              aria-describedby={`${id}-description`} min={scale.min} max={scale.max} step="0.01"
              value={Math.min(lower, upper)} disabled={!sliderEnabled}
              className={`price-filter-thumb ${left > 90 ? "z-20" : "z-10"}`}
              onInput={(event) => { setMinimum(formatPriceBound(Math.min(Number(event.currentTarget.value), upper))); setBadMinimum(false); }} />
            <input type="range" aria-label="Maximum price slider" aria-valuetext={parsedMax === null ? "No maximum" : usd.format(upper)}
              aria-describedby={`${id}-description`} min={scale.min} max={scale.max} step="0.01"
              value={Math.max(upper, lower)} disabled={!sliderEnabled}
              className="price-filter-thumb z-10"
              onInput={(event) => { setMaximum(formatPriceBound(Math.max(Number(event.currentTarget.value), lower))); setBadMaximum(false); }} />
          </div>
          <div className="price-filter-scale-labels">
            <span>{usd.format(scale.min)}</span><span>{usd.format(scale.max)}</span>
          </div>
        </div>
      )}
      <div className="price-filter-fields">
        <label className="price-filter-field" htmlFor={`${id}-min`}>
          Minimum price
          <div className="price-filter-input-wrap">
            <span className="price-filter-currency" aria-hidden="true">$</span>
            <input id={`${id}-min`} type="number" inputMode="decimal" min="0" max={MAX_PRICE_BOUND} step="any" placeholder="No minimum"
              value={minimum} disabled={!available} aria-invalid={invalidMinimum || reversed} aria-describedby={error ? `${id}-error` : `${id}-description`}
              className="price-filter-number"
              onInput={(event) => updateNumber("min", event.currentTarget.value, event.currentTarget.validity.badInput)} />
          </div>
        </label>
        <label className="price-filter-field" htmlFor={`${id}-max`}>
          Maximum price
          <div className="price-filter-input-wrap">
            <span className="price-filter-currency" aria-hidden="true">$</span>
            <input id={`${id}-max`} type="number" inputMode="decimal" min="0" max={MAX_PRICE_BOUND} step="any" placeholder="No maximum"
              value={maximum} disabled={!available} aria-invalid={invalidMaximum || reversed} aria-describedby={error ? `${id}-error` : `${id}-description`}
              className="price-filter-number"
              onInput={(event) => updateNumber("max", event.currentTarget.value, event.currentTarget.validity.badInput)} />
          </div>
        </label>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="price-filter-error">{error}</p>}
      <p id={`${id}-description`} className="price-filter-note">{description}</p>
      <div className="price-filter-actions">
        <button type="button" className="price-filter-clear"
          onClick={() => onApply(null, null)}>Clear price</button>
        <button type="submit" disabled={!available || !!error}
          className="price-filter-apply">Apply</button>
      </div>
    </form>
  );
}
