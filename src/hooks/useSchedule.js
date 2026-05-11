import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "tuneset_schedule_v1";

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
  }, [scheduleBlocks]);

  const addBlock = useCallback((playlist) => {
    const now = new Date();
    const jsDay = now.getDay();
    const dayIndex = jsDay === 0 ? 6 : jsDay - 1;

    const newBlock = {
      id: `block-${Date.now()}`,
      playlistId: playlist.id,
      playlistName: playlist.name,
      playlistColor: playlist.color,
      days: [dayIndex],
      startHour: 9,
      startMinute: 0,
      endHour: 11,
      endMinute: 0,
      shuffle: false,
    };
    setScheduleBlocks(prev => [...prev, newBlock]);
    return newBlock.id;
  }, []);

  const addBlockAt = useCallback((blockConfig) => {
    const endTotalMinutes = blockConfig.startHour * 60 + blockConfig.startMinute + 120;
    const endHour = Math.min(Math.floor(endTotalMinutes / 60), 23);
    const endMinute = endTotalMinutes % 60;

    const newBlock = {
      id: `block-${Date.now()}`,
      playlistId: blockConfig.playlistId,
      playlistName: blockConfig.playlistName,
      playlistColor: blockConfig.playlistColor,
      days: [blockConfig.dayIndex],
      startHour: blockConfig.startHour,
      startMinute: blockConfig.startMinute,
      endHour,
      endMinute,
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
    return scheduleBlocks.filter(b => {
      if (!b.days.includes(dayIndex)) return false;
      const start = b.startHour * 60 + b.startMinute;
      const end = b.endHour * 60 + b.endMinute;
      return currentMinutes >= start && currentMinutes < end;
    });
  }, [scheduleBlocks]);

  return { scheduleBlocks, addBlock, addBlockAt, updateBlock, removeBlock, getBlocksForDay, getNowPlaying };
}
