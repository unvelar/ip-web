import { useEffect, useRef, useState, type Ref } from "react";
import { Search, X } from "lucide-react";

export default function MonitoringSearch({ value, onChange, label, placeholder, inputRef, debounceMs = 0 }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  inputRef?: Ref<HTMLInputElement>;
  debounceMs?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);
  const latestChange = useRef(onChange);
  useEffect(() => { latestChange.current = onChange; }, [onChange]);
  if (previousValue !== value) {
    setPreviousValue(value);
    setDraft(value);
  }
  useEffect(() => {
    if (!debounceMs || draft.trim() === value) return;
    const timer = window.setTimeout(() => latestChange.current(draft.trim()), debounceMs);
    return () => window.clearTimeout(timer);
  }, [debounceMs, draft, value]);
  const text = debounceMs ? draft : value;
  return (
    <label className="monitoring-search">
      <Search size={16} aria-hidden />
      <input ref={inputRef} type="search" value={text} aria-label={label} placeholder={placeholder} onChange={(event) => debounceMs ? setDraft(event.target.value) : onChange(event.target.value)} />
      {text && <button type="button" aria-label="Clear search" onClick={() => { setDraft(""); onChange(""); }}><X size={14} aria-hidden /></button>}
    </label>
  );
}
