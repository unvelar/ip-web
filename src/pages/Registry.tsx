import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { listTrademarks, type Trademark } from "../api";
import BulkIngest from "../components/BulkIngest";


export default function Registry() {
  const [ips, setIps] = useState<Trademark[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const { trademarks } = await listTrademarks();
      setIps(trademarks);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Intellectual Properties</h1>
        <p className="mt-1 text-sm text-stone-500">
          Manage your intellectual property and the sources we monitor for infringements.
        </p>
      </div>

      {/* Section 1 — bulk ingest */}
      <BulkIngest />

      {/* Section 2 — IP list */}
      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-stone-900 tracking-tight">Your IPs</h2>
            <p className="mt-1 text-sm text-stone-500">
              Reference assets for every IP we protect on your behalf.
            </p>
          </div>
          <Link
            to="/ips/new"
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-stone-900 text-white hover:bg-stone-800"
          >
            New IP
          </Link>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : ips.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto">
              <span className="text-2xl">&#x1F50D;</span>
            </div>
            <p className="text-stone-500 text-sm">No IPs registered yet.</p>
            <p className="text-stone-400 text-xs">Add your first IP to start detecting infringement.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {ips.map((ip) => (
              <Link
                key={ip.id}
                to={`/ips/${ip.id}`}
                className="group bg-white rounded-2xl border border-stone-200 p-5 hover:border-stone-300 hover:shadow-lg hover:shadow-stone-100 transition-all block"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-stone-900 group-hover:text-red-700 transition-colors">{ip.name}</h3>
                    {ip.description && <p className="text-sm text-stone-500 mt-1">{ip.description}</p>}
                  </div>
                  <div className="text-right text-sm space-y-1">
                    <p className="text-stone-500">
                      {ip.image_count} ref{ip.image_count !== 1 ? "s" : ""}
                    </p>
                    <StatusBadge ip={ip} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ ip }: { ip: Trademark }) {
  if (ip.centroid_dino) {
    return <span className="inline-block text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">Indexed</span>;
  }
  if (ip.indexed_count > 0) {
    return <span className="inline-block text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full">Partial</span>;
  }
  return <span className="inline-block text-xs font-semibold text-stone-400 bg-stone-50 px-2.5 py-0.5 rounded-full">Pending</span>;
}
