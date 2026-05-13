import { useCallback, useEffect, useState } from "react";
import { DAYS } from "../data/mockData";
import "./BlockPopover.css";

function hourLabel(h) {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: hourLabel(h),
}));

function clampMinute(minute) {
  const m = Math.round(Number(minute) || 0);
  return Math.max(0, Math.min(59, m));
}

function padMinute(m) {
  return String(clampMinute(m)).padStart(2, "0");
}

function totalMinutes(h, m) {
  return h * 60 + m;
}

/** Minutes from start to end on the same calendar day, or across midnight if end is earlier on the clock. */
function spanMinutesStartToEnd(startH, startM, endH, endM) {
  const startT = totalMinutes(startH, startM);
  const endT = totalMinutes(endH, endM);
  let span = endT - startT;
  if (span < 0) span += 24 * 60;
  return span;
}

const MIN_SCHEDULE_GAP = 30;

export default function BlockPopover({
  block, position, onUpdate, onShuffleToggle, onRemove, onPlay, onClick,
}) {
  const startHour = Math.max(0, Math.min(23, block.startHour ?? 0));
  const endHour = Math.max(0, Math.min(23, block.endHour ?? 0));
  const startMinute = clampMinute(block.startMinute);
  const endMinute = clampMinute(block.endMinute);

  const [startMinuteDraft, setStartMinuteDraft] = useState(null);
  const [endMinuteDraft, setEndMinuteDraft] = useState(null);

  useEffect(() => {
    setStartMinuteDraft(null);
  }, [block.id, startMinute]);

  useEffect(() => {
    setEndMinuteDraft(null);
  }, [block.id, endMinute]);

  const handleStartHourChange = useCallback(
    (e) => {
      const hour = Number(e.target.value);
      if (!Number.isFinite(hour)) return;
      const minute = clampMinute(block.startMinute);
      const span = spanMinutesStartToEnd(
        hour,
        minute,
        block.endHour,
        clampMinute(block.endMinute)
      );
      if (span < MIN_SCHEDULE_GAP) return;
      onUpdate(block.id, { startHour: hour, startMinute: minute });
    },
    [block, onUpdate]
  );

  const handleStartMinuteChange = useCallback(
    (e) => {
      const raw = e.target.value;
      if (raw.trim() === "") {
        setStartMinuteDraft(null);
        return;
      }
      setStartMinuteDraft(raw);
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      const minute = clampMinute(Math.trunc(n));
      const hour = block.startHour;
      const span = spanMinutesStartToEnd(
        hour,
        minute,
        block.endHour,
        clampMinute(block.endMinute)
      );
      if (span < MIN_SCHEDULE_GAP) return;
      onUpdate(block.id, { startHour: hour, startMinute: minute });
      setStartMinuteDraft(null);
    },
    [block, onUpdate]
  );

  const handleEndHourChange = useCallback(
    (e) => {
      const hour = Number(e.target.value);
      if (!Number.isFinite(hour)) return;
      const minute = clampMinute(block.endMinute);
      const span = spanMinutesStartToEnd(
        block.startHour,
        clampMinute(block.startMinute),
        hour,
        minute
      );
      if (span < MIN_SCHEDULE_GAP) return;
      onUpdate(block.id, { endHour: hour, endMinute: minute });
    },
    [block, onUpdate]
  );

  const handleEndMinuteChange = useCallback(
    (e) => {
      const raw = e.target.value;
      if (raw.trim() === "") {
        setEndMinuteDraft(null);
        return;
      }
      setEndMinuteDraft(raw);
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      const minute = clampMinute(Math.trunc(n));
      const hour = block.endHour;
      const span = spanMinutesStartToEnd(
        block.startHour,
        clampMinute(block.startMinute),
        hour,
        minute
      );
      if (span < MIN_SCHEDULE_GAP) return;
      onUpdate(block.id, { endHour: hour, endMinute: minute });
      setEndMinuteDraft(null);
    },
    [block, onUpdate]
  );

  const handleStartMinuteBlur = useCallback(() => {
    setStartMinuteDraft(null);
  }, []);

  const handleEndMinuteBlur = useCallback(() => {
    setEndMinuteDraft(null);
  }, []);

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

  const style = {
    top: Math.max(8, position.y),
    left: Math.min(position.x, position.x),
  };

  return (
    <div
      className="popover"
      style={style}
      onClick={onClick}
    >
      <div className="popover-strip" style={{ background: block.playlistColor }} />

      <div className="popover-header">
        <div>
          <p className="popover-title">{block.playlistName}</p>
          <div className="bp-time-row">
            <div className="bp-time-field">
              <span className="bp-time-label">Start</span>
              <div className="bp-time-selects">
                <select
                  className="bp-time-select"
                  value={startHour}
                  onChange={handleStartHourChange}
                  aria-label="Start hour"
                >
                  {HOUR_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="bp-time-input-num"
                  value={startMinuteDraft !== null ? startMinuteDraft : padMinute(startMinute)}
                  onChange={handleStartMinuteChange}
                  onBlur={handleStartMinuteBlur}
                  aria-label="Start minute"
                  aria-valuetext={padMinute(startMinute)}
                />
              </div>
            </div>
            <div className="bp-time-field">
              <span className="bp-time-label">End</span>
              <div className="bp-time-selects">
                <select
                  className="bp-time-select"
                  value={endHour}
                  onChange={handleEndHourChange}
                  aria-label="End hour"
                >
                  {HOUR_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="bp-time-input-num"
                  value={endMinuteDraft !== null ? endMinuteDraft : padMinute(endMinute)}
                  onChange={handleEndMinuteChange}
                  onBlur={handleEndMinuteBlur}
                  aria-label="End minute"
                  aria-valuetext={padMinute(endMinute)}
                />
              </div>
            </div>
          </div>
          <p className="popover-subtitle">{formatDayLabel()}</p>
        </div>
        <button
          className="popover-play-btn"
          style={{ "--btn-color": block.playlistColor }}
          onClick={() => onPlay(block)}
          title="Play now"
        >▶</button>
      </div>

      <div className="popover-divider" />

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

      <button className="popover-remove" onClick={() => onRemove(block.id)}>
        Remove from schedule
      </button>
    </div>
  );
}
