import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, Cpu, Inbox, Library, Monitor, Radar, type LucideIcon } from "lucide-react";
import "./AdminPage.css";

const sections = [
  { id: "monitoring", label: "Monitoring", to: "/admin/monitoring", icon: Radar },
  { id: "browser-activity", label: "Browser activity", to: "/admin/browser-activity", icon: Monitor },
  { id: "compute", label: "Compute", to: "/admin/compute", icon: Cpu },
  { id: "tenants", label: "Tenants", to: "/admin/tenants", icon: Building2 },
  { id: "intakes", label: "Public intakes", to: "/admin/intakes", icon: Inbox },
  { id: "catalog", label: "IP catalog", to: "/admin/ips", icon: Library },
] as const;

export function AdminPage({ section, title, description, meta, actions, image, back, wide = false, children }: {
  section: typeof sections[number]["id"];
  title: string;
  description: string;
  meta?: ReactNode;
  actions?: ReactNode;
  image?: string;
  back?: { to: string; label: string };
  wide?: boolean;
  children: ReactNode;
}) {
  const Icon = sections.find((item) => item.id === section)!.icon;
  return (
    <div className={`admin-page${wide ? " admin-page-wide" : ""}`}>
      <Link className="admin-back" to={back?.to ?? "/dashboard"}>
        <ArrowLeft size={14} aria-hidden="true" />{back?.label ?? "Back to workspace"}
      </Link>
      <header className="admin-page-header">
        <div className="admin-identity">
          <div className="admin-avatar">
            {image ? <img src={image} alt="" /> : <Icon size={25} aria-hidden="true" />}
          </div>
          <div className="admin-identity-copy">
            <p className="admin-eyebrow">Administration</p>
            <h1>{title}</h1>
            <p className="admin-description">{description}</p>
            {meta && <div className="admin-meta">{meta}</div>}
          </div>
        </div>
        {actions && <div className="admin-header-actions">{actions}</div>}
      </header>
      <nav className="admin-nav" aria-label="Admin sections">
        {sections.map(({ id, label, to, icon: SectionIcon }) => (
          <Link key={id} to={to} aria-current={section === id ? "page" : undefined}>
            <SectionIcon size={16} aria-hidden="true" />{label}
          </Link>
        ))}
      </nav>
      <div className="admin-body">{children}</div>
    </div>
  );
}

export function AdminSectionHeading({ icon: Icon, title, description, aside }: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="admin-section-heading">
      {Icon && <Icon size={17} aria-hidden="true" />}
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      {aside && <div className="admin-section-aside">{aside}</div>}
    </div>
  );
}
