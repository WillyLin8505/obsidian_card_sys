import { useRef, useMemo, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Note } from '../types/note';
import { normalizeNoteLinkKey, noteLinkAliases, parseFrontmatterLinks, parseMarkdownLinkRecords, parseWikiLinks } from '../utils/noteLinks';
import { localApi } from '../utils/api';
import { categoryColor, limitCategoryMap, sortCategories } from '../utils/noteGraphCategories';

interface Props {
  allNotes: Note[];
  centerNoteIds: string[];
  onNodeClick?: (noteId: string, noteName?: string) => void;
  onNodeCtrlClick?: (noteId: string) => void;
  onNodeRightClick?: (noteId: string) => void;
  onNodeConnect?: (sourceId: string, targetId: string) => void;
  depth?: number;
  onDepthChange?: (depth: number) => void;
}

const CENTER_COLOR = '#34d399';
const DEPTH_COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa'];
const DROP_CONNECT_THRESHOLD = 34;
const classificationCache = new Map<string, Record<string, string>>();

function hexToRgba(hex: string, alpha: number): string {
  const hsl = hex.match(/^hsl\(([^,]+),\s*([^,]+),\s*([^)]+)\)$/i);
  if (hsl) return `hsla(${hsl[1]}, ${hsl[2]}, ${hsl[3]}, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function darkenHex(hex: string): string {
  const hsl = hex.match(/^hsl\(([^,]+),\s*([^,]+),\s*([^)]+)\)$/i);
  if (hsl) return `hsl(${hsl[1]}, ${hsl[2]}, 26%)`;
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * 0.45);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * 0.45);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * 0.45);
  return `rgb(${r},${g},${b})`;
}

function readableCategoryTextColor(hex: string): string {
  return darkenHex(hex);
}

function extractAbstract(content: string): string {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return '';
  return match[1].match(/^abstract:\s*(.+)$/m)?.[1]?.trim() ?? '';
}

const SLIDER_H = 28;

function noteName(id: string): string {
  return id.split('/').pop()?.replace(/\.md$/i, '') ?? id;
}

function missingNodeId(name: string): string {
  return `missing:${normalizeNoteLinkKey(name) ?? name}`;
}

function stripMarkdownExt(value: string): string {
  return value.replace(/\.md$/i, '');
}

function canonicalLinkName(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {}
  return stripMarkdownExt(
    decoded
      .replace(/\\/g, '/')
      .replace(/^\.?\//, '')
      .replace(/^\[\[|\]\]$/g, '')
      .replace(/^<|>$/g, '')
      .split('|')[0]
      .split(/[?#]/)[0]
      .trim()
  );
}

function normalizeLinkKey(value: unknown): string | null {
  return normalizeNoteLinkKey(value);
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

// ── Layout constants ────────────────────────────────────────────────────────
// Spec: docs/concentric-ring-layout-spec.md (old ring layout, archived)
//
// Tree layout:
//   X axis = depth level  (left = root, right = deeper children)
//   Y axis = vertical position within each depth column
//   Labels = always to the right of the node circle

const LABEL_MAX_CHARS = 9;
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 3;
const LABEL_NODE_MIN_GAP = 6;
const LABEL_BORDER_WIDTH = 1;
const LABEL_BOX_GAP = 2;       // px between adjacent label boxes in the same column
const COL_NODE_GAP = 4;        // min gap between prev column's label right edge and next node left edge
const ZOOM_FIT_MIN_PADDING = 14;
const ZOOM_FIT_MAX_PADDING = 36;

function nodeCircleRadius(depth: number, isCenter = false) {
  return isCenter ? 7 : Math.max(3, 6 - Math.abs(depth));
}

function labelBoxMetrics(node: any, ctx: CanvasRenderingContext2D) {
  const d = node.depth as number;
  const isCenter = node.isCenter as boolean;
  const isIncoming = d < 0;
  const r = nodeCircleRadius(Math.abs(d), isCenter);
  const nx = node.x as number;
  const ny = node.y as number;
  const name = node.name as string;
  const fontSize = isCenter ? 9 : 7;
  const lines = wrapLabel(name, LABEL_MAX_CHARS);
  const lineH = fontSize + 2;
  const totalH = lines.length * lineH;

  ctx.font = `${isCenter ? 'bold ' : ''}${fontSize}px sans-serif`;
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const labelX = nx + r + LABEL_NODE_MIN_GAP;
  const labelCy = ny;
  const boxX = labelX - LABEL_PAD_X / 2;
  const boxY = labelCy - totalH / 2 - LABEL_PAD_Y / 2;
  const boxW = maxW + LABEL_PAD_X;
  const boxH = totalH + LABEL_PAD_Y;

  return { r, nx, ny, lines, lineH, labelX, labelCy, boxX, boxY, boxW, boxH };
}

function estimatedLabelBoxBounds(node: any) {
  const d = node.depth as number;
  const isCenter = node.isCenter as boolean;
  const isIncoming = d < 0;
  const r = nodeCircleRadius(Math.abs(d), isCenter);
  const nx = Number(node.x ?? 0);
  const ny = Number(node.y ?? 0);
  const name = node.name as string;
  const fontSize = isCenter ? 9 : 7;
  const lines = wrapLabel(name, LABEL_MAX_CHARS);
  const lineH = fontSize + 2;
  const totalH = lines.length * lineH;
  const maxW = Math.max(...lines.map(line => line.length * fontSize));
  const labelX = nx + r + LABEL_NODE_MIN_GAP;
  const boxX = labelX - LABEL_PAD_X / 2;
  const boxY = ny - totalH / 2 - LABEL_PAD_Y / 2;
  const boxW = maxW + LABEL_PAD_X;
  const boxH = totalH + LABEL_PAD_Y;
  const circleR = r + (isCenter ? 3 : 0);

  return {
    left: Math.min(nx - circleR, boxX),
    right: Math.max(nx + circleR, boxX + boxW),
    top: Math.min(ny - circleR, boxY),
    bottom: Math.max(ny + circleR, boxY + boxH),
  };
}

function getNodeLabelH(node: any): number {
  const fontSize = (node.isCenter as boolean) ? 9 : 7;
  const lineH = fontSize + 2;
  const lines = wrapLabel(node.name as string, LABEL_MAX_CHARS);
  return lines.length * lineH + LABEL_PAD_Y;
}

// Rearranges Y positions within each depth column so highlighted nodes are
// grouped at the centre and dimmed nodes are pushed to top/bottom.
function computeFocusedLayout(
  nodes: any[],
  highlightIds: Set<string>,
): Map<string, { x: number; y: number }> {
  const layout = new Map<string, { x: number; y: number }>();

  const byDepth = new Map<number, any[]>();
  nodes.forEach(node => {
    const d = node.depth as number;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(node);
  });

  const FOCUS_GAP = LABEL_BOX_GAP * 2;

  byDepth.forEach(depthNodes => {
    const highlighted = depthNodes.filter(n => highlightIds.has(n.id as string));
    const dimmed      = depthNodes.filter(n => !highlightIds.has(n.id as string));

    if (highlighted.length === 0 || dimmed.length === 0) {
      depthNodes.forEach(n => layout.set(n.id as string, { x: n.x as number, y: n.y as number }));
      return;
    }

    highlighted.sort((a, b) => (a.y as number) - (b.y as number));
    dimmed.sort((a, b)      => (a.y as number) - (b.y as number));
    const cx = depthNodes[0].x as number;

    // Packs a group compactly and centres the result at y = 0.
    function packGroup(group: any[]): Array<{ id: string; y: number }> {
      const ys: number[] = [0];
      for (let i = 1; i < group.length; i++) {
        const minDist = (getNodeLabelH(group[i - 1]) + getNodeLabelH(group[i])) / 2 + LABEL_BOX_GAP;
        ys.push(ys[i - 1] + minDist);
      }
      const mid = group.length > 1 ? (ys[0] + ys[ys.length - 1]) / 2 : 0;
      return group.map((n, i) => ({ id: n.id as string, y: ys[i] - mid }));
    }

    const hlPacked = packGroup(highlighted);
    const hlTop = hlPacked[0].y - getNodeLabelH(highlighted[0]) / 2;
    const hlBot = hlPacked[hlPacked.length - 1].y + getNodeLabelH(highlighted[highlighted.length - 1]) / 2;

    hlPacked.forEach(r => layout.set(r.id, { x: cx, y: r.y }));

    const nAbove = Math.floor(dimmed.length / 2);
    const dimAbove = dimmed.slice(0, nAbove);
    const dimBelow = dimmed.slice(nAbove);

    if (dimAbove.length > 0) {
      const packed  = packGroup(dimAbove);
      const packBot = packed[packed.length - 1].y + getNodeLabelH(dimAbove[dimAbove.length - 1]) / 2;
      const shift   = hlTop - FOCUS_GAP - packBot;
      packed.forEach(r => layout.set(r.id, { x: cx, y: r.y + shift }));
    }

    if (dimBelow.length > 0) {
      const packed   = packGroup(dimBelow);
      const packTop  = packed[0].y - getNodeLabelH(dimBelow[0]) / 2;
      const shift    = hlBot + FOCUS_GAP - packTop;
      packed.forEach(r => layout.set(r.id, { x: cx, y: r.y + shift }));
    }
  });

  return layout;
}

// ── Component ───────────────────────────────────────────────────────────────

export function NoteGraph({ allNotes, centerNoteIds, onNodeClick, onNodeCtrlClick, onNodeRightClick, onNodeConnect, depth, onDepthChange }: Props) {
  const graphRef = useRef<any>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const prevCenterKeyRef = useRef<string>('');
  const draggingNodeIdRef = useRef<string | null>(null);
  const dragLineRef = useRef<{ sourceId: string; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const desiredNodeLayoutRef = useRef(new Map<string, any>());
  const suppressNextClickRef = useRef(false);
  const mouseGraphPosRef = useRef<{ x: number; y: number } | null>(null);
  const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const [dims, setDims] = useState({ width: 440, height: 300 });
  const [internalSliderDepth, setInternalSliderDepth] = useState(1);
  const sliderDepth = depth ?? internalSliderDepth;
  const setSliderDepth = onDepthChange ?? setInternalSliderDepth;
  const [computedDepth, setComputedDepth] = useState(1);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [graphVisible, setGraphVisible] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [classificationError, setClassificationError] = useState('');
  const [categoryByNodeId, setCategoryByNodeId] = useState<Record<string, string>>({});
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(() => new Set());
  const needsRevealRef = useRef(false);
  const suppressZoomRef = useRef(false);

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

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const handler = (e: PointerEvent) => {
      const fg = graphRef.current;
      if (!fg?.screen2GraphCoords) return;
      const rect = el.getBoundingClientRect();
      mouseGraphPosRef.current = fg.screen2GraphCoords(e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('pointermove', handler);
    return () => el.removeEventListener('pointermove', handler);
  }, []);

  useEffect(() => {
    // Touch devices use pinch-to-zoom natively via d3-zoom; the Ctrl+scroll handler is desktop-only.
    if (isTouchDevice) return;
    const el = canvasWrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const fg = graphRef.current;
      if (!fg) return;
      const currentZoom = fg.zoom() as number;
      // d3-zoom multiplies by 10 when ctrlKey is true (trackpad pinch compat).
      // Use the plain non-ctrlKey formula so Ctrl+scroll feels the same as normal scroll.
      const delta = -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002);
      fg.zoom(Math.max(0.2, Math.min(4, currentZoom * Math.exp(delta))));
    };
    el.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handler, { capture: true });
  }, [isTouchDevice]);

  const { nameToId, noteIds } = useMemo(() => {
    const nameToId = new Map<string, string>();
    const noteIds = new Set<string>();
    const addKey = (key: string | undefined, id: string) => {
      noteLinkAliases(key).forEach(alias => {
        const normalized = normalizeLinkKey(alias);
        if (normalized && !nameToId.has(normalized)) nameToId.set(normalized, id);
      });
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

  const { outMap, missingNodeNames } = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const missingNames = new Map<string, string>();
    allNotes.forEach(n => {
      const targets = new Set<string>();
      const addLinkTarget = (linkId: string) => {
        const logicalName = canonicalLinkName(linkId);
        const tid = noteLinkAliases(linkId)
          .concat(noteLinkAliases(logicalName))
          .map(candidate => {
            const key = normalizeLinkKey(candidate);
            return key ? nameToId.get(key) : undefined;
          })
          .find(Boolean);
        if (tid === n.id) {
          return;
        }
        if (tid) {
          targets.add(tid);
        } else if (logicalName) {
          const id = missingNodeId(logicalName);
          missingNames.set(id, logicalName);
          targets.add(id);
        }
      };

      const hasServerLinkIndex = Array.isArray(n.links) && typeof n.searchText === 'string';
      if (hasServerLinkIndex) {
        n.links?.forEach(addLinkTarget);
      } else {
        parseWikiLinks(n.content).forEach(addLinkTarget);
        parseMarkdownLinkRecords(n.content).forEach(record => {
          const logicalName = canonicalLinkName(record.target);
          const tid = record.candidates
            .concat(noteLinkAliases(record.target))
            .concat(noteLinkAliases(logicalName))
            .map(candidate => {
              const key = normalizeLinkKey(candidate);
              return key ? nameToId.get(key) : undefined;
            })
            .find(Boolean);

          if (tid && tid !== n.id) {
            targets.add(tid);
          } else if (record.isLocalNote && logicalName) {
            const id = missingNodeId(logicalName);
            missingNames.set(id, logicalName);
            targets.add(id);
          }
        });
        parseFrontmatterLinks(n.content).forEach(addLinkTarget);
        n.links?.forEach(addLinkTarget);
      }
      m.set(n.id, targets);
    });
    return { outMap: m, missingNodeNames: missingNames };
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
  const limitedCategoryByNodeId = useMemo(() => limitCategoryMap(categoryByNodeId), [categoryByNodeId]);

  const graphData = useMemo(() => {
    const validCenterNoteIds = centerNoteIds.filter(id => noteIds.has(id));
    if (validCenterNoteIds.length === 0) return { nodes: [], links: [] };

    const displayName = (id: string) => missingNodeNames.get(id) ?? noteName(id);
    const categoryRanks = new Map(
      sortCategories(Object.values(limitedCategoryByNodeId))
        .map((category, index) => [category, index]),
    );
    const categoryRank = (id: string) => {
      if (centerSet.has(id)) return -1;
      const category = limitedCategoryByNodeId[id];
      return category ? categoryRanks.get(category) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    };

    const centerKey = validCenterNoteIds.join('\x00');
    if (prevCenterKeyRef.current !== centerKey) {
      prevCenterKeyRef.current = centerKey;
      setFocusedNodeId(null);
    }

    // BFS — outgoing links only, building a left-to-right tree
    const nodeDepths = new Map<string, number>();
    const nodeParent = new Map<string, string>();
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
      }
      frontier = next;
      if (frontier.length === 0) break;
    }

    // Incoming BFS: find nodes that link TO the center nodes (shown on the left)
    let inFrontier = [...validCenterNoteIds];
    for (let d = 1; d <= computedDepth; d++) {
      const next: string[] = [];
      for (const nodeId of inFrontier) {
        inMap.get(nodeId)?.forEach(tid => {
          if (!nodeDepths.has(tid)) {
            nodeDepths.set(tid, -d);
            next.push(tid);
          }
        });
      }
      inFrontier = next;
      if (inFrontier.length === 0) break;
    }

    const visibleIds = new Set(nodeDepths.keys());

    // Group nodes by depth for columnar processing.
    const nodesByDepth = new Map<number, string[]>();
    nodeDepths.forEach((d, id) => {
      if (!nodesByDepth.has(d)) nodesByDepth.set(d, []);
      nodesByDepth.get(d)!.push(id);
    });

    // Returns the rendered label box height for a given node.
    function labelBoxH(id: string): number {
      const isCenter = centerSet.has(id);
      const fontSize = isCenter ? 9 : 7;
      const lineH = fontSize + 2;
      const lines = wrapLabel(displayName(id), LABEL_MAX_CHARS);
      return lines.length * lineH + LABEL_PAD_Y;
    }

    // Estimate canvas text width conservatively.
    // Use 7px/char to handle CJK full-width characters at 7px sans-serif,
    // and 9px/char for bold 9px center nodes.
    function estimateTextWidth(id: string): number {
      const isCenter = centerSet.has(id);
      const lines = wrapLabel(displayName(id), LABEL_MAX_CHARS);
      const maxLen = Math.max(...lines.map(l => l.length));
      return maxLen * (isCenter ? 9 : 7);
    }

    // Offset from node centre to the right edge of its label box.
    function labelBoxRightOffset(id: string, d: number): number {
      const r = nodeCircleRadius(d, centerSet.has(id));
      return r + LABEL_NODE_MIN_GAP + estimateTextWidth(id) + LABEL_PAD_X / 2;
    }

    // Compute minimum column X so each column sits just clear of the previous
    // column's label boxes.
    const columnX: number[] = [0];
    for (let d = 1; d <= computedDepth; d++) {
      const prevIds = nodesByDepth.get(d - 1) ?? [];
      const curIds  = nodesByDepth.get(d)     ?? [];
      const maxRight = prevIds.length > 0
        ? Math.max(...prevIds.map(id => labelBoxRightOffset(id, d - 1)))
        : 60;
      const maxNextR = curIds.length > 0
        ? Math.max(...curIds.map(id => nodeCircleRadius(d, centerSet.has(id))))
        : 4;
      columnX.push(columnX[d - 1] + maxRight + COL_NODE_GAP + maxNextR);
    }

    // Incoming column X (negative x values; labels go RIGHT, same as outgoing)
    // Constraint: right edge of depth -d label must clear left edge of depth -(d-1) circle.
    // Use a larger gap (6px) than outgoing to avoid label-over-node overlap on the incoming side.
    const IN_COL_GAP = 6;
    const inColumnX: number[] = [0];
    for (let d = 1; d <= computedDepth; d++) {
      const prevIds = d === 1 ? (nodesByDepth.get(0) ?? []) : (nodesByDepth.get(-(d - 1)) ?? []);
      const curIds = nodesByDepth.get(-d) ?? [];
      const prevAbsDepth = d === 1 ? 0 : d - 1;
      // Include the center node glow (+3) in the effective radius for d=1
      const maxPrevR = prevIds.length > 0
        ? Math.max(...prevIds.map(id => nodeCircleRadius(prevAbsDepth, centerSet.has(id)) + (centerSet.has(id) ? 3 : 0)))
        : 10;
      const maxCurLabelRight = curIds.length > 0
        ? Math.max(...curIds.map(id => labelBoxRightOffset(id, d)))
        : 60;
      inColumnX.push(inColumnX[d - 1] - maxPrevR - IN_COL_GAP - maxCurLabelRight);
    }

    const positions = new Map<string, { x: number; y: number }>();
    const compareByCategoryThenY = (a: string, b: string) => {
      const rankDelta = categoryRank(a) - categoryRank(b);
      if (rankDelta !== 0) return rankDelta;
      const yDelta = (positions.get(a)?.y ?? 0) - (positions.get(b)?.y ?? 0);
      if (Math.abs(yDelta) > 0.001) return yDelta;
      return displayName(a).localeCompare(displayName(b), 'zh-Hant');
    };

    // Separation pass: sort ids by AI category first, then by Y; do one downward
    // sweep to enforce minimum spacing, then preserve the original centre of mass.
    // O(N) — guaranteed to converge regardless of initial positions.
    function separateIds(ids: string[], compare: (a: string, b: string) => number = compareByCategoryThenY) {
      if (ids.length <= 1) return;
      ids.sort(compare);

      const centerBefore = ids.reduce((s, id) => s + positions.get(id)!.y, 0) / ids.length;

      for (let i = 1; i < ids.length; i++) {
        const a = ids[i - 1], b = ids[i];
        const minDist = (labelBoxH(a) + labelBoxH(b)) / 2 + LABEL_BOX_GAP;
        const ay = positions.get(a)!.y;
        // Always pack at exactly minDist — pulls nodes up if too far, not just pushes down
        positions.set(b, { ...positions.get(b)!, y: ay + minDist });
      }

      const shift = centerBefore - ids.reduce((s, id) => s + positions.get(id)!.y, 0) / ids.length;
      if (Math.abs(shift) > 0.001) {
        ids.forEach(id => positions.set(id, { ...positions.get(id)!, y: positions.get(id)!.y + shift }));
      }
    }

    // Roots start at y = 0; back-propagation will set their final position.
    (nodesByDepth.get(0) ?? []).forEach(id => positions.set(id, { x: 0, y: 0 }));

    // Forward pass (depth 1 → maxDepth):
    //   Each node's initial Y = average Y of every parent node (at depth d-1) that
    //   links to it.  Nodes shared by multiple parents cluster near their combined
    //   centre-of-gravity.  After seeding, sort and separate.
    for (let d = 1; d <= computedDepth; d++) {
      const ids = nodesByDepth.get(d) ?? [];
      if (ids.length === 0) continue;

      ids.forEach(id => {
        const parentYs: number[] = [];
        (nodesByDepth.get(d - 1) ?? []).forEach(pid => {
          if (outMap.get(pid)?.has(id) && visibleIds.has(pid)) {
            parentYs.push(positions.get(pid)?.y ?? 0);
          }
        });
        const ty = parentYs.length > 0
          ? parentYs.reduce((s, y) => s + y, 0) / parentYs.length
          : (positions.get(nodeParent.get(id) ?? '')?.y ?? 0);
        positions.set(id, { x: columnX[d], y: ty });
      });

      separateIds(ids);
    }

    // Back-propagation (maxDepth-1 → 0):
    //   Move each node to the midpoint of its children's Y range so that parents
    //   sit visually centred over their subtree.  Re-separate after each depth.
    for (let d = computedDepth - 1; d >= 0; d--) {
      const ids = nodesByDepth.get(d) ?? [];
      ids.forEach(id => {
        const childYs = (nodesByDepth.get(d + 1) ?? [])
          .filter(cid => outMap.get(id)?.has(cid) && visibleIds.has(cid))
          .map(cid => positions.get(cid)!.y);
        if (childYs.length > 0) {
          const pos = positions.get(id)!;
          positions.set(id, { x: pos.x, y: (Math.min(...childYs) + Math.max(...childYs)) / 2 });
        }
      });
      if (ids.length > 1) {
        separateIds(ids);
      }
    }

    // Incoming forward pass (depth -1 → -computedDepth): seed Y near linked center-ward nodes
    for (let d = 1; d <= computedDepth; d++) {
      const ids = nodesByDepth.get(-d) ?? [];
      if (ids.length === 0) continue;
      const targetDepth = d === 1 ? 0 : -(d - 1);
      ids.forEach(id => {
        const targetYs: number[] = [];
        (nodesByDepth.get(targetDepth) ?? []).forEach(tid => {
          if (outMap.get(id)?.has(tid) && visibleIds.has(tid)) {
            targetYs.push(positions.get(tid)?.y ?? 0);
          }
        });
        const ty = targetYs.length > 0 ? targetYs.reduce((s, y) => s + y, 0) / targetYs.length : 0;
        positions.set(id, { x: inColumnX[d], y: ty });
      });
      separateIds(ids);
    }

    // Incoming back-prop (depth -(computedDepth-1) → -1): center each node over its outer children
    for (let d = computedDepth - 1; d >= 1; d--) {
      const ids = nodesByDepth.get(-d) ?? [];
      ids.forEach(id => {
        const childYs = (nodesByDepth.get(-(d + 1)) ?? [])
          .filter(cid => outMap.get(cid)?.has(id) && visibleIds.has(cid))
          .map(cid => positions.get(cid)!.y);
        if (childYs.length > 0) {
          const pos = positions.get(id)!;
          positions.set(id, { x: pos.x, y: (Math.min(...childYs) + Math.max(...childYs)) / 2 });
        }
      });
      if (ids.length > 1) {
        separateIds(ids);
      }
    }

    // Vertically center the whole tree around y = 0
    const allYs = [...positions.values()].map(p => p.y);
    if (allYs.length > 0) {
      const midY = (Math.min(...allYs) + Math.max(...allYs)) / 2;
      positions.forEach((pos, id) => positions.set(id, { x: pos.x, y: pos.y - midY }));
    }

    const nodes = [...nodeDepths.entries()].map(([id, d]) => {
      const pos = positions.get(id) ?? { x: 0, y: 0 };
      return {
        id,
        name: displayName(id),
        depth: d,
        isCenter: centerSet.has(id),
        isIncoming: d < 0,
        x: pos.x,
        y: pos.y,
        fx: pos.x,
        fy: pos.y,
      };
    });

    // Edges: all visible outgoing links
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

    return { nodes, links };
  }, [allNotes, centerNoteIds, centerSet, outMap, inMap, missingNodeNames, computedDepth, noteIds, limitedCategoryByNodeId]);

  const categoryList = useMemo(() => {
    const categories = graphData.nodes
      .filter((node: any) => !node.isCenter)
      .map((node: any) => limitedCategoryByNodeId[node.id as string])
      .filter((category): category is string => Boolean(category));
    return sortCategories(categories);
  }, [graphData, limitedCategoryByNodeId]);

  const categoryColorMap = useMemo(() => {
    const m = new Map<string, string>();
    categoryList.forEach((category, index) => {
      m.set(category, categoryColor(index));
    });
    return m;
  }, [categoryList]);

  const visibleGraphData = useMemo(() => {
    if (categoryList.length === 0) return graphData;

    const visibleIds = new Set<string>();
    graphData.nodes.forEach((node: any) => {
      const id = node.id as string;
      const category = limitedCategoryByNodeId[id];
      if (node.isCenter || !category || enabledCategories.has(category)) {
        visibleIds.add(id);
      }
    });

    const filtered = {
      nodes: graphData.nodes.filter((node: any) => visibleIds.has(node.id as string)),
      links: graphData.links.filter((link: any) => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return visibleIds.has(sourceId) && visibleIds.has(targetId);
      }),
    };

    const nodeById = new Map(filtered.nodes.map((node: any) => [node.id as string, node]));
    const nodesByDepth = new Map<number, any[]>();
    filtered.nodes.forEach((node: any) => {
      const depth = node.depth as number;
      if (!nodesByDepth.has(depth)) nodesByDepth.set(depth, []);
      nodesByDepth.get(depth)!.push(node);
    });

    function labelBoxH(node: any): number {
      const fontSize = node.isCenter ? 9 : 7;
      const lineH = fontSize + 2;
      const lines = wrapLabel(node.name as string, LABEL_MAX_CHARS);
      return lines.length * lineH + LABEL_PAD_Y;
    }

    function estimateTextWidth(node: any): number {
      const lines = wrapLabel(node.name as string, LABEL_MAX_CHARS);
      const maxLen = Math.max(...lines.map(l => l.length));
      return maxLen * (node.isCenter ? 9 : 7);
    }

    function labelBoxRightOffset(node: any): number {
      const r = nodeCircleRadius(node.depth as number, node.isCenter as boolean);
      return r + LABEL_NODE_MIN_GAP + estimateTextWidth(node) + LABEL_PAD_X / 2;
    }

    const maxDepth = Math.max(0, ...filtered.nodes.map((node: any) => node.depth as number));
    const columnX: number[] = [0];
    for (let d = 1; d <= maxDepth; d++) {
      const prevNodes = nodesByDepth.get(d - 1) ?? [];
      const curNodes = nodesByDepth.get(d) ?? [];
      const maxRight = prevNodes.length > 0 ? Math.max(...prevNodes.map(labelBoxRightOffset)) : 60;
      const maxNextR = curNodes.length > 0
        ? Math.max(...curNodes.map((node: any) => nodeCircleRadius(d, node.isCenter as boolean)))
        : 4;
      columnX.push(columnX[d - 1] + maxRight + COL_NODE_GAP + maxNextR);
    }

    const positioned = new Map<string, { x: number; y: number }>();
    const categoryRank = new Map(categoryList.map((category, index) => [category, index]));
    const nodeCategoryRank = (node: any) => {
      if (node.isCenter) return -1;
      const category = limitedCategoryByNodeId[node.id as string];
      return category ? categoryRank.get(category) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    };
    const packColumn = (nodes: any[], x: number) => {
      if (nodes.length === 0) return;
      let cursor = 0;
      nodes.forEach(node => {
        const h = labelBoxH(node);
        positioned.set(node.id as string, { x, y: cursor + h / 2 });
        cursor += h + LABEL_BOX_GAP;
      });
      const first = positioned.get(nodes[0].id as string)!;
      const last = positioned.get(nodes[nodes.length - 1].id as string)!;
      const mid = (first.y + last.y) / 2;
      nodes.forEach(node => {
        const pos = positioned.get(node.id as string)!;
        positioned.set(node.id as string, { x: pos.x, y: pos.y - mid });
      });
    };

    const sortNodes = (nodes: any[]) =>
      [...nodes].sort((a: any, b: any) =>
        nodeCategoryRank(a) - nodeCategoryRank(b)
        || Number(a.y ?? 0) - Number(b.y ?? 0)
        || String(a.name).localeCompare(String(b.name), 'zh-Hant'),
      );

    for (let d = 0; d <= maxDepth; d++) {
      packColumn(sortNodes(nodesByDepth.get(d) ?? []), columnX[d] ?? 0);
    }

    // Re-layout incoming nodes (depth < 0) so they don't overlap after category filtering.
    const minDepth = Math.min(0, ...filtered.nodes.map((node: any) => node.depth as number));
    if (minDepth < 0) {
      const IN_GAP = 6;
      const inColumnX: number[] = [0];
      for (let d = 1; d <= Math.abs(minDepth); d++) {
        const prevNodes = d === 1 ? (nodesByDepth.get(0) ?? []) : (nodesByDepth.get(-(d - 1)) ?? []);
        const curNodes  = nodesByDepth.get(-d) ?? [];
        const prevAbsD  = d === 1 ? 0 : d - 1;
        const maxPrevR  = prevNodes.length > 0
          ? Math.max(...prevNodes.map((n: any) => nodeCircleRadius(prevAbsD, n.isCenter as boolean) + (n.isCenter ? 3 : 0)))
          : 10;
        const maxCurRight = curNodes.length > 0
          ? Math.max(...curNodes.map((n: any) => labelBoxRightOffset(n)))
          : 60;
        inColumnX.push(inColumnX[d - 1] - maxPrevR - IN_GAP - maxCurRight);
      }
      for (let d = 1; d <= Math.abs(minDepth); d++) {
        packColumn(sortNodes(nodesByDepth.get(-d) ?? []), inColumnX[d] ?? 0);
      }
    }

    return {
      nodes: filtered.nodes.map((node: any) => {
        const pos = positioned.get(node.id as string) ?? { x: node.x, y: node.y };
        return { ...node, x: pos.x, y: pos.y, fx: pos.x, fy: pos.y };
      }),
      links: filtered.links.map((link: any) => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return { ...link, source: sourceId, target: targetId };
      }).filter((link: any) => nodeById.has(link.source) && nodeById.has(link.target)),
    };
  }, [graphData, categoryList, limitedCategoryByNodeId, enabledCategories]);

  const highlightIds = useMemo(() => {
    const rootId = focusedNodeId ?? hoverNodeId;
    if (!rootId) return null;
    const visibleIds = new Set<string>(visibleGraphData.nodes.map((n: any) => n.id as string));
    if (!visibleIds.has(rootId)) return null;

    const outgoing = new Map<string, Set<string>>();
    visibleIds.forEach(id => outgoing.set(id, new Set()));
    visibleGraphData.links.forEach((link: any) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      if (!visibleIds.has(sourceId) || !visibleIds.has(targetId)) return;
      outgoing.get(sourceId)?.add(targetId);
    });

    const ids = new Set<string>();
    const queue = [rootId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (ids.has(id)) continue;
      ids.add(id);
      outgoing.get(id)?.forEach(nextId => {
        if (!ids.has(nextId)) queue.push(nextId);
      });
    }
    return ids;
  }, [focusedNodeId, hoverNodeId, visibleGraphData]);

  const classifyVisibleNotes = useCallback(async () => {
    const notesById = new Map(allNotes.map(note => [note.id, note]));
    const nodes = graphData.nodes.filter((node: any) => !node.isCenter);
    const notes = nodes.map((node: any) => {
      const id = node.id as string;
      const note = notesById.get(id);
      return {
        id,
        title: note?.title ?? node.name ?? noteName(id),
        abstract: note ? extractAbstract(note.content) : '',
        tags: note?.tags ?? [],
        updatedAt: note?.updatedAt ?? '',
      };
    });

    if (notes.length === 0) return;

    const cacheKey = notes
      .map(note => `${note.id}\u0001${note.title}\u0001${note.updatedAt}\u0001${note.tags.join(',')}\u0001${note.abstract}`)
      .sort()
      .join('\u0002');
    const cached = classificationCache.get(cacheKey);
    if (cached) {
      const limited = limitCategoryMap(cached);
      setCategoryByNodeId(limited);
      setEnabledCategories(new Set([...new Set(Object.values(limited))]));
      setClassificationError('');
      return;
    }

    setIsClassifying(true);
    setClassificationError('');
    try {
      const categories = await localApi.classifyNoteTypes(notes.map(({ updatedAt: _updatedAt, ...note }) => note));
      const next: Record<string, string> = {};
      notes.forEach(note => {
        next[note.id] = '其他';
      });
      categories.forEach(item => {
        if (item.id) next[item.id] = item.category || '其他';
      });
      const limited = limitCategoryMap(next);
      classificationCache.set(cacheKey, limited);
      if (classificationCache.size > 30) {
        classificationCache.delete(classificationCache.keys().next().value);
      }
      setCategoryByNodeId(limited);
      setEnabledCategories(new Set([...new Set(Object.values(limited))]));
    } catch (err: any) {
      setClassificationError(err?.message || '分類失敗');
    } finally {
      setIsClassifying(false);
    }
  }, [allNotes, graphData]);

  const nodeColor = useCallback((node: any) => {
    const d = Math.abs(node.depth as number);
    if (node.isCenter) return CENTER_COLOR;
    const category = limitedCategoryByNodeId[node.id as string];
    return category ? categoryColorMap.get(category) ?? DEPTH_COLORS[Math.min(d, DEPTH_COLORS.length - 1)] : DEPTH_COLORS[Math.min(d, DEPTH_COLORS.length - 1)];
  }, [limitedCategoryByNodeId, categoryColorMap]);

  const zoomToFitGraph = useCallback(() => {
    if (suppressZoomRef.current) return;
    const fg = graphRef.current;
    const nodes = visibleGraphData.nodes;
    if (!fg || nodes.length === 0 || dims.width <= 0 || dims.height <= 0) return;

    const bounds = nodes.map(estimatedLabelBoxBounds);
    const left = Math.min(...bounds.map(b => b.left));
    const right = Math.max(...bounds.map(b => b.right));
    const top = Math.min(...bounds.map(b => b.top));
    const bottom = Math.max(...bounds.map(b => b.bottom));
    const graphW = Math.max(1, right - left);
    const graphH = Math.max(1, bottom - top);
    const paddingX = Math.min(
      Math.max(ZOOM_FIT_MIN_PADDING, Math.round(dims.width * 0.025)),
      ZOOM_FIT_MAX_PADDING,
    );
    const paddingY = Math.min(
      Math.max(ZOOM_FIT_MIN_PADDING, Math.round(dims.height * 0.025)),
      ZOOM_FIT_MAX_PADDING,
    );
    const availableW = Math.max(1, dims.width - paddingX * 2);
    const availableH = Math.max(1, dims.height - paddingY * 2);
    const zoom = Math.max(0.2, Math.min(4, availableW / graphW, availableH / graphH));

    fg.centerAt((left + right) / 2, (top + bottom) / 2, 300);
    fg.zoom(zoom, 300);
  }, [dims.height, dims.width, visibleGraphData]);

  // Stable key: changes only when the set of visible node IDs changes (not on content updates)
  const graphTopologyKey = useMemo(
    () => visibleGraphData.nodes.map((n: any) => n.id as string).sort().join('\0'),
    [visibleGraphData],
  );

  // Set desired layout before the browser paints so the canvas never sees an intermediate state.
  // When a node is focused, regrouped positions are applied; otherwise the base layout is used.
  useLayoutEffect(() => {
    const nodes = visibleGraphData.nodes;
    if (focusedNodeId && highlightIds && highlightIds.size > 0) {
      const focusedLayout = computeFocusedLayout(nodes, highlightIds);
      const next = new Map<string, any>();
      nodes.forEach((node: any) => {
        const pos = focusedLayout.get(node.id as string);
        next.set(node.id as string, {
          ...node,
          x:  pos?.x  ?? (node.x  as number),
          y:  pos?.y  ?? (node.y  as number),
          fx: pos?.x  ?? (node.fx as number),
          fy: pos?.y  ?? (node.fy as number),
        });
      });
      desiredNodeLayoutRef.current = next;
    } else {
      desiredNodeLayoutRef.current = new Map(nodes.map((node: any) => [node.id as string, { ...node }]));
    }
  }, [visibleGraphData, focusedNodeId, highlightIds]);

  // Only mark for reveal when topology (node set) actually changes
  useLayoutEffect(() => {
    needsRevealRef.current = true;
  }, [graphTopologyKey]);

  // Zoom only on topology change or resize — not on content-only updates
  useEffect(() => {
    if (!graphVisible || visibleGraphData.nodes.length === 0) return;
    const t = setTimeout(zoomToFitGraph, 80);
    return () => clearTimeout(t);
  }, [graphVisible, graphTopologyKey, dims.width, zoomToFitGraph]);

  // Push positions from desiredNodeLayoutRef into the force graph's internal node objects.
  // useLayoutEffect already set the correct layout (base or focused) before paint;
  // this effect applies it to the live graph nodes so ForceGraph2D draws them correctly.
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    const desiredById = desiredNodeLayoutRef.current;
    const liveNodes: any[] = fg?.graphData?.()?.nodes ?? visibleGraphData.nodes;
    liveNodes.forEach((node: any) => {
      const desired = desiredById.get(node.id);
      if (!desired) return;
      node.x = desired.x;
      node.y = desired.y;
      node.fx = desired.fx;
      node.fy = desired.fy;
      node.depth = desired.depth;
      node.isCenter = desired.isCenter;
      node.name = desired.name;
      node.vx = 0;
      node.vy = 0;
    });
  }, [visibleGraphData]);

  // Reheat simulation only on topology changes (new nodes/links) — not on content-only updates
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength(0);
    fg.d3Force('link')?.strength(0);
    fg.d3Force('collision', null);
    fg.d3Force('radial', null);
    fg.d3Force('x', null);
    fg.d3Force('y', null);
    fg.d3ReheatSimulation();
  }, [graphTopologyKey]);

  return (
    <div className="w-full h-full flex flex-col">
      <div ref={canvasWrapRef} className="flex-1 min-h-0 overflow-hidden">
        {visibleGraphData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400 select-none">
            找不到筆記
          </div>
        ) : (
          <div style={{ opacity: graphVisible ? 1 : 0, pointerEvents: graphVisible ? 'auto' : 'none' }}>
            <ForceGraph2D
              key={`${centerNoteIds.join('\x00')}|${computedDepth}`}
              ref={graphRef}
              graphData={visibleGraphData}
              width={dims.width}
              height={dims.height}
              backgroundColor="#f8fafc"
              d3AlphaDecay={1}
              linkColor={(link: any) => {
                if (!highlightIds) return '#94a3b8';
                const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                const targetId = typeof link.target === 'object' ? link.target.id : link.target;
                return highlightIds.has(sourceId) && highlightIds.has(targetId)
                  ? '#94a3b8'
                  : 'rgba(148, 163, 184, 0.16)';
              }}
              linkWidth={(link: any) => link.bidirectional ? 2 : 1}
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
                const d = node.depth as number;
                const isCenter = node.isCenter as boolean;
                const color = nodeColor(node);
                const isDimmed = Boolean(highlightIds && !highlightIds.has(node.id as string));
                const { r, nx, ny, lines, lineH, labelX, labelCy, boxX, boxY, boxW, boxH } = labelBoxMetrics(node, ctx);

                // Node circle
                ctx.save();
                ctx.globalAlpha = isDimmed ? 0.18 : 1;
                if (isCenter) {
                  ctx.beginPath();
                  ctx.arc(nx, ny, r + 3, 0, 2 * Math.PI);
                  ctx.fillStyle = hexToRgba(CENTER_COLOR, 0.18);
                  ctx.fill();
                }
                ctx.beginPath();
                ctx.arc(nx, ny, r, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.restore();

                // Label to the right of the node
                ctx.save();
                ctx.globalAlpha = isDimmed ? 0.24 : 1;
                ctx.lineWidth = LABEL_BORDER_WIDTH;
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(boxX, boxY, boxW, boxH);
                ctx.fillStyle = hexToRgba(color, 0.18);
                ctx.fillRect(boxX, boxY, boxW, boxH);
                ctx.strokeStyle = '#111111';
                if ((node.depth as number) < 0) ctx.setLineDash([2, 2]);
                ctx.strokeRect(boxX, boxY, boxW, boxH);
                ctx.setLineDash([]);

                ctx.fillStyle = readableCategoryTextColor(color);
                const textStartY = labelCy - (lines.length - 1) * lineH / 2;
                lines.forEach((line, i) => ctx.fillText(line, labelX, textStartY + i * lineH));
                ctx.restore();
              }}
              nodeCanvasObjectMode={() => 'replace'}
              nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                const { r, nx, ny, boxX, boxY, boxW, boxH } = labelBoxMetrics(node, ctx);
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(nx, ny, r + 3, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillRect(boxX, boxY, boxW, boxH);
              }}
              onRenderFramePre={() => {
                // Keep all nodes pinned to their computed positions
                const desiredById = desiredNodeLayoutRef.current;
                const liveNodes: any[] = graphRef.current?.graphData?.()?.nodes ?? visibleGraphData.nodes;
                liveNodes.forEach((node: any) => {
                  const desired = desiredById.get(node.id);
                  if (!desired) return;
                  node.x = desired.x;
                  node.y = desired.y;
                  node.fx = desired.fx;
                  node.fy = desired.fy;
                  node.vx = 0;
                  node.vy = 0;
                });
              }}
              onRenderFramePost={(ctx: CanvasRenderingContext2D, globalScale: number) => {
                const line = dragLineRef.current;
                if (!line) return;
                ctx.save();
                ctx.lineWidth = 2 / globalScale;
                ctx.strokeStyle = '#4f46e5';
                ctx.fillStyle = '#4f46e5';
                ctx.setLineDash([6 / globalScale, 4 / globalScale]);
                ctx.beginPath();
                ctx.moveTo(line.x1, line.y1);
                ctx.lineTo(line.x2, line.y2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(line.x2, line.y2, 4 / globalScale, 0, 2 * Math.PI);
                ctx.fill();
                ctx.restore();
              }}
              onEngineStop={() => {
                if (needsRevealRef.current) {
                  needsRevealRef.current = false;
                  setGraphVisible(true);
                  setTimeout(zoomToFitGraph, 50);
                }
              }}
              onNodeClick={(node: any, event: MouseEvent) => {
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  return;
                }
                const id = node.id as string;
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault();
                  onNodeCtrlClick?.(id);
                  return;
                }
                suppressZoomRef.current = true;
                setTimeout(() => { suppressZoomRef.current = false; }, 2000);
                setFocusedNodeId(id);
                onNodeClick?.(id, node.name as string | undefined);
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
                setHoverNodeId(null);
              }}
              onNodeDrag={(node: any) => {
                // On touch devices, disable drag-to-connect to avoid conflicting with pan/zoom gestures.
                if (isTouchDevice) return;
                const sourceId = node.id as string;
                const desired = desiredNodeLayoutRef.current.get(sourceId);
                if (!desired) return;
                const mousePos = mouseGraphPosRef.current;
                const dragX = mousePos?.x ?? Number(node.x ?? desired.x);
                const dragY = mousePos?.y ?? Number(node.y ?? desired.y);
                draggingNodeIdRef.current = sourceId;
                dragLineRef.current = {
                  sourceId,
                  x1: Number(desired.x ?? 0),
                  y1: Number(desired.y ?? 0),
                  x2: dragX,
                  y2: dragY,
                };
                node.x = desired.x;
                node.y = desired.y;
                node.fx = desired.fx;
                node.fy = desired.fy;
                node.vx = 0;
                node.vy = 0;
              }}
              onNodeDragEnd={(node: any) => {
                const sourceId = node.id as string;
                const line = dragLineRef.current;
                const dropX = Number(line?.x2 ?? node.x ?? 0);
                const dropY = Number(line?.y2 ?? node.y ?? 0);
                const dragDistance = line ? Math.hypot(line.x2 - line.x1, line.y2 - line.y1) : 0;
                draggingNodeIdRef.current = null;
                dragLineRef.current = null;
                suppressNextClickRef.current = dragDistance > 4;

                if (!isTouchDevice) {
                  const nearest = visibleGraphData.nodes
                    .filter((candidate: any) => candidate.id !== sourceId)
                    .map((candidate: any) => ({
                      id: candidate.id as string,
                      distance: Math.hypot(dropX - Number(candidate.x ?? 0), dropY - Number(candidate.y ?? 0)),
                    }))
                    .sort((a, b) => a.distance - b.distance)[0];

                  if (nearest && nearest.distance <= DROP_CONNECT_THRESHOLD) {
                    onNodeConnect?.(sourceId, nearest.id);
                  }
                }

                const desired = desiredNodeLayoutRef.current.get(sourceId);
                if (desired) {
                  node.x = desired.x;
                  node.y = desired.y;
                  node.fx = desired.fx;
                  node.fy = desired.fy;
                  node.vx = 0;
                  node.vy = 0;
                }
              }}
              cooldownTicks={1}
              enableNodeDrag
              enableZoomInteraction
              nodeLabel="name"
              minZoom={0.2}
              maxZoom={4}
            />
          </div>
        )}
      </div>

      <div
        className="shrink-0 border-t border-gray-200 bg-slate-50"
      >
        <div className="flex items-center gap-2 px-3 py-1.5">
          <button
            type="button"
            onClick={classifyVisibleNotes}
            disabled={isClassifying || graphData.nodes.length <= 1}
            className="h-8 rounded border border-indigo-200 bg-white px-3 text-xl font-medium text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isClassifying ? '分類中...' : 'AI分類'}
          </button>
          {classificationError && <span className="truncate text-xl text-red-500">{classificationError}</span>}
          {categoryList.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setEnabledCategories(new Set(categoryList))}
                className="h-8 rounded border border-gray-200 bg-white px-3 text-xl text-gray-500"
              >
                全選
              </button>
              <button
                type="button"
                onClick={() => setEnabledCategories(new Set())}
                className="h-8 rounded border border-gray-200 bg-white px-3 text-xl text-gray-500"
              >
                取消全部
              </button>
            </>
          )}
        </div>
        {categoryList.length > 0 && (
          <div className="flex max-h-28 flex-wrap gap-3 overflow-y-auto px-3 pb-2">
            {categoryList.map(category => {
              const color = categoryColorMap.get(category) ?? '#64748b';
              return (
                <label key={category} className="flex items-center gap-2 text-xl text-gray-600">
                  <input
                    type="checkbox"
                    checked={enabledCategories.has(category)}
                    onChange={e => {
                      setEnabledCategories(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(category);
                        else next.delete(category);
                        return next;
                      });
                    }}
                    className="size-5 accent-indigo-500"
                  />
                  <span className="size-4 rounded-full" style={{ backgroundColor: color }} />
                  <span>{category}</span>
                </label>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2 px-3" style={{ height: SLIDER_H }}>
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
    </div>
  );
}
