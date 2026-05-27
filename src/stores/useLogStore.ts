import { create } from 'zustand';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogCategory = 'api' | 'preset' | 'worldbook' | 'regex' | 'variable' | 'system' | 'general';

export interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
}

let logId = 0;

interface LogStore {
  logs: LogEntry[];
  visible: boolean;
  filter: { level: LogLevel | 'all'; category: LogCategory | 'all'; search: string };
  push: (level: LogLevel, message: string, category?: LogCategory) => void;
  clear: () => void;
  toggle: () => void;
  setVisible: (v: boolean) => void;
  setFilter: (f: Partial<LogStore['filter']>) => void;
}

export const useLogStore = create<LogStore>((set) => ({
  logs: [],
  visible: false,
  filter: { level: 'all', category: 'all', search: '' },

  push: (level, message, category = 'general') => {
    const entry: LogEntry = {
      id: ++logId,
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      level,
      category,
      message,
    };
    set((s) => {
      const logs = [...s.logs, entry];
      if (logs.length > 500) logs.splice(0, logs.length - 500);
      return { logs };
    });
  },

  clear: () => set({ logs: [] }),

  toggle: () => set((s) => ({ visible: !s.visible })),

  setVisible: (v) => set({ visible: v }),

  setFilter: (f) => set((s) => ({ filter: { ...s.filter, ...f } })),
}));

/** Convenience — push log from anywhere without importing store */
export function pushLog(level: LogLevel, message: string, category?: LogCategory) {
  useLogStore.getState().push(level, message, category);
}
