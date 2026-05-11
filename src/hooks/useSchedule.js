import { useState, useEffect, useCallback } from "react";
import { getCurrentDayIndex } from "../data/mockData";

/** Mon=0 … Sun=6 from JS `Date.getDay()` (Sun=0 … Sat=6). */
export function getMondayBasedDayIndex(date = new Date()) {
  const js = date.getDay();
  return js === 0 ? 6 : js - 1;
}

/** Current time as fractional hours (e.g. 9:30 → 9.5) for window comparisons. */
export function getCurrentTimeDecimalHours(date = new Date()) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

const STORAGE_KEY = "tuneset_schedule_v1";

/** Fallback accent when playlist has no `color` — cycle by list index. */
export const PLAYLIST_ACCENT_COLORS = [
  "#1DB954",
  "#E8115B",
  "#509BF5",
  "#AF2896",
  "#F573A0",
  "#FFD200",
  "#9BF0E1",
];

export function useSchedule() {
  const [scheduleBlocks, setScheduleBlocks] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scheduleBlocks));
    console.log("SAVING_SCHEDULE", scheduleBlocks.length);
  }, [scheduleBlocks]);

  const addBlock = useCallback((playlist, colorIndex = 0) => {
    const dayIndex = getCurrentDayIndex();
    const playlistColor = playlist.color
      ?? PLAYLIST_ACCENT_COLORS[colorIndex % PLAYLIST_ACCENT_COLORS.length];
    const newBlock = {
      id: `block-${Date.now()}`,
      playlistId: playlist.id,
      playlistName: playlist.name,
      playlistColor,
      days: [dayIndex],
      // Default block: 9:00–11:00
      startHour: 9,
      startMinute: 0,
      endHour: 11,
      endMinute: 0,
      shuffle: false,
    };
    setScheduleBlocks(prev => [...prev, newBlock]);
    return newBlock.id;
  }, []);

  const updateBlock = useCallback((blockId, updates) => {
    setScheduleBlocks(prev =>
      prev.map(b => b.id === blockId ? { ...b, ...updates } : b)
    );
  }, []);

  const removeBlock = useCallback((blockId) => {
    setScheduleBlocks(prev => prev.filter(b => b.id !== blockId));
  }, []);

  const getBlocksForDay = useCallback((dayIndex) => {
    return scheduleBlocks.filter(b => b.days.includes(dayIndex));
  }, [scheduleBlocks]);

  const getNowPlaying = useCallback(() => {
    const now = new Date();
    const jsDay = now.getDay();
    const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let blocks = [];
    try {
      blocks = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      blocks = [];
    }

    return blocks.filter((b) => {
      const startMin = b.startHour * 60 + b.startMinute;
      const endMin = b.endHour * 60 + b.endMinute;
      return b.days.includes(dayIndex) && currentMinutes >= startMin && currentMinutes < endMin;
    });
  }, []);

  return { scheduleBlocks, addBlock, updateBlock, removeBlock, getBlocksForDay, getNowPlaying };
}
