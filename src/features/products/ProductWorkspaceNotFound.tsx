import { Link } from "react-router-dom";

export function ProductWorkspaceNotFound() {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      <h2 className="text-lg font-black text-stone-950">Product not found</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
        This product is no longer in the current snapshot, or the link is out of date.
      </p>
      <Link
        to="/monitoring/products"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-stone-950 px-4 text-sm font-bold text-white"
      >
        Return to products
      </Link>
    </div>
  );
}
