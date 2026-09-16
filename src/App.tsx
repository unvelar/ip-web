import { lazy, Suspense } from "react";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { useAuth, stashReturnTo } from "./context/AuthContext";
import DeploymentUpdatePrompt from "./components/DeploymentUpdatePrompt";

const AppShell = lazy(() => import("./components/AppShell"));
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Registry = lazy(() => import("./pages/Registry"));
const RegistryDetail = lazy(() => import("./pages/RegistryDetail"));
const RegistryAudit = lazy(() => import("./pages/RegistryAudit"));
const RegistryWizard = lazy(() => import("./pages/RegistryWizard"));
const ClearanceReviewNew = lazy(() => import("./pages/ClearanceReviewNew"));
const ClearanceTasks = lazy(() => import("./pages/ClearanceTasks"));
const IpReviewDetail = lazy(() => import("./pages/IpReviewDetail"));
const Findings = lazy(() => import("./pages/Findings"));
const MonitoringTasks = lazy(() => import("./pages/MonitoringTasks"));
const MonitoringFirstScan = lazy(() => import("./pages/MonitoringFirstScan"));
const MonitoringCampaigns = lazy(() => import("./pages/MonitoringCampaigns"));
const ProductLab = lazy(() => import("./pages/ProductLabV2"));
const MonitoringNew = lazy(() => import("./pages/MonitoringNew"));
const Sellers = lazy(() => import("./pages/Sellers"));
const SellerProfile = lazy(() => import("./pages/SellerProfile"));
const Monitors = lazy(() => import("./pages/Monitors"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const BrandsCatalog = lazy(() => import("./pages/BrandsCatalog"));
const DesignsCatalog = lazy(() => import("./pages/DesignsCatalog"));
const PopCultureCatalog = lazy(() => import("./pages/PopCultureCatalog"));
const BrandSumup = lazy(() => import("./pages/BrandSumup"));
const PublicIntake = lazy(() => import("./pages/PublicIntake"));
const AdminCatalog = lazy(() => import("./pages/AdminCatalog"));
const AdminCompute = lazy(() => import("./pages/AdminCompute"));
const AdminIntakes = lazy(() => import("./pages/AdminIntakes"));
const AdminIpDetail = lazy(() => import("./pages/AdminIpDetail"));
const AdminTenants = lazy(() => import("./pages/AdminTenants"));
const AdminMonitoring = lazy(() => import("./pages/AdminMonitoring"));
const Settings = lazy(() => import("./pages/Settings"));
const Notifications = lazy(() => import("./pages/Notifications"));

function TrademarkRedirect() {
  const { id } = useParams();
  return <Navigate to={`/ips/${id}`} replace />;
}

function RegistryRedirect() {
  const { id } = useParams();
  return <Navigate to={`/ips/${id}`} replace />;
}

function RegistryAuditRedirect() {
  const { id } = useParams();
  return <Navigate to={`/ips/${id}/audit`} replace />;
}

function IpReviewRedirect() {
  const { id } = useParams();
  return <Navigate to={`/clearance/tasks/${id}`} replace />;
}

function LegacyProductRedirect() {
  const { groupId, taskId } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (groupId) params.set("group", groupId);
  params.delete("view");
  if (taskId) {
    params.set("finding", taskId);
    params.delete("panel");
  } else {
    params.set("panel", "settings");
    params.delete("finding");
  }
  const search = params.toString();
  return (
    <Navigate
      to={{
        pathname: "/monitoring/products",
        search: search ? `?${search}` : "",
        hash: location.hash,
      }}
      replace
    />
  );
}

function ProductLabV2Redirect() {
  const location = useLocation();
  return (
    <Navigate
      to={{
        pathname: "/monitoring/products",
        search: location.search,
        hash: location.hash,
      }}
      replace
    />
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) {
    stashReturnTo(location.pathname + location.search + location.hash);
    return <Navigate to="/login" />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) {
    stashReturnTo(location.pathname + location.search + location.hash);
    return <Navigate to="/login" />;
  }
  if (user.role !== "admin") {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-black text-stone-900">Admin access required</h1>
        <p className="mt-2 text-sm text-stone-500">
          Your account doesn't have the admin role. Ask your workspace owner to
          promote you, or run <code className="px-1 rounded bg-stone-100">
            scripts/promote_admin.sh
          </code> against the API.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const location = useLocation();
  return (
    <>
      <DeploymentUpdatePrompt />
      <RouteErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<div role="status" className="flex min-h-[60vh] items-center justify-center text-sm text-stone-500">Loading page…</div>}>
      <Routes>
        {/* Signed-in routes (AppShell layout) */}
        <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/ips" element={<Registry />} />
          <Route path="/ips/new" element={<RegistryWizard />} />
          <Route path="/ips/:id" element={<RegistryDetail />} />
          <Route path="/ips/:id/audit" element={<RegistryAudit />} />
          {/* Canonical task/admin entrypoints for each pipeline. */}
          <Route path="/monitoring/tasks" element={<MonitoringTasks />} />
          <Route path="/monitoring/tasks/:taskId" element={<MonitoringTasks />} />
          <Route path="/monitoring/first-scan" element={<MonitoringFirstScan />} />
          <Route path="/monitoring/campaigns" element={<MonitoringCampaigns />} />
          <Route path="/monitoring/campaigns/:campaignId" element={<MonitoringCampaigns />} />
          <Route path="/monitoring/sellers" element={<Sellers />} />
          <Route path="/monitoring/sellers/:sellerKey" element={<SellerProfile />} />
          <Route path="/monitoring/products" element={<ProductLab />} />
          <Route path="/monitoring/products/:groupId/tasks/:taskId" element={<LegacyProductRedirect />} />
          <Route path="/monitoring/products/:groupId" element={<LegacyProductRedirect />} />
          <Route path="/monitoring/products-v2" element={<ProductLabV2Redirect />} />
          <Route path="/monitoring/new" element={<MonitoringNew />} />
          <Route path="/monitoring/settings" element={<Monitors />} />
          <Route path="/clearance/tasks" element={<ClearanceTasks />} />
          <Route path="/clearance/tasks/:id" element={<IpReviewDetail />} />
          <Route path="/clearance/new" element={<ClearanceReviewNew />} />
          {/* Legacy routes — kept so dashboard KPI deep links + bookmarks keep
              landing somewhere; the components redirect to the canonical paths. */}
          <Route path="/findings" element={<Findings />} />
          <Route path="/monitors" element={<Navigate to="/monitoring/settings" replace />} />
          <Route path="/clearance" element={<Navigate to="/clearance/tasks" replace />} />
          <Route path="/ip-reviews/new" element={<Navigate to="/clearance/new" replace />} />
          <Route path="/ip-reviews/:id" element={<IpReviewRedirect />} />
          <Route path="/clearance/brands/catalog" element={<BrandsCatalog />} />
          <Route path="/clearance/designs/catalog" element={<DesignsCatalog />} />
          <Route path="/clearance/pop/catalog" element={<PopCultureCatalog />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/inbox" element={<Notifications />} />
        </Route>

        {/* Admin (separate gate, same shell) */}
        <Route element={<AdminRoute><AppShell /></AdminRoute>}>
          <Route path="/admin" element={<Navigate to="/admin/monitoring" replace />} />
          <Route path="/admin/compute" element={<AdminCompute />} />
          <Route path="/admin/intakes" element={<AdminIntakes />} />
          <Route path="/admin/tenants" element={<AdminTenants />} />
          <Route path="/admin/monitoring" element={<AdminMonitoring />} />
          <Route path="/admin/ips" element={<AdminCatalog />} />
          <Route path="/admin/ips/:id" element={<AdminIpDetail />} />
        </Route>

        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/monitor/start" element={<PublicIntake />} />
        <Route path="/brand-sumups/:tenantName/:ipName" element={<BrandSumup />} />

        {/* Redirects — preserve old URLs */}
        <Route path="/registry" element={<Navigate to="/ips" replace />} />
        <Route path="/registry/new" element={<Navigate to="/ips/new" replace />} />
        <Route path="/registry/:id" element={<RegistryRedirect />} />
        <Route path="/registry/:id/audit" element={<RegistryAuditRedirect />} />
        <Route path="/monitoring" element={<Navigate to="/monitoring/tasks" replace />} />
        <Route path="/trademarks" element={<Navigate to="/ips" replace />} />
        <Route path="/trademarks/:id" element={<TrademarkRedirect />} />
        <Route path="/ip-reviews" element={<Navigate to="/clearance/tasks" replace />} />
        <Route path="*" element={<div className="mx-auto max-w-xl px-6 py-16 text-center">
          <h1 className="text-2xl font-bold">Page not found</h1>
          <p className="mt-3 text-stone-500">This address doesn’t match an available page.</p>
          <a href={import.meta.env.BASE_URL} className="mt-6 inline-block font-semibold underline">Go to the home page</a>
        </div>} />
      </Routes>
      </Suspense>
      </RouteErrorBoundary>
    </>
  );
}
