import { useCallback } from "react";
import { DAYS, formatTime } from "../data/mockData";
import "./BlockPopover.css";

export default function BlockPopover({
  block, position, onUpdate, onShuffleToggle, onRemove, onPlay, onClick,
}) {

  const toggleDay = useCallback((dayIdx) => {
    const current = block.days;
    const next = current.includes(dayIdx)
      ? current.filter(d => d !== dayIdx)
      : [...current, dayIdx].sort((a, b) => a - b);
    if (next.length > 0) onUpdate(block.id, { days: next });
  }, [block, onUpdate]);

  const toggleShuffle = useCallback(() => {
    const newValue = !block.shuffle;
    onUpdate(block.id, { shuffle: newValue });
    onShuffleToggle?.(block.id, newValue);
  }, [block, onUpdate, onShuffleToggle]);

  const formatDayLabel = () => {
    const d = block.days;
    if (d.length === 7) return "Every day";
    if (d.length === 5 && !d.includes(5) && !d.includes(6)) return "Mon–Fri";
    if (d.length === 2 && d.includes(5) && d.includes(6)) return "Weekends";
    if (d.length === 1) return `${DAYS[d[0]]} only`;
    return d.map(i => DAYS[i]).join(", ");
  };

  // Smart popover position — keep inside panel
  const style = {
    top: Math.max(8, position.y),
    left: Math.min(position.x, position.x), // will be clamped by CSS
  };

  return (
    <div
      className="popover"
      style={style}
      onClick={onClick}
    >
      {/* Color strip */}
      <div className="popover-strip" style={{ background: block.playlistColor }} />

      {/* Header */}
      <div className="popover-header">
        <div>
          <p className="popover-title">{block.playlistName}</p>
          <p className="popover-subtitle">
            {formatTime(block.startHour, block.startMinute)} – {formatTime(block.endHour, block.endMinute)}
            &nbsp;·&nbsp;{formatDayLabel()}
          </p>
        </div>
        <button
          className="popover-play-btn"
          style={{ "--btn-color": block.playlistColor }}
          onClick={() => onPlay(block)}
          title="Play now"
        >▶</button>
      </div>

      <div className="popover-divider" />

      {/* Days */}
      <div className="popover-section">
        <p className="popover-label">DAYS</p>
        <div className="popover-days">
          {DAYS.map((day, idx) => (
            <button
              key={day}
              className={`popover-day ${block.days.includes(idx) ? "on" : ""}`}
              style={{ "--day-color": block.playlistColor }}
              onClick={() => toggleDay(idx)}
            >
              {day[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="popover-divider" />

      {/* Shuffle */}
      <div className="popover-section popover-row">
        <div>
          <p className="popover-row-label">Shuffle</p>
          <p className="popover-row-sub">{block.shuffle ? "On — random order" : "Off — plays in order"}</p>
        </div>
        <button
          className={`toggle ${block.shuffle ? "on" : ""}`}
          style={{ "--t-color": block.playlistColor }}
          onClick={toggleShuffle}
        >
          <span className="toggle-knob" />
        </button>
      </div>

      <div className="popover-divider" />

      {/* Remove */}
      <button className="popover-remove" onClick={() => onRemove(block.id)}>
        Remove from schedule
      </button>
    </div>
  );
}
