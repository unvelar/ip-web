import { Images } from "lucide-react";
import { useState } from "react";
import type { ProductClusterProfile } from "../../api/products";
import { profileTitle } from "../../components/product-clusters/productClusterGraphUtils";

export function ProductGroupPreviewImages({
  profiles,
  size = "compact",
}: {
  profiles: ProductClusterProfile[];
  size?: "compact" | "large";
}) {
  const [failedProfileKeys, setFailedProfileKeys] = useState<Set<string>>(new Set());
  const candidateProfiles = [...profiles]
    .sort((left, right) => Number(Boolean(right.image_url)) - Number(Boolean(left.image_url)));
  const visibleProfiles = candidateProfiles
    .filter((profile) =>
      !failedProfileKeys.has(`${profile.id}:${profile.image_url ?? ""}`)
    )
    .slice(0, 4);
  const cellClassName = size === "large"
    ? "aspect-square min-w-0 overflow-hidden rounded-lg bg-stone-100"
    : "h-12 w-12 overflow-hidden rounded-md bg-stone-100 sm:h-14 sm:w-14";
  return (
    <div className={size === "large"
      ? "grid grid-cols-4 gap-1.5"
      : "grid shrink-0 grid-cols-2 gap-1"}
    >
      {visibleProfiles.map((profile) => {
        const profileKey = `${profile.id}:${profile.image_url ?? ""}`;
        return (
          <div key={profileKey} className={cellClassName} title={profileTitle(profile)}>
            {profile.image_url ? (
              <img
                src={profile.image_url}
                alt={profileTitle(profile)}
                onError={() => {
                  setFailedProfileKeys((current) => {
                    const next = new Set(current);
                    next.add(profileKey);
                    return next;
                  });
                }}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm font-black text-stone-400">
                {profileTitle(profile).slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
        );
      })}
      {visibleProfiles.length === 0 && (
        <div className={`${cellClassName} flex items-center justify-center text-stone-400`}>
          <Images size={size === "large" ? 24 : 18} />
        </div>
      )}
    </div>
  );
}
