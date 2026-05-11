import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { DAYS, formatTime, getCurrentDayIndex, getCurrentHour } from "../data/mockData";
import BlockPopover from "./BlockPopover";
import {
  buildDaySegments,
  segmentOrderKey,
  loadSegmentOrderObject,
  saveSegmentOrderObject,
  mergeSegmentOrderObject,
} from "../utils/scheduleSegments";
import "./ScheduleGrid.css";

/** Two-hour ticks 0–24 (13 points); last label clamped in UI so it isn’t clipped. */
const HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
const HOUR_LABELS = ["12am", "2am", "4am", "6am", "8am", "10am", "12pm", "2pm", "4pm", "6pm", "8pm", "10pm", "12am"];
const TOTAL_HOURS = 24;
const START_HOUR = 0;

function timeToFraction(hour, minute = 0) {
  return (hour + minute / 60 - START_HOUR) / TOTAL_HOURS;
}

function fractionToHour(frac) {
  const totalHour = frac * TOTAL_HOURS + START_HOUR;
  const hour = Math.floor(totalHour);
  const minute = Math.round((totalHour - hour) * 60 / 15) * 15;
  return { hour: Math.min(hour, 23), minute: minute >= 60 ? 0 : minute };
}

/** Map vertical fraction [0,1] of day column to start time, snapped to nearest 30 minutes. */
function fractionToHourSnap30(frac) {
  const clamped = Math.max(0, Math.min(1, frac));
  const totalMin = clamped * TOTAL_HOURS * 60;
  const snapped = Math.round(totalMin / 30) * 30;
  const capped = Math.min(snapped, 23 * 60 + 30);
  return { hour: Math.floor(capped / 60), minute: capped % 60 };
}

function defaultBlockOrder(blocks, scheduleBlocks) {
  return [...blocks]
    .sort(
      (a, b) =>
        scheduleBlocks.findIndex((x) => x.id === a.id) -
        scheduleBlocks.findIndex((x) => x.id === b.id)
    )
    .map((b) => b.id);
}

function moveIdToIndex(ids, id, toIdx) {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  const to = Math.max(0, Math.min(ids.length - 1, toIdx));
  if (from === to) return ids;
  const copy = [...ids];
  copy.splice(from, 1);
  copy.splice(to, 0, id);
  return copy;
}

export default function ScheduleGrid({
  scheduleBlocks, selectedBlockId, onBlockClick, onGridClick,
  onUpdateBlock, onRemoveBlock, onPlay, onAddBlock, onBlocksReordered,
}) {
  const gridRef = useRef(null);
  const firstColBodyRef = useRef(null);
  const scheduleRef = useRef(scheduleBlocks);
  scheduleRef.current = scheduleBlocks;

  /** Segment key → ordered block ids (left = plays first). Synced with segmentOrder state for drag handlers. */
  const orderMapRef = useRef(new Map());
  const [segmentOrder, setSegmentOrder] = useState(() => loadSegmentOrderObject());

  const [colBodyHeight, setColBodyHeight] = useState(0);
  const [popoverPos, setPopoverPos] = useState(null);
  const [nowHour, setNowHour] = useState(getCurrentHour());
  const [dragOverDayIdx, setDragOverDayIdx] = useState(null);
  const todayIdx = getCurrentDayIndex();

  useEffect(() => {
    const clear = () => setDragOverDayIdx(null);
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, []);

  const handleColumnDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleColumnDragEnter = useCallback((e, dayIdx) => {
    e.preventDefault();
    setDragOverDayIdx(dayIdx);
  }, []);

  const handleColumnDragLeave = useCallback((e, dayIdx) => {
    const related = e.relatedTarget;
    if (!related || !e.currentTarget.contains(related)) {
      setDragOverDayIdx((cur) => (cur === dayIdx ? null : cur));
    }
  }, []);

  const handleDropOnDay = useCallback((e, dayIdx) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDayIdx(null);
    if (!onAddBlock) return;

    const playlistId = e.dataTransfer.getData("playlistId");
    if (!playlistId) return;

    const playlistName = e.dataTransfer.getData("playlistName") || "Playlist";
    let playlistColor = e.dataTransfer.getData("playlistColor");
    if (!playlistColor) playlistColor = "#BF5AF2";

    const songCountRaw = e.dataTransfer.getData("playlistSongCount");
    const parsedSongCount = songCountRaw !== "" ? parseInt(songCountRaw, 10) : NaN;
    const songCount = Number.isFinite(parsedSongCount) ? parsedSongCount : 10;

    const colBody = e.currentTarget.classList.contains("grid-col-body")
      ? e.currentTarget
      : e.currentTarget.closest(".grid-col-body");
    if (!colBody) return;

    const rect = colBody.getBoundingClientRect();
    const h = rect.height || 1;
    const frac = (e.clientY - rect.top) / h;
    const { hour, minute } = fractionToHourSnap30(frac);

    const durationMinutes = Math.max(
      30,
      Math.min(Math.round(songCount * 3.5), 1440)
    );
    const maxEnd = 23 * 60 + 59;
    const startTotal = hour * 60 + minute;
    const endTotal = Math.min(startTotal + durationMinutes, maxEnd);
    const endHour = Math.floor(endTotal / 60);
    const endMinute = endTotal % 60;

    onAddBlock({
      playlistId,
      playlistName,
      playlistColor,
      songCount,
      dayIndex: dayIdx,
      startHour: hour,
      startMinute: minute,
      endHour,
      endMinute,
    });
  }, [onAddBlock]);

  useEffect(() => {
    const merged = mergeSegmentOrderObject(scheduleBlocks, loadSegmentOrderObject());
    saveSegmentOrderObject(merged);
    orderMapRef.current = new Map(Object.entries(merged));
    setSegmentOrder(merged);
  }, [scheduleBlocks]);

  useEffect(() => {
    if (!onBlocksReordered) return;
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const dayBlocks = scheduleBlocks.filter((b) => b.days.includes(dayIdx));
      const segments = buildDaySegments(dayBlocks);
      for (const seg of segments) {
        const segKey = segmentOrderKey(dayIdx, seg.segStart, seg.segEnd);
        const orderedIds =
          segmentOrder[segKey] ?? defaultBlockOrder(seg.blocks, scheduleBlocks);
        onBlocksReordered(segKey, orderedIds);
      }
    }
  }, [scheduleBlocks, segmentOrder, onBlocksReordered]);

  useEffect(() => {
    const id = setInterval(() => setNowHour(getCurrentHour()), 60000);
    return () => clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    const el = firstColBodyRef.current;
    if (!el) return undefined;
    const measure = () => setColBodyHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectedBlock = useMemo(() =>
    scheduleBlocks.find(b => b.id === selectedBlockId),
    [scheduleBlocks, selectedBlockId]
  );

  const handleBlockClick = useCallback((e, blockId) => {
    e.stopPropagation();
    onBlockClick(blockId);
    const rect = e.currentTarget.getBoundingClientRect();
    const gridRect = gridRef.current?.getBoundingClientRect();
    if (gridRect) {
      const POPOVER_W = 248;
      const POPOVER_H = 300;
      const spaceRight = gridRect.right - rect.right;
      const x = spaceRight >= POPOVER_W + 12
        ? rect.right - gridRect.left + 8
        : rect.left - gridRect.left - POPOVER_W - 8;
      const maxY = gridRect.height - POPOVER_H - 8;
      const y = Math.max(8, Math.min(rect.top - gridRect.top, maxY));
      setPopoverPos({ x, y });
    }
  }, [onBlockClick]);

  const handleGridClick = useCallback(() => {
    onGridClick();
    setPopoverPos(null);
  }, [onGridClick]);

  const handleResizeDrag = useCallback((e, block) => {
    e.preventDefault(); e.stopPropagation();
    const gridRect = gridRef.current?.getBoundingClientRect();
    const gridH = gridRect?.height ?? 1;

    const maxEndMin = 23 * 60 + 59;
    const onMove = (ev) => {
      const y = ev.clientY - gridRect.top;
      const frac = Math.max(0, Math.min(1, y / gridH));
      const { hour, minute } = fractionToHour(frac);
      const candidateEnd = hour * 60 + minute;
      const minEnd = block.startHour * 60 + block.startMinute + 30;
      if (candidateEnd > minEnd) {
        const capped = Math.min(candidateEnd, maxEndMin);
        onUpdateBlock(block.id, { endHour: Math.floor(capped / 60), endMinute: capped % 60 });
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [onUpdateBlock]);

  const handleBlockDrag = useCallback((e, block) => {
    e.preventDefault(); e.stopPropagation();
    const gridRect = gridRef.current?.getBoundingClientRect();
    if (!gridRect) return;

    document.body.classList.add("schedule-block-dragging");

    const gridH = gridRect.height - 40;
    const gridW = gridRect.width;
    const colW = gridW / 7;
    const duration = (block.endHour * 60 + block.endMinute) - (block.startHour * 60 + block.startMinute);
    const blockStartFrac = timeToFraction(block.startHour, block.startMinute);
    const startY = e.clientY;
    const startX = e.clientX;
    const sourceDayIdx = block.days.length === 1 ? block.days[0] : null;

    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      const deltaFrac = dy / gridH;
      const newStartFrac = Math.max(0, Math.min(1 - duration / (TOTAL_HOURS * 60), blockStartFrac + deltaFrac));
      const { hour, minute } = fractionToHour(newStartFrac);
      const maxEndMin = 23 * 60 + 59;
      const endTotalMin = Math.min(hour * 60 + minute + duration, maxEndMin);
      const endH = Math.floor(endTotalMin / 60);
      const endM = endTotalMin % 60;

      const relX = ev.clientX - gridRect.left - 44;
      const targetDay = Math.max(0, Math.min(6, Math.floor(relX / colW)));

      const newDays = sourceDayIdx !== null ? [targetDay] : block.days;

      const virtualBlock = {
        ...block,
        startHour: hour,
        startMinute: minute,
        endHour: endH,
        endMinute: endM,
        days: newDays,
      };

      const sched = scheduleRef.current;
      if (sourceDayIdx !== null && targetDay === sourceDayIdx) {
        const dayBlocks = sched
          .filter((b) => b.days.includes(targetDay))
          .map((b) => (b.id === block.id ? virtualBlock : b));
        const segments = buildDaySegments(dayBlocks);
        const seg = segments.find((s) => s.blocks.some((bk) => bk.id === block.id));
        if (seg && seg.blocks.length >= 2) {
          const key = segmentOrderKey(targetDay, seg.segStart, seg.segEnd);
          const prevOrder = orderMapRef.current.get(key)
            ?? defaultBlockOrder(seg.blocks, sched);
          const orderedIds = [...prevOrder].filter((id) => seg.blocks.some((b) => b.id === id));
          const missing = seg.blocks.filter((sb) => !orderedIds.includes(sb.id));
          missing.sort(
            (a, b) =>
              sched.findIndex((x) => x.id === a.id) - sched.findIndex((x) => x.id === b.id)
          );
          for (const sb of missing) orderedIds.push(sb.id);
          const n = orderedIds.length;
          const colLeft = gridRect.left + 44 + targetDay * colW;
          const mouseRelCol = Math.max(0, Math.min(colW, ev.clientX - colLeft));
          const impliedIdx = Math.min(n - 1, Math.max(0, Math.floor((mouseRelCol / colW) * n)));
          const fromIdx = orderedIds.indexOf(block.id);
          if (fromIdx !== -1 && impliedIdx !== fromIdx) {
            const nextIds = moveIdToIndex(orderedIds, block.id, impliedIdx);
            const same = nextIds.length === orderedIds.length
              && nextIds.every((id, i) => id === orderedIds[i]);
            if (!same) {
              orderMapRef.current.set(key, nextIds);
              const fullObj = Object.fromEntries(orderMapRef.current);
              saveSegmentOrderObject(fullObj);
              setSegmentOrder(fullObj);
            }
          }
        }
      }

      onUpdateBlock(block.id, {
        startHour: hour, startMinute: minute,
        endHour: endH, endMinute: endM,
        days: newDays,
      });
    };

    const onUp = () => {
      document.body.classList.remove("schedule-block-dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [onUpdateBlock]);

  const nowFrac = timeToFraction(Math.floor(nowHour), Math.round((nowHour % 1) * 60));
  const showNow = nowHour >= START_HOUR && nowHour <= START_HOUR + TOTAL_HOURS;

  return (
    <div className="schedule-panel" onClick={handleGridClick}>
      <div className="schedule-header">
        <div>
          <h2 className="schedule-title">Weekly Schedule</h2>
          <p className="schedule-sub">Click a playlist to add · Drag to move · Drag bottom edge to resize</p>
        </div>
      </div>

      <div className="grid-wrap" ref={gridRef}>
        <div className="grid-body">
          {DAYS.map((day, dayIdx) => {
            const isToday = dayIdx === todayIdx;
            const isWeekend = dayIdx >= 5;
            const dayBlocks = scheduleBlocks.filter(b => b.days.includes(dayIdx));
            const segments = buildDaySegments(dayBlocks);

            return (
              <div key={day} className={`grid-col ${isToday ? "today" : ""} ${isWeekend ? "weekend" : ""}`}>
                <div className="grid-col-header">
                  <span className={`grid-day-label ${isToday ? "today" : ""}`}>{day}</span>
                  {isToday && <span className="grid-today-dot" />}
                </div>
                <div
                  className={`grid-col-body${dragOverDayIdx === dayIdx ? " drag-over" : ""}`}
                  ref={dayIdx === 0 ? firstColBodyRef : undefined}
                  onDragOver={handleColumnDragOver}
                  onDragEnter={(ev) => handleColumnDragEnter(ev, dayIdx)}
                  onDragLeave={(ev) => handleColumnDragLeave(ev, dayIdx)}
                  onDrop={(ev) => handleDropOnDay(ev, dayIdx)}
                >
                  {HOURS.map((h, i) => (
                    <div
                      key={h}
                      className="grid-hour-line"
                      style={{
                        top: colBodyHeight > 0
                          ? `${timeToFraction(h) * colBodyHeight}px`
                          : `${timeToFraction(h) * 100}%`,
                      }}
                    >
                      {dayIdx === 0 && (
                        <span className="grid-hour-label">{HOUR_LABELS[i]}</span>
                      )}
                    </div>
                  ))}

                  {segments.map((seg) => {
                    const segKey = segmentOrderKey(dayIdx, seg.segStart, seg.segEnd);
                    const orderedIds = segmentOrder[segKey]
                      ?? defaultBlockOrder(seg.blocks, scheduleBlocks);
                    const orderedBlocks = orderedIds
                      .map((id) => seg.blocks.find((b) => b.id === id))
                      .filter(Boolean);
                    const topFrac = timeToFraction(Math.floor(seg.segStart / 60), seg.segStart % 60);
                    const botFrac = timeToFraction(Math.floor(seg.segEnd / 60), seg.segEnd % 60);
                    const heightFrac = botFrac - topFrac;
                    const colCount = orderedBlocks.length;

                    return (
                      <div
                        key={segKey}
                        className="overlap-segment-wrap"
                        style={{
                          top: `${topFrac * 100}%`,
                          height: `${Math.max(heightFrac * 100, 2)}%`,
                        }}
                        onDragOver={handleColumnDragOver}
                        onDrop={(ev) => handleDropOnDay(ev, dayIdx)}
                      >
                        {orderedBlocks.map((b, bi) => {
                          const isSelected = b.id === selectedBlockId;
                          const widthPct = 100 / colCount;
                          const leftPct = bi * widthPct;
                          return (
                            <div
                              key={b.id}
                              className={`schedule-block ${isSelected ? "selected" : ""}`}
                              style={{
                                top: 0,
                                height: "100%",
                                left: `calc(${leftPct}% + 2px)`,
                                width: `calc(${widthPct}% - 4px)`,
                                "--block-color": b.playlistColor,
                              }}
                              onDragOver={handleColumnDragOver}
                              onDrop={(ev) => handleDropOnDay(ev, dayIdx)}
                              onMouseDown={(ev) => { if (ev.button === 0) handleBlockDrag(ev, b); }}
                              onClick={(ev) => handleBlockClick(ev, b.id)}
                            >
                              <div className="block-top-bar" />
                              <div className="block-content">
                                <span className="block-name">{colCount > 1 ? b.playlistName.split(" ")[0] : b.playlistName}</span>
                                {heightFrac > 0.08 && (
                                  <span className="block-time">
                                    {formatTime(b.startHour, b.startMinute)} – {formatTime(b.endHour, b.endMinute)}
                                  </span>
                                )}
                              </div>
                              <div
                                className="block-resize-handle"
                                onMouseDown={(ev) => { ev.stopPropagation(); handleResizeDrag(ev, b); }}
                              />
                            </div>
                          );
                        })}

                        {colCount > 1 && (
                          <div className="swap-hints" aria-hidden>
                            {orderedBlocks.slice(0, -1).map((_, hi) => (
                              <span
                                key={hi}
                                className="swap-hint"
                                style={{ left: `${((hi + 1) / colCount) * 100}%` }}
                              >
                                ⇄
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {isToday && showNow && (
                    <div className="now-line" style={{ top: `${nowFrac * 100}%` }}>
                      <div className="now-line-dot" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedBlock && popoverPos && (
        <BlockPopover
          block={selectedBlock}
          position={popoverPos}
          onUpdate={onUpdateBlock}
          onRemove={(id) => { onRemoveBlock(id); setPopoverPos(null); }}
          onPlay={onPlay}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}
