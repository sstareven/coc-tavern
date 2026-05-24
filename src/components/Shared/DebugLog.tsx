import { useState, useEffect, useCallback } from 'react';

interface LogEntry {
  id: number;
  time: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

let logId = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function pushLog(level: LogEntry['level'], message: string) {
  const entry: LogEntry = {
    id: ++logId,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    level,
    message,
  };
  // Store in a global array
  if (!(window as unknown as Record<string, unknown>).__debugLogs) {
    (window as unknown as Record<string, unknown>).__debugLogs = [];
  }
  ((window as unknown as Record<string, unknown>).__debugLogs as LogEntry[]).push(entry);
  // Cap at 200 entries
  const logs = (window as unknown as Record<string, unknown>).__debugLogs as LogEntry[];
  while (logs.length > 200) logs.shift();
  notify();
}

export function getLogs(): LogEntry[] {
  return ((window as unknown as Record<string, unknown>).__debugLogs as LogEntry[]) ?? [];
}

const levelColors: Record<LogEntry['level'], string> = {
  info: 'var(--ink-subtle)',
  warn: 'var(--gold-bright)',
  error: 'var(--blood-bright)',
};

const levelLabels: Record<LogEntry['level'], string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

export function DebugLog() {
  const [, setTick] = useState(0);
  const [visible, setVisible] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const refresh = useCallback(() => setLogs([...getLogs()]), []);

  useEffect(() => {
    const handler = () => { refresh(); };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, [refresh]);

  // Refresh trigger
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [visible]);

  // Update logs when tick changes
  useEffect(() => {
    if (visible) setLogs([...getLogs()]);
  }, []);

  // Also update on tick
  useTickEffect(visible, () => { setLogs([...getLogs()]); });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible(!visible)}
        title="调试日志"
        style={{
          position: 'fixed',
          bottom: 12,
          left: 12,
          zIndex: 601,
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(196,168,85,0.25)',
          borderRadius: 4,
          background: 'rgba(13,10,7,0.85)',
          color: 'var(--ink-subtle)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; }}
      >
        DBG
      </button>

      {/* Log panel */}
      {visible && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 990,
            height: 280,
            background: 'rgba(13,10,7,0.96)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(196,168,85,0.2)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Title bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              borderBottom: '1px solid rgba(196,168,85,0.12)',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--gold)',
                letterSpacing: 2,
              }}
            >
              DEBUG LOG ({logs.length})
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => {
                  const globalLogs = (window as unknown as Record<string, unknown>).__debugLogs as LogEntry[] | undefined;
                  if (globalLogs) globalLogs.length = 0;
                  setLogs([]);
                }}
                style={{
                  padding: '2px 10px',
                  border: '1px solid var(--brass)',
                  borderRadius: 3,
                  background: 'transparent',
                  color: 'var(--ink-subtle)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                CLEAR
              </button>
              <button
                onClick={() => setVisible(false)}
                style={{
                  padding: '2px 10px',
                  border: '1px solid var(--brass)',
                  borderRadius: 3,
                  background: 'transparent',
                  color: 'var(--ink-subtle)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                HIDE
              </button>
            </div>
          </div>

          {/* Log entries */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '4px 0',
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--ink-faded) transparent',
            }}
          >
            {logs.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  textAlign: 'center',
                  color: 'var(--ink-subtle)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                }}
              >
                暂无日志
              </div>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '2px 16px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    lineHeight: '20px',
                  }}
                >
                  <span style={{ color: 'var(--ink-faded)', flexShrink: 0 }}>
                    {entry.time}
                  </span>
                  <span style={{ color: levelColors[entry.level], flexShrink: 0, width: 42 }}>
                    {levelLabels[entry.level]}
                  </span>
                  <span style={{ color: 'var(--text-light)', wordBreak: 'break-all' }}>
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

function useTickEffect(visible: boolean, fn: () => void) {
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(fn, 1000);
    return () => clearInterval(id);
  }, [visible, fn]);
}
