import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ProductClusterEdge,
  ProductClusterProfile,
} from "../../api";
import {
  profileTitle,
  scoreFor,
  type RelationshipMode,
} from "./productClusterGraphUtils";

const MAX_VISIBLE_NEIGHBORS = 20;

interface ProductSimilarityRadialProps {
  reference: ProductClusterProfile;
  edges: ProductClusterEdge[];
  profileById: Map<string, ProductClusterProfile>;
  mode: RelationshipMode;
  selectedEdgeId: string | null;
  onSelectNeighbor: (profileId: string, edgeId: string) => void;
}

export default function ProductSimilarityRadial({
  reference,
  edges,
  profileById,
  mode,
  selectedEdgeId,
  onSelectNeighbor,
}: ProductSimilarityRadialProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const width = Math.max(300, Math.round(container.getBoundingClientRect().width));
      setSize({ width, height: width < 640 ? 460 : 560 });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const neighbors = useMemo(
    () => edges
      .map((edge) => {
        const profileId = edge.left_profile_id === reference.id
          ? edge.right_profile_id
          : edge.left_profile_id;
        const profile = profileById.get(profileId);
        return profile ? { edge, profile, score: scoreFor(edge, mode) } : null;
      })
      .filter((neighbor): neighbor is NonNullable<typeof neighbor> => neighbor != null)
      .slice(0, MAX_VISIBLE_NEIGHBORS),
    [edges, mode, profileById, reference.id],
  );
  const layout = useMemo(
    () => buildRadialLayout(neighbors, size.width, size.height),
    [neighbors, size],
  );
  const center = { x: size.width / 2, y: size.height / 2 };
  const nodeSize = size.width < 500 ? 38 : 48;

  return (
    <div
      ref={containerRef}
      className="relative min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white"
      style={{ height: size.height }}
    >
      <div className="absolute left-4 top-3 z-10">
        <p className="text-xs font-bold text-stone-800">Center = selected reference listing</p>
        <p className="mt-0.5 text-[11px] text-stone-500">
          Nearer means a higher {mode === "same" ? "same-product" : "related-product"} score
        </p>
      </div>

      <svg
        className="absolute inset-0 block h-full w-full"
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label={`Radial comparison of ${profileTitle(reference)} with ${neighbors.length} directly scored listings. Distance from the center represents the selected relationship score.`}
      >
        <g aria-hidden="true">
          {[0.9, 0.75, 0.5].map((score) => {
            const radius = distanceForScore(score, layout.minRadius, layout.maxRadius);
            return (
              <g key={score}>
                <circle
                  cx={center.x}
                  cy={center.y}
                  r={radius}
                  fill="none"
                  stroke="#d6d3d1"
                  strokeWidth="1"
                  strokeDasharray="3 5"
                />
                <text
                  x={center.x + 6}
                  y={center.y - radius + 13}
                  fill="#78716c"
                  fontSize="10"
                >
                  {score.toFixed(2)}
                </text>
              </g>
            );
          })}
          {layout.positions.map(({ edge, x, y, score }) => (
            <line
              key={edge.id}
              x1={center.x}
              y1={center.y}
              x2={x}
              y2={y}
              stroke={edge.id === selectedEdgeId ? "#b91c1c" : "#a8a29e"}
              strokeWidth={edge.id === selectedEdgeId ? 2.5 : 1.25}
              strokeOpacity={edge.id === selectedEdgeId ? 0.9 : 0.3 + score * 0.45}
            />
          ))}
        </g>
      </svg>

      <NodeButton
        profile={reference}
        size={nodeSize + 10}
        x={center.x}
        y={center.y}
        center
      />

      {layout.positions.map(({ edge, profile, score, x, y }) => (
        <NodeButton
          key={edge.id}
          profile={profile}
          score={score}
          size={nodeSize}
          x={x}
          y={y}
          selected={edge.id === selectedEdgeId}
          onClick={() => onSelectNeighbor(profile.id, edge.id)}
        />
      ))}

      {neighbors.length === 0 && (
        <p className="absolute bottom-12 left-1/2 w-64 -translate-x-1/2 text-center text-sm text-stone-500">
          No direct relationships meet the current confidence threshold.
        </p>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 text-[11px] text-stone-500 shadow-sm backdrop-blur">
        {edges.length > neighbors.length
          ? `Showing the strongest ${neighbors.length} of ${edges.length} direct relationships`
          : `${neighbors.length} direct relationship${neighbors.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}

function NodeButton({
  profile,
  size,
  x,
  y,
  score,
  selected = false,
  center = false,
  onClick,
}: {
  profile: ProductClusterProfile;
  size: number;
  x: number;
  y: number;
  score?: number;
  selected?: boolean;
  center?: boolean;
  onClick?: () => void;
}) {
  const title = profileTitle(profile);
  const content = (
    <>
      <span
        className={`block overflow-hidden rounded-full border-2 bg-stone-100 shadow-sm ${
          center || selected ? "border-red-700 ring-4 ring-red-100" : "border-white"
        }`}
        style={{ width: size, height: size }}
      >
        {profile.image_url ? (
          <img src={profile.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-xs font-bold text-stone-400">
            {title.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      {score != null && (
        <span className="absolute -right-2 -top-2 rounded-full border border-stone-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-stone-800 shadow-sm">
          {score.toFixed(2)}
        </span>
      )}
      {center && (
        <span className="absolute left-1/2 top-full mt-2 w-40 -translate-x-1/2 text-center">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-red-800">
            Reference
          </span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-stone-800">
            {title}
          </span>
        </span>
      )}
    </>
  );
  const style = {
    left: x,
    top: y,
    transform: "translate(-50%, -50%)",
  };

  if (!onClick) {
    return <div className="absolute z-10" style={style} title={title}>{content}</div>;
  }
  return (
    <button
      type="button"
      className="absolute z-10 rounded-full transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
      style={style}
      title={`Use as reference: ${title}`}
      aria-label={`Use ${title} as the reference listing${score == null ? "" : `, score ${score.toFixed(3)}`}`}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

interface Neighbor {
  edge: ProductClusterEdge;
  profile: ProductClusterProfile;
  score: number;
}

function buildRadialLayout(neighbors: Neighbor[], width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const minRadius = width < 500 ? 58 : 76;
  const maxRadius = Math.max(minRadius + 45, Math.min(width, height) / 2 - 42);
  const buckets: Neighbor[][] = [[], [], [], []];
  for (const neighbor of neighbors) {
    const bucket = neighbor.score >= 0.9
      ? 0
      : neighbor.score >= 0.75
        ? 1
        : neighbor.score >= 0.5
          ? 2
          : 3;
    buckets[bucket].push(neighbor);
  }

  const state = buckets.flatMap((bucket, bucketIndex) =>
    bucket.map((neighbor, index) => {
      const angle = -Math.PI / 2 + (index / bucket.length) * Math.PI * 2 + bucketIndex * 0.43;
      const radius = distanceForScore(neighbor.score, minRadius, maxRadius);
      return {
        ...neighbor,
        angle,
        radius,
      };
    }),
  );
  const minSeparation = width < 500 ? 44 : 58;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const angleForces = state.map(() => 0);
    for (let left = 0; left < state.length; left += 1) {
      for (let right = left + 1; right < state.length; right += 1) {
        const leftNode = state[left];
        const rightNode = state[right];
        const leftX = Math.cos(leftNode.angle) * leftNode.radius;
        const leftY = Math.sin(leftNode.angle) * leftNode.radius;
        const rightX = Math.cos(rightNode.angle) * rightNode.radius;
        const rightY = Math.sin(rightNode.angle) * rightNode.radius;
        const distance = Math.hypot(rightX - leftX, rightY - leftY);
        if (distance >= minSeparation) continue;
        const rawDelta = normalizeAngle(rightNode.angle - leftNode.angle);
        const direction = Math.abs(rawDelta) < 0.01
          ? (leftNode.edge.id < rightNode.edge.id ? 1 : -1)
          : Math.sign(rawDelta);
        const push = ((minSeparation - distance) / minSeparation) * 0.035;
        angleForces[left] -= direction * push;
        angleForces[right] += direction * push;
      }
    }
    for (let index = 0; index < state.length; index += 1) {
      state[index].angle += angleForces[index];
    }
  }
  const positions = state.map((neighbor) => ({
    ...neighbor,
    x: centerX + Math.cos(neighbor.angle) * neighbor.radius,
    y: centerY + Math.sin(neighbor.angle) * neighbor.radius,
  }));
  return { positions, minRadius, maxRadius };
}

function distanceForScore(score: number, minRadius: number, maxRadius: number) {
  const normalized = Math.max(0, Math.min(1, score));
  return minRadius + Math.pow(1 - normalized, 0.65) * (maxRadius - minRadius);
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
