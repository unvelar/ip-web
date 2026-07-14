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

type Position = { x: number; y: number };

interface ProductClusterGraphProps {
  profiles: ProductClusterProfile[];
  edges: ProductClusterEdge[];
  layoutEdges?: ProductClusterEdge[];
  mode: RelationshipMode;
  selectedEdgeId: string | null;
}

export default function ProductClusterGraphView({
  profiles,
  edges,
  layoutEdges = edges,
  mode,
  selectedEdgeId,
}: ProductClusterGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 520 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const width = Math.max(300, Math.round(container.getBoundingClientRect().width));
      setSize({ width, height: width < 640 ? 440 : 520 });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const positions = useMemo(
    () => buildPositions(profiles, layoutEdges, size.width, size.height),
    [profiles, layoutEdges, size],
  );
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedProfileIds = new Set(
    selectedEdge ? [selectedEdge.left_profile_id, selectedEdge.right_profile_id] : [],
  );
  const radius = size.width < 500 ? 18 : 24;
  const showAllLabels = profiles.length <= 18;

  return (
    <div ref={containerRef} className="relative min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <svg
        className="block w-full"
        style={{ height: size.height }}
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label={`Product relationship graph with ${profiles.length} listings and ${edges.length} visible relationships. Physical distance is approximate; edge scores are authoritative.`}
      >
        <defs>
          {profiles.map((profile) => {
            const position = positions.get(profile.id);
            if (!position) return null;
            return (
              <clipPath id={clipId(profile.id)} key={profile.id}>
                <circle cx={position.x} cy={position.y} r={radius - 2} />
              </clipPath>
            );
          })}
        </defs>

        <g aria-hidden="true">
          {edges.map((edge) => {
            const left = positions.get(edge.left_profile_id);
            const right = positions.get(edge.right_profile_id);
            if (!left || !right) return null;
            const score = scoreFor(edge, mode);
            const selected = edge.id === selectedEdgeId;
            return (
              <g key={edge.id}>
                <line
                  x1={left.x}
                  y1={left.y}
                  x2={right.x}
                  y2={right.y}
                  stroke={selected ? "#b91c1c" : "#a8a29e"}
                  strokeWidth={selected ? 3 + score * 3 : 0.75 + score * 2.5}
                  strokeOpacity={selected ? 0.95 : Math.max(0.2, score * 0.75)}
                  vectorEffect="non-scaling-stroke"
                />
                {selected && (
                  <text
                    x={(left.x + right.x) / 2}
                    y={(left.y + right.y) / 2 - 7}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#7f1d1d"
                    stroke="#ffffff"
                    strokeWidth={4}
                    paintOrder="stroke"
                  >
                    {score.toFixed(3)}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        <g>
          {profiles.map((profile) => {
            const position = positions.get(profile.id);
            if (!position) return null;
            const selected = selectedProfileIds.has(profile.id);
            const showLabel = showAllLabels || selected;
            return (
              <g key={profile.id}>
                <title>{profileTitle(profile)}</title>
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={radius}
                  fill="#f5f5f4"
                  stroke={selected ? "#b91c1c" : "#78716c"}
                  strokeWidth={selected ? 3 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
                {profile.image_url && (
                  <image
                    href={profile.image_url}
                    x={position.x - radius + 2}
                    y={position.y - radius + 2}
                    width={(radius - 2) * 2}
                    height={(radius - 2) * 2}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#${clipId(profile.id)})`}
                  />
                )}
                {showLabel && (
                  <text
                    x={position.x}
                    y={position.y + radius + 14}
                    textAnchor="middle"
                    fontSize={size.width < 500 ? 9 : 11}
                    fill="#292524"
                    stroke="#ffffff"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {truncate(profileTitle(profile), size.width < 500 ? 18 : 26)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 text-[11px] text-stone-500 shadow-sm backdrop-blur">
        Distance is approximate · inspect the exact edge score
      </div>
    </div>
  );
}

function buildPositions(
  profiles: ProductClusterProfile[],
  edges: ProductClusterEdge[],
  width: number,
  height: number,
) {
  const positions = new Map<string, Position>();
  if (profiles.length === 0) return positions;

  const centerX = width / 2;
  const centerY = height / 2;
  const orbit = Math.max(50, Math.min(width, height) * 0.34);
  const state = profiles.map((profile, index) => {
    const angle = (index / profiles.length) * Math.PI * 2 + hashFraction(profile.id) * 0.35;
    return {
      id: profile.id,
      x: centerX + Math.cos(angle) * orbit * (0.72 + hashFraction(`${profile.id}:r`) * 0.28),
      y: centerY + Math.sin(angle) * orbit * (0.72 + hashFraction(`${profile.id}:y`) * 0.28),
      vx: 0,
      vy: 0,
    };
  });
  const indexById = new Map(state.map((node, index) => [node.id, index]));
  const scale = Math.max(0.55, Math.min(1, width / 900));
  const margin = width < 500 ? 32 : 48;

  for (let iteration = 0; iteration < 150; iteration += 1) {
    const alpha = 1 - iteration / 150;
    const forces = state.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < state.length; i += 1) {
      for (let j = i + 1; j < state.length; j += 1) {
        let dx = state[j].x - state[i].x;
        let dy = state[j].y - state[i].y;
        let distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < 16) {
          dx += (hashFraction(`${state[i].id}:${state[j].id}`) - 0.5) * 8;
          dy += (hashFraction(`${state[j].id}:${state[i].id}`) - 0.5) * 8;
          distanceSquared = Math.max(16, dx * dx + dy * dy);
        }
        const distance = Math.sqrt(distanceSquared);
        const repulsion = (1200 * alpha) / distanceSquared;
        const forceX = (dx / distance) * repulsion;
        const forceY = (dy / distance) * repulsion;
        forces[i].x -= forceX;
        forces[i].y -= forceY;
        forces[j].x += forceX;
        forces[j].y += forceY;
      }
    }

    for (const edge of edges) {
      const leftIndex = indexById.get(edge.left_profile_id) ?? -1;
      const rightIndex = indexById.get(edge.right_profile_id) ?? -1;
      if (leftIndex < 0 || rightIndex < 0) continue;
      const left = state[leftIndex];
      const right = state[rightIndex];
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const score = Math.max(edge.same_product_score, edge.related_product_score);
      const desiredDistance = Math.max(52, (205 - score * 145) * scale);
      const strength = (0.012 + score * 0.025) * alpha;
      const pull = (distance - desiredDistance) * strength;
      const forceX = (dx / distance) * pull;
      const forceY = (dy / distance) * pull;
      forces[leftIndex].x += forceX;
      forces[leftIndex].y += forceY;
      forces[rightIndex].x -= forceX;
      forces[rightIndex].y -= forceY;
    }

    for (let i = 0; i < state.length; i += 1) {
      forces[i].x += (centerX - state[i].x) * 0.004 * alpha;
      forces[i].y += (centerY - state[i].y) * 0.004 * alpha;
      state[i].vx = (state[i].vx + forces[i].x) * 0.82;
      state[i].vy = (state[i].vy + forces[i].y) * 0.82;
      state[i].x = clamp(state[i].x + state[i].vx, margin, width - margin);
      state[i].y = clamp(state[i].y + state[i].vy, margin, height - margin - 20);
    }
  }

  for (const node of state) positions.set(node.id, { x: node.x, y: node.y });
  return positions;
}

function hashFraction(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clipId(profileId: string) {
  return `product-profile-${profileId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
