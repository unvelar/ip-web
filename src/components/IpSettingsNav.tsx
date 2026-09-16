import { Layers3, Radar, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ipSettingsSection } from "../lib/ipSettingsNavigation";

const sections = [
  { key: "overview", label: "Overview", hash: "#overview", icon: Layers3 },
  { key: "monitoring", label: "Monitoring", hash: "#search", icon: Radar },
  { key: "protection", label: "Protection", hash: "#protection", icon: ShieldCheck },
] as const;

export default function IpSettingsNav() {
  const { pathname, hash } = useLocation();
  const active = ipSettingsSection(hash);
  return (
    <nav className="ip-section-nav" aria-label="IP settings sections">
      {sections.map(({ key, label, hash: targetHash, icon: Icon }) => (
        <Link key={key} to={`${pathname}${targetHash}`} className="ip-section-link" aria-current={active === key ? "page" : undefined}>
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
