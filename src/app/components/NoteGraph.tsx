import { useRef, useMemo, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceCollide } from 'd3-force-3d';
import { Note } from '../types/note';

interface Props {
  allNotes: Note[];
  centerNoteIds: string[];
  onNodeClick?: (noteId: string) => void;
  onNodeCtrlClick?: (noteId: string) => void;
  onNodeRightClick?: (noteId: string) => void;
  depth?: number;
  onDepthChange?: (depth: number) => void;
}

const CENTER_COLOR = '#34d399';
const DEPTH_COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa'];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function darkenHex(hex: string): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * 0.45);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * 0.45);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * 0.45);
  return `rgb(${r},${g},${b})`;
}

const SLIDER_H = 28;

function parseWikiLinks(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]|#\n]+?)(?:\|[^\]]+)?\]\]/g)].map(m => m[1].trim());
}

function decodeLinkTarget(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseMarkdownLinks(content: string): string[] {
  return [...content.matchAll(/(?<!!)\[([^\]\n]+)]\(([^)\n]+)\)/g)]
    .flatMap(match => {
      const label = match[1].trim();
      const rawTarget = match[2].trim().split(/[?#]/)[0];
      const target = decodeLinkTarget(rawTarget);
      return [target, stripMarkdownExt(target), label];
    })
    .filter(Boolean);
}

function parseFrontmatterLinks(content: string): string[] {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return [];

  const fm = match[1];
  const values: string[] = [];
  const fields = ['connect', 'connections', 'links', 'link', '連結'];
  const fieldPattern = fields.map(field => field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const blockRe = new RegExp(`^(${fieldPattern}):\\s*(.*)$`, 'gmi');
  let fieldMatch: RegExpExecArray | null;

  while ((fieldMatch = blockRe.exec(fm)) !== null) {
    const rest = fieldMatch[2].trim();
    const afterField = fm.slice(blockRe.lastIndex);
    const listMatch = afterField.match(/^\n((?:[ \t]+-[^\n]*\n?)*)/);

    if (rest.startsWith('[') && rest.endsWith(']')) {
      rest.slice(1, -1).split(',').forEach(item => values.push(item));
    } else if (rest) {
      values.push(rest);
    }

    if (listMatch?.[1]) {
      listMatch[1]
        .split('\n')
        .map(line => line.replace(/^[ \t]+-[ \t]*/, '').trim())
        .filter(Boolean)
        .forEach(item => values.push(item));
    }
  }

  return values
    .map(value => value.trim().replace(/^["']|["']$/g, ''))
    .flatMap(value => {
      const wikiLinks = parseWikiLinks(value);
      const markdownLinks = parseMarkdownLinks(value);
      if (wikiLinks.length > 0 || markdownLinks.length > 0) return [...wikiLinks, ...markdownLinks];
      return [value];
    })
    .map(value => value.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim())
    .filter(Boolean);
}

function noteName(id: string): string {
  return id.split('/').pop()?.replace(/\.md$/i, '') ?? id;
}

function stripMarkdownExt(value: string): string {
  return value.replace(/\.md$/i, '');
}

function normalizeLinkKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function wrapLabel(name: string, maxChars: number): string[] {
  if (name.length <= maxChars) return [name];
  const spaceIdx = name.lastIndexOf(' ', maxChars);
  let cut = maxChars;
  if (spaceIdx > Math.floor(maxChars / 2)) {
    const first = name.slice(0, spaceIdx);
    const rest = name.slice(spaceIdx + 1).trimStart();
    return [first, ...wrapLabel(rest, maxChars)];
  }
  if (/[a-zA-Z0-9]/.test(name[cut - 1]) && name[cut] && /[a-zA-Z0-9]/.test(name[cut])) {
    while (cut > 1 && /[a-zA-Z0-9]/.test(name[cut - 1])) cut--;
    if (cut === 0) cut = maxChars;
  }
  return [name.slice(0, cut).trimEnd(), ...wrapLabel(name.slice(cut).trimStart(), maxChars)];
}

type NodeLayout = {
  pillX: number;
  aly: number;
  lines: string[];
  r: number;
};

type RingPosition = {
  x: number;
  y: number;
  angle: number;
  ringRadius: number;
  label?: NodeLayout;
};

type LayoutObstacle = { x1: number; x2: number; y1: number; y2: number; isLabel: boolean };
type LayoutNodeLike = {
  id: string;
  name: string;
  depth: number;
  isCenter: boolean;
  x: number;
  y: number;
  ringRadius: number;
};

const LABEL_MAX_CHARS = 9;
const LABEL_PAD_X = 4;
const LABEL_PAD_Y = 2;
const LABEL_COLLISION_PAD = 10;
const FOCUSED_LABEL_COLLISION_PAD = 0;
const LABEL_BORDER_WIDTH = 1;
const LABEL_BLOCK_MIN_GAP = 1;
const LABEL_NODE_MIN_GAP = 6;

function nodeCircleRadius(depth: number, isCenter = false) {
  return isCenter ? 7 : Math.max(3, 6 - depth);
}

function labelMetrics(name: string, isCenter = false, compact = false) {
  const lines = wrapLabel(name, LABEL_MAX_CHARS);
  const fontSize = isCenter ? 9 : 7;
  const lineH = fontSize + 2;
  const textW = Math.max(...lines.map(line => line.length * (compact ? fontSize : isCenter ? 10 : 9)));
  const width = textW + LABEL_PAD_X;
  const height = lines.length * lineH + LABEL_PAD_Y + (compact ? 0 : 2);
  return { lines, fontSize, lineH, textW, width, height };
}

function labelArcRequirement(name: string, depth: number, isCenter = false) {
  const r = nodeCircleRadius(depth, isCenter);
  const metrics = labelMetrics(name, isCenter);
  return Math.max(
    2 * (r + 5) + 10,
    Math.min(metrics.width, 72) + LABEL_COLLISION_PAD,
    metrics.height + LABEL_COLLISION_PAD,
  );
}

function focusedLabelArcRequirement(name: string, depth: number, isCenter = false) {
  const metrics = labelMetrics(name, isCenter, true);
  return metrics.width + FOCUSED_LABEL_COLLISION_PAD + LABEL_BLOCK_MIN_GAP;
}

function boxesOverlap(a: { x1: number; x2: number; y1: number; y2: number }, b: { x1: number; x2: number; y1: number; y2: number }) {
  return a.x2 > b.x1 && a.x1 < b.x2 && a.y2 > b.y1 && a.y1 < b.y2;
}

function angularCandidates(baseAngle: number, count: number) {
  if (count <= 1) return [baseAngle];
  const sector = (Math.PI * 2) / count;
  const fractions = [0];

  for (let step = 1; step <= 24; step += 1) {
    const fraction = step * 0.02;
    fractions.push(-fraction, fraction);
  }

  return fractions.map(fraction => baseAngle + sector * fraction);
}

function placeLabel(node: LayoutNodeLike, obstacles: LayoutObstacle[], compact = false) {
  const r = nodeCircleRadius(node.depth, node.isCenter);
  const { lines, textW, lineH } = labelMetrics(node.name, node.isCenter, compact);
  const textH = lines.length * lineH;
  const bgPadX = LABEL_PAD_X / 2;
  const bgPadY = LABEL_PAD_Y / 2;
  const textHalfW = textW / 2;
  const textHalfH = textH / 2;
  const boxHalfW = textHalfW + bgPadX + LABEL_BORDER_WIDTH / 2;
  const boxHalfH = textHalfH + bgPadY + LABEL_BORDER_WIDTH / 2;
  const radius = Math.hypot(node.x, node.y);
  const inward = radius > 1
    ? { x: -node.x / radius, y: -node.y / radius }
    : { x: 0, y: 1 };
  const projectedBoxHalf = Math.abs(inward.x) * boxHalfW + Math.abs(inward.y) * boxHalfH;
  const labelCenterX = node.x + inward.x * (r + LABEL_NODE_MIN_GAP + projectedBoxHalf);
  const labelCenterY = node.y + inward.y * (r + LABEL_NODE_MIN_GAP + projectedBoxHalf);
  const textX = labelCenterX - textHalfW;
  const boxFromTextAnchor = (x: number, cy: number) => ({
    x1: x - bgPadX - LABEL_BORDER_WIDTH / 2,
    x2: x + textW + bgPadX + LABEL_BORDER_WIDTH / 2,
    y1: cy - textHalfH - bgPadY - LABEL_BORDER_WIDTH / 2,
    y2: cy + textHalfH + bgPadY + LABEL_BORDER_WIDTH / 2,
    cx: x + textW / 2,
    cy,
  });
  const circleBox = {
    x1: node.x - r,
    x2: node.x + r,
    y1: node.y - r,
    y2: node.y + r,
  };
  const nodeCollision = obstacles.some(ob => boxesOverlap(circleBox, ob));
  const hasOverlap = (box: ReturnType<typeof boxFromTextAnchor>) => (
    nodeCollision
    ||
    boxesOverlap(box, circleBox)
    || obstacles.some(ob => boxesOverlap(box, ob) || (ob.isLabel && boxesOverlap(circleBox, ob)))
  );
  const best = boxFromTextAnchor(textX, labelCenterY);
  const overlaps = hasOverlap(best);

  return {
    pillX: best.x1,
    aly: best.cy,
    lines,
    r,
    labelBox: {
      x1: best.x1 - LABEL_BLOCK_MIN_GAP,
      x2: best.x2 + LABEL_BLOCK_MIN_GAP,
      y1: best.y1 - LABEL_BLOCK_MIN_GAP,
      y2: best.y2 + LABEL_BLOCK_MIN_GAP,
      isLabel: true,
    },
    nodeBox: {
      x1: node.x - r,
      x2: node.x + r,
      y1: node.y - r,
      y2: node.y + r,
      isLabel: false,
    },
    overlaps,
  };
}

function ringPoint(angle: number, ringRadius: number): RingPosition {
  return {
    x: Math.cos(angle) * ringRadius,
    y: Math.sin(angle) * ringRadius,
    angle,
    ringRadius,
  };
}

function enforceFixedRingDistances(nodes: any[]) {
  let maxDelta = 0;
  let repaired = 0;

  nodes.forEach(node => {
    if (typeof node.angle !== 'number' || typeof node.ringRadius !== 'number') return;
    const expectedX = Math.cos(node.angle) * node.ringRadius;
    const expectedY = Math.sin(node.angle) * node.ringRadius;
    const currentDistance = Math.hypot(Number(node.x ?? 0), Number(node.y ?? 0));
    const delta = Math.abs(currentDistance - node.ringRadius);
    maxDelta = Math.max(maxDelta, delta);

    if (delta > 0.001 || Math.abs(Number(node.x ?? 0) - expectedX) > 0.001 || Math.abs(Number(node.y ?? 0) - expectedY) > 0.001) {
      node.x = expectedX;
      node.y = expectedY;
      node.fx = expectedX;
      node.fy = expectedY;
      node.vx = 0;
      node.vy = 0;
      repaired += 1;
    }
  });

  return { repaired, maxDelta };
}

function syncGraphNodePositions(fg: any, desiredNodes: any[]) {
  const desiredById = new Map(desiredNodes.map(node => [node.id, node]));
  const liveNodes = fg?.graphData?.()?.nodes ?? desiredNodes;

  liveNodes.forEach((node: any) => {
    const desired = desiredById.get(node.id);
    if (!desired) return;
    node.x = desired.x;
    node.y = desired.y;
    node.fx = desired.fx;
    node.fy = desired.fy;
    node.angle = desired.angle;
    node.ringRadius = desired.ringRadius;
    node.depth = desired.depth;
    node.isCenter = desired.isCenter;
    node.label = desired.label;
    node.name = desired.name;
    node.vx = 0;
    node.vy = 0;
  });

  return liveNodes;
}

function tryPlaceRingOnRadius(
  ring: string[],
  depth: number,
  radius: number,
  baseObstacles: LayoutObstacle[],
  centerSet: Set<string>,
  preferredAngles?: Map<string, number>,
  useAnchorAttraction = true,
) {
  const positions = new Map<string, RingPosition>();
  const startAngle = -Math.PI / 2;
  const sector = ring.length > 0 ? (Math.PI * 2) / ring.length : Math.PI * 2;
  const normalizeNear = (angle: number, anchor: number) => {
    let next = angle;
    while (next - anchor > Math.PI) next -= Math.PI * 2;
    while (next - anchor < -Math.PI) next += Math.PI * 2;
    return next;
  };
  const anchors = ring.map((id, index) => preferredAngles?.get(id) ?? startAngle + index * sector);
  const angles = anchors.map((angle, index) => (
    index === 0 ? angle : normalizeNear(angle, anchors[index - 1])
  ));

  const buildPlacements = () => ring.map((id, index) => {
    const pos = ringPoint(angles[index], radius);
    const placement = placeLabel({
      id,
      name: noteName(id),
      depth,
      isCenter: centerSet.has(id),
      x: pos.x,
      y: pos.y,
      ringRadius: pos.ringRadius,
    }, []);
    return { id, pos, placement };
  });

  const hasAnyOverlap = (items: ReturnType<typeof buildPlacements>) => {
    for (let i = 0; i < items.length; i += 1) {
      const a = items[i].placement;
      if (baseObstacles.some(ob => boxesOverlap(a.labelBox, ob) || boxesOverlap(a.nodeBox, ob))) return true;
      for (let j = i + 1; j < items.length; j += 1) {
        const b = items[j].placement;
        if (
          boxesOverlap(a.labelBox, b.labelBox)
          || boxesOverlap(a.labelBox, b.nodeBox)
          || boxesOverlap(a.nodeBox, b.labelBox)
          || boxesOverlap(a.nodeBox, b.nodeBox)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  for (let iteration = 0; iteration < 240; iteration += 1) {
    const items = buildPlacements();
    if (!hasAnyOverlap(items)) {
      items.forEach(item => positions.set(item.id, {
        ...item.pos,
        label: {
          pillX: item.placement.pillX,
          aly: item.placement.aly,
          lines: item.placement.lines,
          r: item.placement.r,
        },
      }));
      return {
        success: true,
        positions,
        obstacles: [...baseObstacles, ...items.flatMap(item => [item.placement.nodeBox, item.placement.labelBox])],
      };
    }

    const deltas = new Array(ring.length).fill(0);
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i].placement;
        const b = items[j].placement;
        if (
          boxesOverlap(a.labelBox, b.labelBox)
          || boxesOverlap(a.labelBox, b.nodeBox)
          || boxesOverlap(a.nodeBox, b.labelBox)
          || boxesOverlap(a.nodeBox, b.nodeBox)
        ) {
          const direction = normalizeNear(angles[j], angles[i]) >= angles[i] ? 1 : -1;
          const step = Math.min(0.035, sector * 0.08);
          deltas[i] -= direction * step;
          deltas[j] += direction * step;
        }
      }
      baseObstacles.forEach(ob => {
        const a = items[i].placement;
        if (boxesOverlap(a.labelBox, ob) || boxesOverlap(a.nodeBox, ob)) {
          const obstacleAngle = Math.atan2((ob.y1 + ob.y2) / 2, (ob.x1 + ob.x2) / 2);
          const direction = normalizeNear(angles[i], obstacleAngle) >= obstacleAngle ? 1 : -1;
          deltas[i] += direction * Math.min(0.035, sector * 0.08);
        }
      });
    }

    for (let index = 0; index < angles.length; index += 1) {
      const attraction = normalizeNear(anchors[index], angles[index]) - angles[index];
      angles[index] += deltas[index] + (useAnchorAttraction ? attraction * 0.035 : 0);
    }

    for (let index = 1; index < angles.length; index += 1) {
      if (angles[index] <= angles[index - 1] + 0.01) {
        angles[index] = angles[index - 1] + 0.01;
      }
    }
  }

  const items = buildPlacements();
  items.forEach(item => positions.set(item.id, {
    ...item.pos,
    label: {
      pillX: item.placement.pillX,
      aly: item.placement.aly,
      lines: item.placement.lines,
      r: item.placement.r,
    },
  }));
  return {
    success: false,
    positions,
    obstacles: [...baseObstacles, ...items.flatMap(item => [item.placement.nodeBox, item.placement.labelBox])],
  };
}

function countObstacleHits(a: LayoutObstacle, obstacles: LayoutObstacle[]) {
  return obstacles.reduce((total, ob) => total + (boxesOverlap(a, ob) ? 1 : 0), 0);
}

function angleDistance(a: number, b: number) {
  let delta = Math.abs(a - b) % (Math.PI * 2);
  if (delta > Math.PI) delta = Math.PI * 2 - delta;
  return delta;
}

function circularMean(angles: number[], fallback = -Math.PI / 2) {
  if (angles.length === 0) return fallback;
  const sin = angles.reduce((sum, angle) => sum + Math.sin(angle), 0);
  const cos = angles.reduce((sum, angle) => sum + Math.cos(angle), 0);
  if (Math.abs(sin) < 0.0001 && Math.abs(cos) < 0.0001) return fallback;
  return Math.atan2(sin, cos);
}

function ringOverlapScore(
  ring: string[],
  depth: number,
  ringPositions: Map<string, RingPosition>,
  baseObstacles: LayoutObstacle[],
  centerSet: Set<string>,
) {
  const items = ring
    .map(id => {
      const pos = ringPositions.get(id);
      if (!pos) return null;
      const placement = placeLabel({
        id,
        name: noteName(id),
        depth,
        isCenter: centerSet.has(id),
        x: pos.x,
        y: pos.y,
        ringRadius: pos.ringRadius,
      }, []);
      return { id, placement };
    })
    .filter((item): item is { id: string; placement: ReturnType<typeof placeLabel> } => Boolean(item));

  let score = 0;
  items.forEach(item => {
    baseObstacles.forEach(ob => {
      if (boxesOverlap(item.placement.labelBox, ob)) score += 1;
      if (boxesOverlap(item.placement.nodeBox, ob)) score += 2;
    });
  });

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i].placement;
      const b = items[j].placement;
      if (boxesOverlap(a.labelBox, b.labelBox)) score += 1;
      if (boxesOverlap(a.labelBox, b.nodeBox)) score += 2;
      if (boxesOverlap(a.nodeBox, b.labelBox)) score += 2;
      if (boxesOverlap(a.nodeBox, b.nodeBox)) score += 4;
    }
  }

  return score;
}

function relatedAnchorAngle(
  id: string,
  relatedMap: Map<string, Set<string>>,
  placedPositions: Map<string, RingPosition>,
  nodeParent: Map<string, string>,
) {
  const angles: number[] = [];

  relatedMap.get(id)?.forEach(relatedId => {
    const pos = placedPositions.get(relatedId);
    if (!pos) return;
    angles.push(pos.angle);
  });

  if (angles.length > 0) return circularMean(angles);

  const parentId = nodeParent.get(id);
  const parentPos = parentId ? placedPositions.get(parentId) : null;
  return parentPos?.angle ?? null;
}

function relatedAlignmentScore(
  ring: string[],
  ringPositions: Map<string, RingPosition>,
  relatedMap: Map<string, Set<string>>,
  nodeParent: Map<string, string>,
  placedPositions: Map<string, RingPosition>,
) {
  return ring.reduce((score, id) => {
    const pos = ringPositions.get(id);
    const anchorAngle = relatedAnchorAngle(id, relatedMap, placedPositions, nodeParent);
    if (!pos || anchorAngle === null) return score;
    return score + angleDistance(pos.angle, anchorAngle);
  }, 0);
}

function ringLayoutScore(
  ring: string[],
  depth: number,
  ringPositions: Map<string, RingPosition>,
  baseObstacles: LayoutObstacle[],
  centerSet: Set<string>,
  relatedMap: Map<string, Set<string>>,
  nodeParent: Map<string, string>,
  placedPositions: Map<string, RingPosition>,
) {
  return (
    ringOverlapScore(ring, depth, ringPositions, baseObstacles, centerSet) * 10000
    + relatedAlignmentScore(ring, ringPositions, relatedMap, nodeParent, placedPositions)
  );
}

function scoreRingOnRadius(
  ring: string[],
  depth: number,
  radius: number,
  baseObstacles: LayoutObstacle[],
  centerSet: Set<string>,
  preferredAngles?: Map<string, number>,
) {
  const positions = new Map<string, RingPosition>();
  const obstacles = [...baseObstacles];
  let score = 0;
  const startAngle = -Math.PI / 2;

  for (let index = 0; index < ring.length; index += 1) {
    const id = ring[index];
    const baseAngle = preferredAngles?.get(id) ?? startAngle + (index / Math.max(1, ring.length)) * Math.PI * 2;
    let best: { pos: RingPosition; placement: ReturnType<typeof placeLabel>; score: number } | null = null;

    for (const angle of angularCandidates(baseAngle, ring.length)) {
      const pos = ringPoint(angle, radius);
      const placement = placeLabel({
        id,
        name: noteName(id),
        depth,
        isCenter: centerSet.has(id),
        x: pos.x,
        y: pos.y,
        ringRadius: pos.ringRadius,
      }, obstacles);
      const candidateScore = countObstacleHits(placement.labelBox, obstacles)
        + countObstacleHits(placement.nodeBox, obstacles) * 2
        + (placement.overlaps ? 4 : 0);

      if (!best || candidateScore < best.score) {
        best = { pos, placement, score: candidateScore };
      }
    }

    if (!best) continue;
    score += best.score;
    positions.set(id, {
      ...best.pos,
      label: {
        pillX: best.placement.pillX,
        aly: best.placement.aly,
        lines: best.placement.lines,
        r: best.placement.r,
      },
    });
    obstacles.push(best.placement.nodeBox, best.placement.labelBox);
  }

  return { success: score === 0, positions, obstacles, score };
}

function placedRingRadius(positions: Map<string, RingPosition>) {
  return Math.max(0, ...[...positions.values()].map(pos => pos.ringRadius));
}

function buildPreferredAngles(
  ring: string[],
  nodeParent: Map<string, string>,
  positions: Map<string, RingPosition>,
  relatedMap: Map<string, Set<string>>,
  focusAngle: number | null,
  focusedSubtreeIds: Set<string>,
) {
  const grouped = new Map<string, string[]>();

  ring.forEach(id => {
    const parentId = nodeParent.get(id) ?? '__root__';
    if (!grouped.has(parentId)) grouped.set(parentId, []);
    grouped.get(parentId)!.push(id);
  });

  const preferred = new Map<string, number>();
  const globalSector = ring.length > 0 ? (Math.PI * 2) / ring.length : Math.PI * 2;

  grouped.forEach((ids, parentId) => {
    const parentPos = positions.get(parentId);
    const fallbackAngle = parentPos?.angle ?? -Math.PI / 2;
    const focusedIds = focusAngle === null ? [] : ids.filter(id => focusedSubtreeIds.has(id));
    if (focusedIds.length > 0) {
      const clusterWidth = Math.min(Math.PI * 0.22, Math.max(globalSector * Math.min(focusedIds.length, 2), globalSector * 0.45));
      const spacing = focusedIds.length <= 1 ? 0 : clusterWidth / (focusedIds.length - 1);
      const start = focusAngle - clusterWidth / 2;
      focusedIds.forEach((id, index) => {
        preferred.set(id, focusedIds.length <= 1 ? focusAngle : start + spacing * index);
      });
    }

    const regularIds = focusedIds.length > 0 ? ids.filter(id => !focusedSubtreeIds.has(id)) : ids;
    if (regularIds.length === 0) return;
    const centerAngle = circularMean(
      regularIds.map(id => relatedAnchorAngle(id, relatedMap, positions, nodeParent) ?? fallbackAngle),
      fallbackAngle,
    );
    const clusterWidth = Math.min(Math.PI * 0.38, Math.max(globalSector * Math.min(regularIds.length, 3), globalSector * 0.7));
    const spacing = regularIds.length <= 1 ? 0 : clusterWidth / (regularIds.length - 1);
    const start = centerAngle - clusterWidth / 2;

    regularIds.forEach((id, index) => {
      preferred.set(id, regularIds.length <= 1 ? centerAngle : start + spacing * index);
    });
  });

  return preferred;
}

function forceFocusedSubtreeSide<T extends { positions: Map<string, RingPosition> }>(
  layout: T,
  ring: string[],
  depth: number,
  centerSet: Set<string>,
  focusAngle: number | null,
  focusedSubtreeIds: Set<string>,
  baseObstacles: LayoutObstacle[],
) {
  if (focusAngle === null || focusedSubtreeIds.size === 0) return layout;

  const focusedIds = ring.filter(id => focusedSubtreeIds.has(id));

  const radius = placedRingRadius(layout.positions);
  const nextPositions = new Map(layout.positions);
  const obstacles = [...baseObstacles];
  const regularIds = ring.filter(id => !focusedSubtreeIds.has(id));
  const globalSector = ring.length > 0 ? (Math.PI * 2) / ring.length : Math.PI * 2;
  const focusedArcWidths = focusedIds.map(id => (
    focusedLabelArcRequirement(noteName(id), depth, centerSet.has(id)) / Math.max(1, radius)
  ));
  const focusedArcBudget = focusedArcWidths.reduce((sum, width) => sum + width, 0);
  const packedFocusWidth = Math.min(
    regularIds.length > 0 ? Math.PI * 1.7 : Math.PI * 2,
    Math.max(
      focusedArcBudget,
      focusedIds.length === 0 ? globalSector * 1.2 : 0,
    ),
  );
  const focusStart = focusAngle - packedFocusWidth / 2;
  const focusEnd = focusAngle + packedFocusWidth / 2;
  const regularSpan = Math.max(0.01, Math.PI * 2 - packedFocusWidth);
  const regularStart = focusEnd + (regularIds.length > 0 ? regularSpan / (regularIds.length + 1) : 0);
  const openSpacing = regularIds.length <= 1 ? 0 : regularSpan / (regularIds.length + 1);
  const candidateOffsets = [0];
  const focusedTargets: { id: string; targetAngle: number }[] = [];
  let focusCursor = focusStart;

  focusedIds.forEach((id, index) => {
    const width = focusedArcWidths[index] ?? 0;
    focusedTargets.push({
      id,
      targetAngle: focusedIds.length <= 1 ? focusAngle : focusCursor + width / 2,
    });
    focusCursor += width;
  });

  for (let step = 1; step <= 180; step += 1) {
    const offset = step * 0.018;
    candidateOffsets.push(-offset, offset);
  }

  const placeIds = [
    ...focusedTargets,
    ...regularIds.map((id, index) => ({
      id,
      targetAngle: regularIds.length <= 1 ? focusAngle + Math.PI : regularStart + openSpacing * index,
    })),
  ];

  placeIds.forEach(({ id, targetAngle }, index) => {
    const isFocused = index < focusedIds.length;
    let best: { pos: RingPosition; placement: ReturnType<typeof placeLabel>; score: number } | null = null;

    candidateOffsets.forEach(offset => {
      const angle = targetAngle + offset;
      const pos = ringPoint(angle, radius);
      const placement = placeLabel({
        id,
        name: noteName(id),
        depth,
        isCenter: centerSet.has(id),
        x: pos.x,
        y: pos.y,
        ringRadius: pos.ringRadius,
      }, obstacles, isFocused);
      const overlapScore = countObstacleHits(placement.labelBox, obstacles)
        + countObstacleHits(placement.nodeBox, obstacles) * 3
        + (placement.overlaps ? 6 : 0);
      const protectedSectorPenalty = !isFocused && angleDistance(angle, focusAngle) < packedFocusWidth / 2
        ? 10000000
        : 0;
      const score = protectedSectorPenalty
        + overlapScore * 100000
        + angleDistance(angle, targetAngle) * (isFocused ? 1 : 0.2);

      if (!best || score < best.score) {
        best = { pos, placement, score };
      }
    });

    if (!best) return;
    nextPositions.set(id, {
      ...best.pos,
      label: {
        pillX: best.placement.pillX,
        aly: best.placement.aly,
        lines: best.placement.lines,
        r: best.placement.r,
      },
    });
    obstacles.push(best.placement.nodeBox, best.placement.labelBox);
  });

  return { ...layout, positions: nextPositions };
}

function placeRingFallback(
  ring: string[],
  depth: number,
  radius: number,
  baseObstacles: LayoutObstacle[],
  centerSet: Set<string>,
  preferredAngles?: Map<string, number>,
) {
  const positions = new Map<string, RingPosition>();
  const obstacles = [...baseObstacles];

  ring.forEach((id, index) => {
    const angle = preferredAngles?.get(id) ?? -Math.PI / 2 + (index / Math.max(1, ring.length)) * Math.PI * 2;
    const pos = ringPoint(angle, radius);
    const placement = placeLabel({
      id,
      name: noteName(id),
      depth,
      isCenter: centerSet.has(id),
      x: pos.x,
      y: pos.y,
      ringRadius: pos.ringRadius,
    }, obstacles);

    positions.set(id, {
      ...pos,
      label: {
        pillX: placement.pillX,
        aly: placement.aly,
        lines: placement.lines,
        r: placement.r,
      },
    });
    obstacles.push(placement.nodeBox, placement.labelBox);
  });

  return { success: false, positions, obstacles };
}

export function NoteGraph({ allNotes, centerNoteIds, onNodeClick, onNodeCtrlClick, onNodeRightClick, depth, onDepthChange }: Props) {
  const graphRef = useRef<any>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const prevCenterKeyRef = useRef<string>('');
  const nodeLayouts = useRef<Map<string, NodeLayout>>(new Map());
  const engineRunning = useRef(true);
  const isDragging = useRef(false);
  const savedPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const savedAngles = useRef<Map<string, number>>(new Map());
  const focusLayoutRequest = useRef<string | null>(null);
  const [dims, setDims] = useState({ width: 440, height: 300 });
  const [internalSliderDepth, setInternalSliderDepth] = useState(1);
  const sliderDepth = depth ?? internalSliderDepth;
  const setSliderDepth = onDepthChange ?? setInternalSliderDepth;
  const [computedDepth, setComputedDepth] = useState(1);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [graphVisible, setGraphVisible] = useState(false);
  const needsRevealRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setComputedDepth(sliderDepth), 300);
    return () => clearTimeout(t);
  }, [sliderDepth]);

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nameToId, noteIds } = useMemo(() => {
    const nameToId = new Map<string, string>();
    const noteIds = new Set<string>();
    const addKey = (key: string | undefined, id: string) => {
      const normalized = key?.trim().toLowerCase();
      if (normalized && !nameToId.has(normalized)) nameToId.set(normalized, id);
    };

    allNotes.forEach(n => {
      noteIds.add(n.id);
      addKey(n.id, n.id);
      addKey(stripMarkdownExt(n.id), n.id);
      addKey(noteName(n.id), n.id);
      addKey(n.title, n.id);
      addKey(stripMarkdownExt(n.title), n.id);
    });
    return { nameToId, noteIds };
  }, [allNotes]);

  const outMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    allNotes.forEach(n => {
      const targets = new Set<string>();
      parseWikiLinks(n.content).forEach(name => {
        const key = normalizeLinkKey(name);
        const tid = key ? nameToId.get(key) : undefined;
        if (tid && tid !== n.id) targets.add(tid);
      });
      parseMarkdownLinks(n.content).forEach(name => {
        const key = normalizeLinkKey(name);
        const tid = key ? nameToId.get(key) : undefined;
        if (tid && tid !== n.id) targets.add(tid);
      });
      parseFrontmatterLinks(n.content).forEach(name => {
        const key = normalizeLinkKey(name);
        const tid = key ? nameToId.get(key) : undefined;
        if (tid && tid !== n.id) targets.add(tid);
      });
      n.links?.forEach(linkId => {
        const key = normalizeLinkKey(linkId);
        const tid = typeof linkId === 'string' && noteIds.has(linkId)
          ? linkId
          : key
            ? nameToId.get(key)
            : undefined;
        if (tid && tid !== n.id) targets.add(tid);
      });
      m.set(n.id, targets);
    });
    return m;
  }, [allNotes, nameToId, noteIds]);

  const inMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    outMap.forEach((targets, src) => {
      targets.forEach(tid => {
        if (!m.has(tid)) m.set(tid, new Set());
        m.get(tid)!.add(src);
      });
    });
    return m;
  }, [outMap]);

  const centerSet = useMemo(() => new Set(centerNoteIds), [centerNoteIds]);

  const graphData = useMemo(() => {
    const validCenterNoteIds = centerNoteIds.filter(id => noteIds.has(id));
    if (validCenterNoteIds.length === 0) return { nodes: [], links: [], childMap: {} };
    const centerKey = validCenterNoteIds.join('\x00');
    if (prevCenterKeyRef.current !== centerKey) {
      prevCenterKeyRef.current = centerKey;
      savedAngles.current = new Map();
      focusLayoutRequest.current = null;
    }

    const nodeDepths = new Map<string, number>();
    const nodeParent = new Map<string, string>(); // child → BFS-parent, used for angular layout
    validCenterNoteIds.forEach(id => nodeDepths.set(id, 0));
    let frontier = [...validCenterNoteIds];

    for (let d = 1; d <= computedDepth; d++) {
      const next: string[] = [];
      for (const nodeId of frontier) {
        outMap.get(nodeId)?.forEach(tid => {
          if (!nodeDepths.has(tid)) {
            nodeDepths.set(tid, d);
            nodeParent.set(tid, nodeId);
            next.push(tid);
          }
        });
        inMap.get(nodeId)?.forEach(src => {
          if (!nodeDepths.has(src)) {
            nodeDepths.set(src, d);
            nodeParent.set(src, nodeId);
            next.push(src);
          }
        });
      }
      frontier = next;
      if (frontier.length === 0) break;
    }

    const visibleIds = new Set(nodeDepths.keys());
    const relatedMap = new Map<string, Set<string>>();
    const addRelated = (a: string, b: string) => {
      if (!visibleIds.has(a) || !visibleIds.has(b)) return;
      if (!relatedMap.has(a)) relatedMap.set(a, new Set());
      if (!relatedMap.has(b)) relatedMap.set(b, new Set());
      relatedMap.get(a)!.add(b);
      relatedMap.get(b)!.add(a);
    };
    visibleIds.forEach(id => {
      outMap.get(id)?.forEach(tid => addRelated(id, tid));
      inMap.get(id)?.forEach(src => addRelated(id, src));
    });
    const focusedSubtreeIds = new Set<string>();
    if (focusedNodeId && visibleIds.has(focusedNodeId)) {
      focusedSubtreeIds.add(focusedNodeId);
      visibleIds.forEach(id => {
        if (id === focusedNodeId) return;
        let current: string | undefined = id;
        while (current) {
          const parentId = nodeParent.get(current);
          if (!parentId) break;
          if (parentId === focusedNodeId) {
            focusedSubtreeIds.add(id);
            break;
          }
          current = parentId;
        }
      });
    }
    const positions = new Map<string, RingPosition>();
    const layerRadii = new Map<number, number>();
    const placedObstacles: LayoutObstacle[] = [];
    const nc = validCenterNoteIds.length;

    // Concentric ring layout:
    //   depth 0 (centers) → small inner ring (or origin for single center)
    //   depth d           → ring at radius d * RING_STEP
    // All nodes at the same depth share one ring and are evenly spaced on it.

    // ── Collision-first radius derivation ───────────────────────────────────
    // All dimensions come from the same forceCollide / drawing parameters so
    // the pre-computed ring radius is exactly what the physics engine needs.

    // Place centers on a small inner ring (or at origin for single center).
    const centerRadius = nc <= 1 ? 0 : Math.min(17, nc * 22);
    validCenterNoteIds.forEach((id, i) => {
      const defaultAngle = -Math.PI / 2 + (i / Math.max(1, nc)) * 2 * Math.PI;
      const angle = savedAngles.current.get(id) ?? defaultAngle;
      const pos = ringPoint(angle, centerRadius);
      layerRadii.set(0, centerRadius);
      const placement = placeLabel({
        id,
        name: noteName(id),
        depth: 0,
        isCenter: true,
        x: pos.x,
        y: pos.y,
        ringRadius: pos.ringRadius,
      }, placedObstacles);
      positions.set(id, {
        ...pos,
        label: {
          pillX: placement.pillX,
          aly: placement.aly,
          lines: placement.lines,
          r: placement.r,
        },
      });
      placedObstacles.push(placement.nodeBox, placement.labelBox);
    });

    // Place each depth on its own concentric ring.
    for (let d = 1; d <= computedDepth; d++) {
      const ring: string[] = [];
      nodeDepths.forEach((depth, id) => { if (depth === d) ring.push(id); });

      // Sort by the angular position of related nodes that have already
      // been placed, so linked nodes tend to stay on the same side.
      ring.sort((a, b) => {
        const pA = nodeParent.get(a), pB = nodeParent.get(b);
        const angA = relatedAnchorAngle(a, relatedMap, positions, nodeParent) ?? (pA && positions.get(pA)?.angle) ?? 0;
        const angB = relatedAnchorAngle(b, relatedMap, positions, nodeParent) ?? (pB && positions.get(pB)?.angle) ?? 0;
        return angA !== angB ? angA - angB : noteName(a).localeCompare(noteName(b));
      });

      const arcBudget = ring.reduce((sum, id) => sum + labelArcRequirement(noteName(id), d, centerSet.has(id)), 0);
      const previousRadius = layerRadii.get(d - 1) ?? centerRadius;
      const baseObstacles = [...placedObstacles];
      const focusAngle = focusedNodeId && focusedSubtreeIds.size > 0
        ? positions.get(focusedNodeId)?.angle ?? savedAngles.current.get(focusedNodeId) ?? null
        : null;
      const preferredAngles = buildPreferredAngles(ring, nodeParent, positions, relatedMap, focusAngle, focusedSubtreeIds);
      ring.forEach(id => {
        const savedAngle = savedAngles.current.get(id);
        if (typeof savedAngle === 'number') preferredAngles.set(id, savedAngle);
      });
      let low = previousRadius + 10;
      let high = low;
      const maxSearchRadius = Math.max(
        high + Math.max(600, ring.length * 30),
        previousRadius + Math.max(120, ring.length * 10),
        arcBudget / (2 * Math.PI) + 40,
      );
      let best = tryPlaceRingOnRadius(ring, d, high, baseObstacles, centerSet, undefined, false);
      const fallback = scoreRingOnRadius(ring, d, high, baseObstacles, centerSet);

      for (let expand = 0; !best.success && high < maxSearchRadius && expand < 400; expand += 1) {
        low = high;
        high = Math.min(maxSearchRadius, high + 5);
        best = tryPlaceRingOnRadius(ring, d, high, baseObstacles, centerSet, undefined, false);
      }

      if (best.success) {
        for (let step = 0; step < 18; step += 1) {
          const mid = (low + high) / 2;
          const trial = tryPlaceRingOnRadius(ring, d, mid, baseObstacles, centerSet, undefined, false);
          if (trial.success) {
            high = mid;
            best = trial;
          } else {
            low = mid;
          }
        }
      } else {
        best = fallback.positions.size === ring.length
          ? fallback
          : placeRingFallback(ring, d, low, baseObstacles, centerSet);
      }

      const arranged = tryPlaceRingOnRadius(ring, d, placedRingRadius(best.positions), baseObstacles, centerSet, preferredAngles, true);
      if (arranged.success && arranged.positions.size === ring.length) {
        best = arranged;
      } else if (arranged.positions.size === ring.length) {
        const bestScore = ringLayoutScore(ring, d, best.positions, baseObstacles, centerSet, relatedMap, nodeParent, positions);
        const arrangedScore = ringLayoutScore(ring, d, arranged.positions, baseObstacles, centerSet, relatedMap, nodeParent, positions);
        if (arrangedScore <= bestScore) {
          best = arranged;
        }
      }

      best = focusLayoutRequest.current
        ? forceFocusedSubtreeSide(best, ring, d, centerSet, focusAngle, focusedSubtreeIds, baseObstacles)
        : best;

      best.positions.forEach((pos, id) => positions.set(id, pos));
      layerRadii.set(d, placedRingRadius(best.positions));
      best.positions.forEach((pos, id) => {
        const placement = placeLabel({
          id,
          name: noteName(id),
          depth: d,
          isCenter: centerSet.has(id),
          x: pos.x,
          y: pos.y,
          ringRadius: pos.ringRadius,
        }, []);
        placedObstacles.push(placement.nodeBox, placement.labelBox);
      });
    }

    const nodes = [...nodeDepths.entries()].map(([id, d]) => {
      const pos = positions.get(id) ?? ringPoint(0, 0);
      return {
        id, name: noteName(id), depth: d, isCenter: centerSet.has(id),
        x: pos.x, y: pos.y,
        angle: pos.angle,
        ringRadius: pos.ringRadius,
        label: pos.label,
        fx: pos.x, fy: pos.y, // pin exactly on ring — force sim cannot move them
      };
    });
    if (focusLayoutRequest.current) {
      savedAngles.current = new Map(nodes.map(node => [node.id, node.angle]));
      focusLayoutRequest.current = null;
    }

    const directed = new Set<string>();
    visibleIds.forEach(id => {
      outMap.get(id)?.forEach(tid => {
        if (visibleIds.has(tid)) directed.add(`${id}\x00${tid}`);
      });
    });

    const processedPairs = new Set<string>();
    const links: { source: string; target: string; bidirectional: boolean }[] = [];
    directed.forEach(edge => {
      const nul = edge.indexOf('\x00');
      const src = edge.slice(0, nul);
      const tgt = edge.slice(nul + 1);
      const pair = src < tgt ? `${src}\x00${tgt}` : `${tgt}\x00${src}`;
      if (!processedPairs.has(pair)) {
        processedPairs.add(pair);
        const isBi = directed.has(`${src}\x00${tgt}`) && directed.has(`${tgt}\x00${src}`);
        links.push({ source: src, target: tgt, bidirectional: isBi });
      }
    });

    const childMap: Record<string, string[]> = {};
    nodeParent.forEach((parentId, childId) => {
      if (!visibleIds.has(parentId) || !visibleIds.has(childId)) return;
      if (!childMap[parentId]) childMap[parentId] = [];
      childMap[parentId].push(childId);
    });

    return { nodes, links, childMap };
  }, [allNotes, centerNoteIds, centerSet, outMap, inMap, computedDepth, focusedNodeId, layoutRevision]);

  const highlightIds = useMemo(() => {
    const rootId = focusedNodeId ?? hoverNodeId;
    if (!rootId) return null;
    const ids = new Set<string>();
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (ids.has(id)) continue;
      ids.add(id);
      graphData.childMap[id]?.forEach(childId => stack.push(childId));
    }
    return ids;
  }, [focusedNodeId, hoverNodeId, graphData]);

  useEffect(() => {
    engineRunning.current = true;
    nodeLayouts.current = new Map();
    needsRevealRef.current = true;
  }, [graphData]);

  useEffect(() => {
    if (!graphVisible) return;
    const t = setTimeout(() => graphRef.current?.zoomToFit(300, 60), 80);
    return () => clearTimeout(t);
  }, [graphVisible, graphData]);

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    syncGraphNodePositions(fg, graphData.nodes as any[]);
    // Nodes are pinned via fx/fy — forceX/Y are redundant.
    // Keep a mild collision force so overlapping labels still repel visually.
    fg.d3Force('charge')?.strength(0);
    fg.d3Force('link')?.strength(0);
    fg.d3Force('collision', forceCollide((node: any) => {
      const r = nodeCircleRadius(node.depth as number, node.isCenter as boolean);
      return r + 5;
    }).strength(0.5).iterations(2));
    fg.d3Force('radial', null);
    fg.d3Force('x', null);
    fg.d3Force('y', null);
    fg.d3ReheatSimulation();
    requestAnimationFrame(() => {
      syncGraphNodePositions(graphRef.current, graphData.nodes as any[]);
    });
  }, [graphData]);


  return (
    <div className="w-full h-full flex flex-col">
      <div ref={canvasWrapRef} className="flex-1 min-h-0 overflow-hidden">
        {graphData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400 select-none">
            找不到筆記
          </div>
        ) : (
          <div style={{ opacity: graphVisible ? 1 : 0, pointerEvents: graphVisible ? 'auto' : 'none' }}>
          <ForceGraph2D
            key={`${centerNoteIds.join('\x00')}|${computedDepth}|${layoutRevision}`}
            ref={graphRef}
            graphData={graphData}
            width={dims.width}
            height={dims.height}
            backgroundColor="#f8fafc"
            linkColor={(link: any) => {
              if (!highlightIds) return '#94a3b8';
              const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
              const targetId = typeof link.target === 'object' ? link.target.id : link.target;
              return highlightIds.has(sourceId) && highlightIds.has(targetId)
                ? '#94a3b8'
                : 'rgba(148, 163, 184, 0.16)';
            }}
            linkWidth={() => 1}
            linkDirectionalArrowLength={(link: any) => {
              if (!highlightIds) return 4;
              const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
              const targetId = typeof link.target === 'object' ? link.target.id : link.target;
              return highlightIds.has(sourceId) && highlightIds.has(targetId) ? 4 : 2;
            }}
            linkDirectionalArrowColor={(link: any) => {
              if (!highlightIds) return '#94a3b8';
              const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
              const targetId = typeof link.target === 'object' ? link.target.id : link.target;
              return highlightIds.has(sourceId) && highlightIds.has(targetId)
                ? '#94a3b8'
                : 'rgba(148, 163, 184, 0.16)';
            }}
            linkDirectionalArrowRelPos={1}
            nodeCanvasObject={(node: any, ctx) => {
              const layout = nodeLayouts.current.get(node.id as string);
              if (!layout) return;

              const d = node.depth as number;
              const isCenter = node.isCenter as boolean;
              const r = nodeCircleRadius(d, isCenter);
              const color = isCenter ? CENTER_COLOR : DEPTH_COLORS[Math.min(d, DEPTH_COLORS.length - 1)];
              const isDimmed = Boolean(highlightIds && !highlightIds.has(node.id as string));
              const nodeAlpha = isDimmed ? 0.18 : 1;
              const labelAlpha = isDimmed ? 0.24 : 1;
              const { pillX, aly, lines } = layout;
              // Circle always at node.y — the pinned ring position never deviates.
              const circleY = node.y as number;

              ctx.save();
              ctx.globalAlpha = nodeAlpha;
              if (isCenter) {
                ctx.beginPath();
                ctx.arc(node.x, circleY, r + 3, 0, 2 * Math.PI);
                ctx.fillStyle = hexToRgba(CENTER_COLOR, 0.18);
                ctx.fill();
              }
              ctx.beginPath();
              ctx.arc(node.x, circleY, r, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
              ctx.restore();

              const fontSize = isCenter ? 9 : 7;
              ctx.font = `${isCenter ? 'bold ' : ''}${fontSize}px sans-serif`;
              ctx.textBaseline = 'middle';
              ctx.textAlign = 'left';

              const lineH = fontSize + 2;
              const totalH = lines.length * lineH;
              const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
              const halfH = totalH / 2 + 2;
              const labelY = aly;
              const labelX = pillX;

              ctx.save();
              ctx.globalAlpha = labelAlpha;
              ctx.lineWidth = LABEL_BORDER_WIDTH;
              const rectX = labelX + LABEL_BORDER_WIDTH / 2;
              const rectY = labelY - halfH + LABEL_BORDER_WIDTH / 2;
              const rectW = maxW + 4 - LABEL_BORDER_WIDTH;
              const rectH = totalH + 2 - LABEL_BORDER_WIDTH;
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(rectX, rectY, rectW, rectH);
              ctx.fillStyle = hexToRgba(color, 0.18);
              ctx.fillRect(rectX, rectY, rectW, rectH);
              ctx.strokeStyle = '#111111';
              ctx.strokeRect(rectX, rectY, rectW, rectH);

              ctx.fillStyle = darkenHex(color);
              const startY = labelY - (lines.length - 1) * lineH / 2;
              lines.forEach((line, i) => ctx.fillText(line, labelX + 2, startY + i * lineH));
              ctx.restore();
            }}
            nodeCanvasObjectMode={() => 'replace'}
            onRenderFramePre={() => {
              const liveNodes = syncGraphNodePositions(graphRef.current, graphData.nodes as any[]);
              enforceFixedRingDistances(liveNodes as any[]);

              const layouts = new Map<string, NodeLayout>();
              (liveNodes as any[]).forEach((node: any) => {
                if (node.label) layouts.set(node.id, node.label);
              });

              nodeLayouts.current = layouts;
            }}
            onEngineStop={() => {
              if (isDragging.current) return;
              engineRunning.current = false;
              const liveNodes = syncGraphNodePositions(graphRef.current, graphData.nodes as any[]);
              const check = enforceFixedRingDistances(liveNodes as any[]);
              if (check.maxDelta > 0.001) {
                console.warn(`[NoteGraph] fixed ring distance drift: repaired ${check.repaired} node(s), max delta ${check.maxDelta.toFixed(4)}px`);
              }
              if (needsRevealRef.current) {
                needsRevealRef.current = false;
                setGraphVisible(true);
                setTimeout(() => graphRef.current?.zoomToFit(400, 60), 50);
              }
            }}
            onNodeDragStart={() => {
              isDragging.current = true;
              engineRunning.current = true;
              // 拖曳前存下所有節點當前位置，並清零殘留速度避免非拖曳節點漂移
              const snap = new Map<string, { x: number; y: number }>();
              (graphRef.current?.graphData()?.nodes ?? []).forEach((n: any) => {
                if (n.x != null && n.y != null) snap.set(n.id, { x: n.x, y: n.y });
                n.vx = 0; n.vy = 0;
              });
              savedPositions.current = snap;
              // 凍結力模擬，避免拖曳期間牽動其他節點
              graphRef.current?.d3Force('charge')?.strength(0);
              graphRef.current?.d3Force('link')?.strength(0);
              graphRef.current?.d3Force('collision')?.strength(0);
              graphRef.current?.d3Force('x')?.strength(0);
              graphRef.current?.d3Force('y')?.strength(0);
            }}
            onNodeDragEnd={() => {
              isDragging.current = false;
              engineRunning.current = false;
              // 還原所有節點到拖曳前位置，不重跑模擬
              (graphRef.current?.graphData()?.nodes ?? []).forEach((n: any) => {
                const saved = savedPositions.current.get(n.id);
                if (saved) {
                  n.x = saved.x;
                  n.y = saved.y;
                  n.fx = saved.x;
                  n.fy = saved.y;
                  n.vx = 0;
                  n.vy = 0;
                }
              });
              enforceFixedRingDistances(graphRef.current?.graphData()?.nodes ?? []);
            }}
            onNodeClick={(node: any, event: MouseEvent) => {
              const id = node.id as string;
              if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                onNodeCtrlClick?.(id);
                return;
              }
              if (typeof node.angle === 'number') {
                savedAngles.current.set(id, node.angle);
              }
              focusLayoutRequest.current = id;
              setFocusedNodeId(id);
              setLayoutRevision(current => current + 1);
              onNodeClick?.(id);
            }}
            onNodeRightClick={(node: any, event: MouseEvent) => {
              event.preventDefault();
              onNodeRightClick?.(node.id as string);
            }}
            onNodeHover={(node: any) => {
              if (focusedNodeId) return;
              setHoverNodeId(node?.id ?? null);
            }}
            onBackgroundClick={() => {
              setFocusedNodeId(null);
              focusLayoutRequest.current = null;
              setHoverNodeId(null);
            }}
            cooldownTicks={60}
            enableNodeDrag={false}
            enableZoomInteraction
            nodeLabel="name"
            minZoom={0.2}
            maxZoom={4}
          />
          </div>
        )}
      </div>

      <div
        className="shrink-0 flex items-center gap-2 px-3 border-t border-gray-200 bg-slate-50"
        style={{ height: SLIDER_H }}
      >
        <span className="text-[10px] text-gray-400 select-none whitespace-nowrap">層級</span>
        <input
          type="range" min={1} max={4} value={sliderDepth}
          onChange={e => setSliderDepth(Number(e.target.value))}
          className="flex-1 h-1 accent-indigo-500 cursor-pointer"
        />
        <span className="text-[10px] font-semibold text-indigo-500 w-3 text-right select-none">
          {sliderDepth}
        </span>
      </div>
    </div>
  );
}
