import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SellerListings } from "../features/sellers/SellerListings";
import { SellerProfileHeader } from "../features/sellers/SellerProfileHeader";
import { sellerListingFilters, writeSellerListingFilters } from "../features/sellers/filters";
import "../features/sellers/sellers.css";

export default function SellerProfile() {
  const { sellerKey = "" } = useParams<{ sellerKey: string }>();
  const [params, setParams] = useSearchParams();
  const findingId = params.get("finding");
  const ipId = params.get("ip_id");
  return (
    <div className="sellers-page seller-profile-page">
      <Link to="/monitoring/sellers" className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900">
        <ArrowLeft size={14} /> Sellers
      </Link>
      <SellerListings
        key={sellerKey}
        sellerKey={sellerKey}
        ipId={ipId}
        activeFindingId={findingId}
        onActiveFindingChange={(value) => {
          const next = new URLSearchParams(params);
          if (value) next.set("finding", value); else next.delete("finding");
          setParams(next);
        }}
        filters={sellerListingFilters(params)}
        onFiltersChange={(filters) => setParams(writeSellerListingFilters(params, filters))}
        onIpChange={(value) => {
          const next = new URLSearchParams(params);
          if (value) next.set("ip_id", value); else next.delete("ip_id");
          setParams(next);
        }}
        renderHeader={(profile) => <SellerProfileHeader profile={profile} />}
      />
    </div>
  );
}
