/** localStorage key for overlap play order within each segment. */
export const SEGMENT_ORDER_STORAGE_KEY = "tuneset_segment_order_v1";

export function segmentOrderKey(dayIdx, segStart, segEnd) {
  return `${dayIdx}-${segStart}-${segEnd}`;
}

/** Group blocks by day into time segments; overlapping blocks share a segment (side-by-side). */
export function buildDaySegments(dayBlocks) {
  if (!dayBlocks.length) return [];
  const sorted = [...dayBlocks].sort(
    (a, b) => a.startHour * 60 + a.startMinute - (b.startHour * 60 + b.startMinute)
  );
  const boundaries = new Set();
  for (const b of sorted) {
    boundaries.add(b.startHour * 60 + b.startMinute);
    boundaries.add(b.endHour * 60 + b.endMinute);
  }
  const times = [...boundaries].sort((a, b) => a - b);
  const segments = [];
  for (let i = 0; i < times.length - 1; i++) {
    const segStart = times[i];
    const segEnd = times[i + 1];
    const active = sorted.filter((b) => {
      const bs = b.startHour * 60 + b.startMinute;
      const be = b.endHour * 60 + b.endMinute;
      return bs <= segStart && be >= segEnd;
    });
    if (active.length > 0) {
      segments.push({ segStart, segEnd, blocks: active });
    }
  }
  return segments;
}

export function loadSegmentOrderObject() {
  try {
    const raw = localStorage.getItem(SEGMENT_ORDER_STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

export function saveSegmentOrderObject(obj) {
  try {
    localStorage.setItem(SEGMENT_ORDER_STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn("saveSegmentOrderObject failed", e);
  }
}

/** Merge stored order with current segments; default order follows scheduleBlocks array order. Pure — does not write localStorage. */
export function mergeSegmentOrderObject(scheduleBlocks, stored) {
  const out = { ...stored };

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayBlocks = scheduleBlocks.filter((b) => b.days.includes(dayIdx));
    const segments = buildDaySegments(dayBlocks);
    for (const seg of segments) {
      const key = segmentOrderKey(dayIdx, seg.segStart, seg.segEnd);
      const idsInSeg = new Set(seg.blocks.map((b) => b.id));
      const prev = Array.isArray(out[key]) ? out[key].filter((id) => idsInSeg.has(id)) : [];
      const defaultOrder = [...seg.blocks]
        .sort(
          (a, b) =>
            scheduleBlocks.findIndex((x) => x.id === a.id) -
            scheduleBlocks.findIndex((x) => x.id === b.id)
        )
        .map((b) => b.id);
      const merged = [...prev];
      for (const id of defaultOrder) {
        if (!merged.includes(id)) merged.push(id);
      }
      out[key] = merged;
    }
  }

  const validKeys = new Set();
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayBlocks = scheduleBlocks.filter((b) => b.days.includes(dayIdx));
    for (const seg of buildDaySegments(dayBlocks)) {
      validKeys.add(segmentOrderKey(dayIdx, seg.segStart, seg.segEnd));
    }
  }
  for (const k of Object.keys(out)) {
    if (!validKeys.has(k)) delete out[k];
  }

  return out;
}

/**
 * For "now" on a given day, return active blocks ordered for playback (left segment slot first).
 * @param {number} dayIndex Mon=0 … Sun=6
 * @param {number} nowMinutes 0–1439
 */
export function getOrderedActiveBlocksForNow(scheduleBlocks, dayIndex, nowMinutes) {
  const active = scheduleBlocks.filter((b) => {
    if (!b.days.includes(dayIndex)) return false;
    const start = b.startHour * 60 + b.startMinute;
    const end = b.endHour * 60 + b.endMinute;
    return nowMinutes >= start && nowMinutes < end;
  });
  if (active.length <= 1) return active;

  const dayBlocks = scheduleBlocks.filter((b) => b.days.includes(dayIndex));
  const segments = buildDaySegments(dayBlocks);
  const seg = segments.find((s) => nowMinutes >= s.segStart && nowMinutes < s.segEnd);
  if (!seg || seg.blocks.length <= 1) return active;

  const key = segmentOrderKey(dayIndex, seg.segStart, seg.segEnd);
  const orderObj = loadSegmentOrderObject();
  const orderedIds = Array.isArray(orderObj[key])
    ? orderObj[key].filter((id) => seg.blocks.some((b) => b.id === id))
    : [];
  const rest = seg.blocks
    .map((b) => b.id)
    .filter((id) => !orderedIds.includes(id))
    .sort(
      (a, b) =>
        scheduleBlocks.findIndex((x) => x.id === a) -
        scheduleBlocks.findIndex((x) => x.id === b)
    );
  const fullOrder = [...orderedIds, ...rest];
  const byId = new Map(active.map((b) => [b.id, b]));
  const seen = new Set();
  const result = [];
  for (const id of fullOrder) {
    const b = byId.get(id);
    if (b && !seen.has(id)) {
      seen.add(id);
      result.push(b);
    }
  }
  for (const b of active) {
    if (!seen.has(b.id)) result.push(b);
  }
  return result;
}
