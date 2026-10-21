import { useEffect, useRef, useState } from "react";
import { Building2, Check, Copy, ExternalLink, Globe, IdCard, Mail, MapPin, MessageCircle, Phone, User } from "lucide-react";
import type { SellerContact } from "../../api/monitoring";
import "./sellerContacts.css";

const icons = {
  email: Mail, phone: Phone, whatsapp: MessageCircle, telegram: MessageCircle, wechat: MessageCircle,
  qq: MessageCircle, signal: MessageCircle, skype: MessageCircle, website: Globe, social: Globe,
  contact_name: User, business_name: Building2, address: MapPin, registration_id: IdCard, other: MessageCircle,
};

function safeHref(contact: SellerContact): string | undefined {
  if (!contact.url) return undefined;
  try {
    const url = new URL(contact.url);
    if ((url.protocol === "mailto:" && contact.kind === "email") || (url.protocol === "tel:" && contact.kind === "phone")) return contact.url;
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return contact.url;
  } catch { /* Invalid destinations remain copyable text. */ }
  return undefined;
}

function sourceHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return value;
  } catch { /* Source evidence still renders without a link. */ }
  return undefined;
}

function groups(contacts: SellerContact[]) {
  const result = new Map<string, SellerContact[]>();
  for (const contact of contacts) {
    const label = ["social", "registration_id", "other"].includes(contact.kind) ? contact.label.toLowerCase() : "";
    const value = ["phone", "whatsapp"].includes(contact.kind)
      ? contact.value.replace(/[\s().-]/g, "") : contact.value.trim().toLowerCase();
    const key = JSON.stringify([contact.kind, label, value]);
    const existing = result.get(key);
    if (existing) existing.push(contact);
    else result.set(key, [contact]);
  }
  return [...result.entries()].sort(([, a], [, b]) =>
    Object.keys(icons).indexOf(a[0].kind) - Object.keys(icons).indexOf(b[0].kind) || a[0].value.localeCompare(b[0].value));
}

export function SellerContacts({ contacts = [], compact = false }: { contacts?: SellerContact[]; compact?: boolean }) {
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reset.current) clearTimeout(reset.current); }, []);
  const Heading = compact ? "h3" : "h2";
  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setCopyError("");
      if (reset.current) clearTimeout(reset.current);
      reset.current = setTimeout(() => setCopied(""), 2000);
    } catch { setCopyError("Could not copy. Select the contact text to copy it."); }
  }
  return <section className={`seller-contacts${compact ? " seller-contacts-compact" : ""}`} aria-label="Contact and business details">
    <Heading className="seller-contacts-title">Contact &amp; business details</Heading>
    {contacts.length === 0 ? <p className="seller-contacts-empty">No public contact details have been captured for this seller yet.</p>
      : <ul className="seller-contacts-list">{groups(contacts).map(([key, observations]) => {
        const ordered = [...observations].sort((a, b) => b.observed_at.localeCompare(a.observed_at));
        const contact = ordered[0];
        const Icon = icons[contact.kind] ?? MessageCircle;
        const href = safeHref(contact);
        return <li key={key} className="seller-contact">
          <Icon size={16} className="seller-contact-icon" aria-hidden />
          <div className="seller-contact-content">
            <span className="seller-contact-label">{contact.label}</span>
            <div className="seller-contact-value-row">
              {href ? <a className="seller-contact-value" href={href} target="_blank" rel="noreferrer">{contact.value}<ExternalLink size={12} aria-hidden /></a>
                : <span className="seller-contact-value">{contact.value}</span>}
              <button type="button" className="seller-contact-copy" aria-label={`Copy ${contact.label}: ${contact.value}`} title={copied === key ? "Copied" : "Copy"} onClick={() => void copy(key, contact.value)}>
                {copied === key ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              </button>
            </div>
            <details className="seller-contact-evidence">
              <summary>{ordered.length === 1 ? "Source" : `${ordered.length} sources`}<span> · Seen {new Date(contact.observed_at).toLocaleDateString("en-GB", {day: "numeric", month: "short", year: "numeric"})}</span></summary>
              <ul>{ordered.map((source) => <li key={`${source.source_url}:${source.observed_at}`}>
                <a href={sourceHref(source.source_url)} target="_blank" rel="noreferrer">View source <ExternalLink size={11} aria-hidden /></a>
                <time dateTime={source.observed_at}>{new Date(source.observed_at).toLocaleString("en-GB", {day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"})}</time>
                <blockquote>{source.source_quote}</blockquote>
              </li>)}</ul>
            </details>
          </div>
        </li>;
      })}</ul>}
    <span className="sr-only" role="status">{copied ? "Contact copied" : ""}</span>
    {copyError && <p role="alert" className="seller-contact-error">{copyError}</p>}
  </section>;
}
