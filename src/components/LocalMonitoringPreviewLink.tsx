import { Link } from 'react-router-dom';
import { localPreviewAvailable } from '../monitoring-workspace/localPreviewAvailability';

export default function LocalMonitoringPreviewLink({ to }: { to: '/monitoring/setup' | '/admin/marketplaces' }) {
  if (!localPreviewAvailable(location.hostname, import.meta.env.DEV)) return null;
  return <div className="mt-6 rounded-lg border border-stone-200 bg-white p-5">
    <h2 className="text-sm font-semibold text-stone-900">Try the new flow on localhost</h2>
    <p className="mt-2 text-sm text-stone-600">Open the working editor with sample data saved in the isolated local database.</p>
    <Link to={`${to}?preview=local`} className="mt-4 inline-flex rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700">Open local preview</Link>
  </div>;
}
