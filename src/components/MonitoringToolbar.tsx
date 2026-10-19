import { useContext, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useActiveIp } from "../context/ActiveIpContext";
import { MonitoringToolbarContext } from "./MonitoringToolbarContext";
import "./MonitoringToolbar.css";

export default function MonitoringToolbar({ title, children, meta, actions, scopeControl, showStatus = true, onRefresh, refreshing = false, className = "" }: {
  title: string;
  children: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  scopeControl?: ReactNode;
  showStatus?: boolean;
  onRefresh: () => void;
  refreshing?: boolean;
  className?: string;
}) {
  const shell = useContext(MonitoringToolbarContext);
  const { activeIpId } = useActiveIp();
  return (
    <header className={`monitoring-toolbar ${className}`} aria-label={`${title} toolbar`}>
      <h1>{title}</h1>
      <div className="monitoring-toolbar-search">{children}</div>
      {meta && <div className="monitoring-toolbar-meta">{meta}</div>}
      {actions && <div className="monitoring-toolbar-actions">{actions}</div>}
      {shell && <>
        {showStatus && <div className="monitoring-toolbar-status">{activeIpId
          ? <Link to={`/monitoring/first-scan?ip_id=${encodeURIComponent(activeIpId)}`} aria-label="View live scan">{shell.status}</Link>
          : shell.status}</div>}
        <div className="monitoring-toolbar-scope">{scopeControl ?? shell.scope}{shell.notifications}</div>
      </>}
      <button type="button" className="monitoring-toolbar-refresh" onClick={onRefresh} disabled={refreshing} aria-label={`Refresh ${title === "Product Lab" ? "products" : title.toLowerCase()}`} title="Refresh">
        <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden />
      </button>
    </header>
  );
}
