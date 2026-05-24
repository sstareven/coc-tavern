import { useState, useRef, useCallback, useEffect } from 'react';
import { useSettingsStore } from '../../stores/useSettingsStore';

export function MusicPlayer() {
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const setMusicVolume = useSettingsStore((s) => s.setMusicVolume);
  const [playing, setPlaying] = useState(false);
  const [trackName, setTrackName] = useState('未加载音轨');
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const playerRef = useRef<HTMLDivElement>(null);

  // Initial position — bottom-left corner offset
  useEffect(() => {
    setPos({ x: window.innerWidth - 260, y: window.innerHeight - 60 });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...pos };
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPos({
        x: posStart.current.x + dx,
        y: posStart.current.y + dy,
      });
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  const togglePlay = () => setPlaying(!playing);

  const handleFileImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) setTrackName(file.name);
    };
    input.click();
  };

  return (
    <div
      ref={playerRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 600,
        cursor: dragging ? 'grabbing' : 'grab',
        background: 'rgba(13,10,7,0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(196,168,85,0.2)',
        borderRadius: 6,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        userSelect: 'none',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        transition: dragging ? 'none' : 'box-shadow 0.3s',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        style={{
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--gold)',
          borderRadius: '50%',
          background: 'rgba(196,168,85,0.1)',
          color: 'var(--gold)',
          fontSize: 12,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {playing ? '⏸' : '▶'}
      </button>

      {/* Track name */}
      <div
        style={{
          minWidth: 80,
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 10,
          fontFamily: 'var(--font-ui)',
          color: 'var(--text-light)',
          letterSpacing: 1,
        }}
      >
        {trackName}
      </div>

      {/* Volume slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--ink-subtle)' }}>
          {playing ? '🔊' : '🔈'}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={musicVolume}
          onChange={(e) => setMusicVolume(Number(e.target.value))}
          style={{ width: 60, accentColor: 'var(--gold)', height: 4 }}
        />
      </div>

      {/* File import */}
      <button
        onClick={handleFileImport}
        style={{
          width: 22,
          height: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid transparent',
          borderRadius: 3,
          background: 'transparent',
          color: 'var(--ink-subtle)',
          fontSize: 10,
          cursor: 'pointer',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; }}
        title="导入音频文件"
      >
        +
      </button>
    </div>
  );
}
