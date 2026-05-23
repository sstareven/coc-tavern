# 深渊档案馆 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete "Abyssal Archive" COC TRPG frontend — a React 18 + TypeScript SPA implementing the design spec at `docs/superpowers/specs/2026-05-24-coc-tavern-design.md`.

**Architecture:** Single-page React app with Zustand state management, Dexie.js IndexedDB persistence, Framer Motion animations, and Web Audio API sound synthesis. Follows the SillyTavern lorebook/preset/chat architecture wrapped in a storybook-centered Cthulhu dark occult UI.

**Tech Stack:** React 18, TypeScript, Zustand, Dexie.js, Framer Motion, Vite, CSS Modules with design tokens.

---

## Phase 1: Project Scaffold

### Task 1: Initialize Vite + React + TypeScript project

**Files:**
- Create: `E:/Games/COC/package.json`
- Create: `E:/Games/COC/tsconfig.json`
- Create: `E:/Games/COC/vite.config.ts`
- Create: `E:/Games/COC/index.html`

- [ ] **Step 1: Scaffold with Vite**

Run: `cd E:/Games/COC && npm create vite@latest . -- --template react-ts`

- [ ] **Step 2: Install core dependencies**

```bash
npm install zustand dexie framer-motion
npm install -D @types/node
```

- [ ] **Step 3: Verify dev server starts**

Run: `npm run dev`
Expected: Vite dev server on localhost:5173

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite + React + TypeScript project"
```

---

### Task 2: Create design tokens and global styles

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write design tokens**

Create `src/styles/tokens.css`:

```css
:root {
  --parchment: #f4e4c1;
  --parchment-deep: #e8d5a3;
  --parchment-dark: #d4c4a0;
  --leather: #2a1f14;
  --abyss: #1a1410;
  --void: #0d0a07;
  --gold: #c4a855;
  --gold-bright: #e8c865;
  --brass: #3d2b13;
  --ink: #2a1f14;
  --ink-faded: #6b5a3a;
  --ink-subtle: #8b7858;
  --blood: #8b3a3a;
  --blood-bright: #cc3333;
  --success: #3a6b5a;
  --success-bright: #5aab7a;
  --text-light: #d4c4a0;
  --shadow-deep: rgba(0,0,0,0.6);
  --font-display: 'Georgia', 'Noto Serif SC', serif;
  --font-body: 'Crimson Text', 'Noto Serif SC', serif;
  --font-ui: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  --transition-smooth: 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
```

- [ ] **Step 2: Write global styles**

Create `src/styles/global.css`:

```css
@import './tokens.css';
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; background: var(--void); font-family: var(--font-ui); color: var(--text-light); user-select: none; -webkit-font-smoothing: antialiased; }
```

- [ ] **Step 3: Import global styles in main**

Modify `src/main.tsx` — add `import './styles/global.css';` at top.

- [ ] **Step 4: Commit**

```bash
git add src/styles/ src/main.tsx && git commit -m "feat: add design tokens and global styles"
```

---

### Task 3: Type definitions and data models

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Write all core types**

Create `src/types/index.ts`:

```ts
// ===== COC 7th Character =====
export type COC7Characteristic = 'STR' | 'CON' | 'POW' | 'DEX' | 'APP' | 'SIZ' | 'INT' | 'EDU';
export interface CharacterSheet {
  characteristics: Record<COC7Characteristic, number>;
  halfFifth: Record<COC7Characteristic, { half: number; fifth: number }>;
  secondary: { hp: { current: number; max: number }; san: { current: number; max: number }; mp: { current: number; max: number }; luck: number; mov: number; db: string; build: number; };
  skills: Record<string, { base: number; current: number }>;
  identity: { name: string; occupation: string; age: number; gender: string; birthplace: string; residence: string; id: string; };
}

// ===== Storybook Pages =====
export interface BookPage {
  leftHeader: string;
  leftContent: string;
  leftPage: string;
  rightHeader: string;
  rightContent: string;
  rightChoices: ChoiceItem[];
}
export interface ChoiceItem { num: string; text: string; action: string; }

// ===== Dice =====
export type DiceResultType = 'crit-success' | 'extreme-success' | 'hard-success' | 'success' | 'failure' | 'crit-failure';
export type DiceMode = 'check' | 'opposed' | 'free';
export interface DiceRecord { skill: string; roll: string; target: string; type: DiceResultType; time: number; }

// ===== Lorebooks =====
export interface LoreEntry { name: string; keys: string; content: string; logic: 'AND' | 'OR' | 'NOT'; priority: number; }
export interface LoreBook { name: string; entries: Record<string, LoreEntry>; }

// ===== Presets =====
export interface ChatPreset { id: string; name: string; temperature: number; topP: number; topK: number; maxTokens: number; repetitionPenalty: number; systemPrompt: string; userPrefix: string; assistantPrefix: string; }

// ===== Chat Sessions =====
export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; timestamp: number; }
export interface ChatSession { id: string; name: string; messages: ChatMessage[]; presetId: string | null; lorebookIds: string[]; createdAt: number; updatedAt: number; }

// ===== Extensions =====
export interface Extension { id: string; name: string; version: string; author: string; description: string; enabled: boolean; entryPoint: string; }

// ===== Tooltip Keywords =====
export type KeywordDB = Record<string, string>;
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/types/ && git commit -m "feat: define core TypeScript types and data models"
```

---

## Phase 2: State Management (Zustand Stores)

### Task 4: Book/Page store

**Files:**
- Create: `src/stores/useBookStore.ts`

- [ ] **Step 1: Write the store**

Create `src/stores/useBookStore.ts`:

```ts
import { create } from 'zustand';
import type { BookPage } from '../types';

const defaultPages: BookPage[] = [
  {
    leftHeader: '第三章', leftContent: '你推开沉重的橡木门...', leftPage: '— 3 —',
    rightHeader: '调查', rightContent: '角落里，一个上了锁的铁柜引起了你的注意...',
    rightChoices: [
      { num: 'I', text: '调查铁柜', action: '调查铁柜' },
      { num: 'II', text: '检查手稿', action: '检查桌上的手稿' },
      { num: 'III', text: '观察符号', action: '仔细观察墙上的符号' },
      { num: 'IV', text: '离开房间', action: '离开这个房间' },
    ],
  },
  // ... additional pages as defined in prototype
];

interface BookStore {
  pages: BookPage[];
  pageIndex: number;
  isFlipping: boolean;
  setPages: (pages: BookPage[]) => void;
  nextPage: () => void;
  prevPage: () => void;
  setFlipping: (v: boolean) => void;
  updateLeftPage: (index: number, header: string, content: string) => void;
}

export const useBookStore = create<BookStore>((set, get) => ({
  pages: defaultPages,
  pageIndex: 0,
  isFlipping: false,
  setPages: (pages) => set({ pages, pageIndex: 0 }),
  nextPage: () => {
    const { pageIndex, pages } = get();
    if (pageIndex < pages.length - 1) set({ pageIndex: pageIndex + 1 });
  },
  prevPage: () => {
    const { pageIndex } = get();
    if (pageIndex > 0) set({ pageIndex: pageIndex - 1 });
  },
  setFlipping: (v) => set({ isFlipping: v }),
  updateLeftPage: (index, header, content) => set((s) => {
    const pages = [...s.pages];
    pages[index] = { ...pages[index], leftHeader: header, leftContent: content };
    return { pages };
  }),
}));
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/stores/useBookStore.ts && git commit -m "feat: add book/page Zustand store with flip logic"
```

---

### Task 5: Dice store

**Files:**
- Create: `src/stores/useDiceStore.ts`

- [ ] **Step 1: Write the store**

Create `src/stores/useDiceStore.ts`:

```ts
import { create } from 'zustand';
import type { DiceRecord, DiceResultType, DiceMode } from '../types';

interface DiceStore {
  isOpen: boolean;
  mode: DiceMode;
  target: number;
  bonusDice: number;
  sanCheck: boolean;
  tens: number; ones: number; bonusTens: number;
  oppTens: number; oppOnes: number;
  resultType: DiceResultType | null;
  history: DiceRecord[];
  open: () => void;
  close: () => void;
  setMode: (m: DiceMode) => void;
  setTarget: (t: number) => void;
  toggleBonus: () => void;
  togglePenalty: () => void;
  toggleSan: () => void;
  roll: () => void;
  addRecord: (r: DiceRecord) => void;
}

function randD10() { return Math.floor(Math.random() * 10); }
function d100(t: number, o: number) { return (t === 0 && o === 0) ? 100 : t * 10 + o; }

function determineResult(roll: number, target: number, sanCheck: boolean): DiceResultType {
  const fifth = Math.floor(target / 5), half = Math.floor(target / 2);
  if (roll === 100) return 'crit-failure';
  if (sanCheck && roll >= 96) return 'crit-failure';
  if (roll === 1) return 'crit-success';
  if (roll <= fifth) return 'extreme-success';
  if (roll <= half) return 'hard-success';
  if (roll <= target) return 'success';
  if (!sanCheck && target < 50 && roll >= 96) return 'crit-failure';
  return 'failure';
}

export const useDiceStore = create<DiceStore>((set, get) => ({
  isOpen: false, mode: 'check', target: 65, bonusDice: 0, sanCheck: false,
  tens: 0, ones: 0, bonusTens: 0, oppTens: 0, oppOnes: 0, resultType: null,
  history: [],
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setMode: (m) => set({ mode: m }),
  setTarget: (t) => set({ target: t }),
  toggleBonus: () => set((s) => ({ bonusDice: s.bonusDice > 0 ? 0 : 1 })),
  togglePenalty: () => set((s) => ({ bonusDice: s.bonusDice < 0 ? 0 : -1 })),
  toggleSan: () => set((s) => ({ sanCheck: !s.sanCheck })),
  roll: () => {
    const s = get();
    let t = randD10(), o = randD10(), bt = 0;
    if (s.bonusDice !== 0) bt = randD10();
    let finalTens = t;
    if (s.bonusDice > 0) finalTens = Math.min(t, bt);
    else if (s.bonusDice < 0) finalTens = Math.max(t, bt);
    const roll = d100(finalTens, o);
    const resultType = determineResult(roll, s.target, s.sanCheck);
    set({ tens: t, ones: o, bonusTens: bt, resultType, oppTens: s.mode === 'opposed' ? randD10() : 0, oppOnes: s.mode === 'opposed' ? randD10() : 0 });
    get().addRecord({ skill: '检定', roll: String(roll).padStart(2, '0'), target: String(s.target), type: resultType, time: Date.now() });
  },
  addRecord: (r) => set((s) => ({ history: [r, ...s.history].slice(0, 20) })),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/useDiceStore.ts && git commit -m "feat: add dice Zustand store with CoC 7th logic"
```

---

### Task 6: Character sheet, lorebook, settings, and chat stores

**Files:**
- Create: `src/stores/useCharSheetStore.ts`
- Create: `src/stores/useLorebookStore.ts`
- Create: `src/stores/useSettingsStore.ts`
- Create: `src/stores/useChatStore.ts`

- [ ] **Step 1: Write character sheet store**

Create `src/stores/useCharSheetStore.ts`:

```ts
import { create } from 'zustand';
import type { CharacterSheet } from '../types';

const defaultSheet: CharacterSheet = {
  characteristics: { STR: 70, CON: 50, POW: 80, DEX: 65, APP: 45, SIZ: 55, INT: 75, EDU: 70 },
  halfFifth: { STR: { half: 35, fifth: 14 }, CON: { half: 25, fifth: 10 }, POW: { half: 40, fifth: 16 }, DEX: { half: 32, fifth: 13 }, APP: { half: 22, fifth: 9 }, SIZ: { half: 27, fifth: 11 }, INT: { half: 37, fifth: 15 }, EDU: { half: 35, fifth: 14 } },
  secondary: { hp: { current: 10, max: 10 }, san: { current: 72, max: 80 }, mp: { current: 16, max: 16 }, luck: 55, mov: 8, db: '+1D4', build: 1 },
  skills: { '图书馆使用': { base: 20, current: 60 }, '驾驶': { base: 20, current: 50 }, '心理学': { base: 10, current: 70 } },
  identity: { name: '霍华德·菲利普斯', occupation: '私家侦探', age: 34, gender: '男', birthplace: '马萨诸塞州', residence: '阿卡姆', id: 'INV-1925-042' },
};

interface CharSheetStore {
  sheet: CharacterSheet;
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

export const useCharSheetStore = create<CharSheetStore>((set) => ({
  sheet: defaultSheet,
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
}));
```

- [ ] **Step 2: Write lorebook store**

Create `src/stores/useLorebookStore.ts`:

```ts
import { create } from 'zustand';
import type { LoreBook } from '../types';

const defaultBooks: Record<string, LoreBook> = {
  arkham: {
    name: '阿卡姆设定集',
    entries: {
      e1: { name: '阿卡姆简介', keys: '阿卡姆, 城镇', content: '...', logic: 'AND', priority: 10 },
      e2: { name: '密斯卡塔尼克大学', keys: '密斯卡塔尼克, 大学', content: '...', logic: 'AND', priority: 20 },
    },
  },
};

interface LorebookStore {
  books: Record<string, LoreBook>;
  activeBook: string | null;
  setActiveBook: (id: string | null) => void;
  updateEntry: (bookId: string, entryId: string, entry: LoreBook['entries'][string]) => void;
  deleteEntry: (bookId: string, entryId: string) => void;
  addEntry: (bookId: string) => void;
}

let entryCounter = 10;
export const useLorebookStore = create<LorebookStore>((set) => ({
  books: defaultBooks,
  activeBook: null,
  setActiveBook: (id) => set({ activeBook: id }),
  updateEntry: (bookId, entryId, entry) => set((s) => {
    const books = { ...s.books };
    books[bookId] = { ...books[bookId], entries: { ...books[bookId].entries, [entryId]: entry } };
    return { books };
  }),
  deleteEntry: (bookId, entryId) => set((s) => {
    const books = { ...s.books };
    const entries = { ...books[bookId].entries };
    delete entries[entryId];
    books[bookId] = { ...books[bookId], entries };
    return { books };
  }),
  addEntry: (bookId) => set((s) => {
    const id = 'e' + (++entryCounter);
    const books = { ...s.books };
    books[bookId] = { ...books[bookId], entries: { ...books[bookId].entries, [id]: { name: '新条目', keys: '', content: '', logic: 'AND', priority: 10 } } };
    return { books };
  }),
}));
```

- [ ] **Step 3: Write settings store**

Create `src/stores/useSettingsStore.ts`:

```ts
import { create } from 'zustand';

interface SettingsStore {
  soundEnabled: boolean;
  tooltipDelay: number;
  musicVolume: number;
  apiBaseUrl: string;
  apiModel: string;
  toggleSound: () => void;
  setTooltipDelay: (d: number) => void;
  setMusicVolume: (v: number) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  soundEnabled: true, tooltipDelay: 600, musicVolume: 40,
  apiBaseUrl: 'https://api.deepseek.com', apiModel: 'deepseek-v4-pro',
  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
  setTooltipDelay: (d) => set({ tooltipDelay: d }),
  setMusicVolume: (v) => set({ musicVolume: v }),
}));
```

- [ ] **Step 4: Write chat store**

Create `src/stores/useChatStore.ts`:

```ts
import { create } from 'zustand';
import type { ChatSession } from '../types';

interface ChatStore {
  sessions: ChatSession[];
  activeId: string | null;
  createSession: (name: string) => string;
  deleteSession: (id: string) => void;
  setActive: (id: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  sessions: [],
  activeId: null,
  createSession: (name) => {
    const id = crypto.randomUUID();
    set((s) => ({ sessions: [...s.sessions, { id, name, messages: [], presetId: null, lorebookIds: [], createdAt: Date.now(), updatedAt: Date.now() }], activeId: id }));
    return id;
  },
  deleteSession: (id) => set((s) => ({ sessions: s.sessions.filter((c) => c.id !== id), activeId: s.activeId === id ? null : s.activeId })),
  setActive: (id) => set({ activeId: id }),
}));
```

- [ ] **Step 5: Commit**

```bash
git add src/stores/ && git commit -m "feat: add charsheet, lorebook, settings, and chat Zustand stores"
```

---

## Phase 3: Audio & Effects

### Task 7: Web Audio sound effects module

**Files:**
- Create: `src/audio/sfx.ts`
- Create: `src/hooks/useAudio.ts`

- [ ] **Step 1: Write the sfx module**

Create `src/audio/sfx.ts`:

```ts
let ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function sfxPageFlip() {
  const c = getCtx(); const now = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / d.length) * Math.PI) * 0.5;
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.setValueAtTime(0.18, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1200, now); f.frequency.exponentialRampToValueAtTime(600, now + 0.35); f.Q.value = 1.2;
  src.connect(f); f.connect(g); g.connect(c.destination); src.start(now); src.stop(now + 0.6);
}

export function sfxSuccess() {
  const c = getCtx();
  [523.25, 659.25].forEach((freq, i) => {
    const t = c.currentTime + 0.2 + i * 0.12;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.4);
  });
}

export function sfxFailure() {
  const c = getCtx(); const now = c.currentTime;
  const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(200, now); o.frequency.exponentialRampToValueAtTime(120, now + 0.7);
  const g = c.createGain(); g.gain.setValueAtTime(0.18, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + 0.9);
}

export function sfxCritSuccess() {
  const c = getCtx(); const now = c.currentTime;
  [180, 270].forEach((f, i) => {
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 2, now + 0.8);
    const g = c.createGain(); g.gain.setValueAtTime(i === 0 ? 0.2 : 0.14, now); g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + 1.2);
  });
}

export function sfxCritFailure() {
  const c = getCtx(); const now = c.currentTime;
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(50, now); o.frequency.linearRampToValueAtTime(30, now + 1.5);
  const g = c.createGain(); g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; f.Q.value = 1;
  o.connect(f); f.connect(g); g.connect(c.destination); o.start(now); o.stop(now + 2.8);
}
```

- [ ] **Step 2: Write the useAudio hook**

Create `src/hooks/useAudio.ts`:

```ts
import { useSettingsStore } from '../stores/useSettingsStore';
import { sfxPageFlip, sfxSuccess, sfxFailure, sfxCritSuccess, sfxCritFailure } from '../audio/sfx';

export function useAudio() {
  const enabled = useSettingsStore((s) => s.soundEnabled);
  return {
    playFlip: () => { if (enabled) sfxPageFlip(); },
    playSuccess: () => { if (enabled) sfxSuccess(); },
    playFailure: () => { if (enabled) sfxFailure(); },
    playCritSuccess: () => { if (enabled) sfxCritSuccess(); },
    playCritFailure: () => { if (enabled) sfxCritFailure(); },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/audio/ src/hooks/useAudio.ts && git commit -m "feat: add Web Audio sound effects module"
```

---

## Phase 4: Core Layout Components

### Task 8: App shell, Landing, TopBar, InputBar

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/Landing/LandingScreen.tsx`
- Create: `src/components/Landing/ChangelogModal.tsx`
- Create: `src/components/Layout/TopBar.tsx`
- Create: `src/components/Layout/InputBar.tsx`

- [ ] **Step 1: Write App.tsx with routing state**

```tsx
// src/App.tsx
import { useState } from 'react';
import { LandingScreen } from './components/Landing/LandingScreen';
import { ChangelogModal } from './components/Landing/ChangelogModal';
import { TopBar } from './components/Layout/TopBar';
import { InputBar } from './components/Layout/InputBar';
import { Storybook } from './components/Book/Storybook';

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'game'>('landing');
  return (
    <>
      {screen === 'landing' ? (
        <LandingScreen onStart={() => setScreen('game')} />
      ) : (
        <div className="app">
          <TopBar />
          <main className="main-area">
            <Storybook />
          </main>
          <InputBar />
        </div>
      )}
      <ChangelogModal />
    </>
  );
}
```

- [ ] **Step 2-4: Write Landing, TopBar, InputBar components** (inline code omitted for brevity — each follows prototype HTML structure converted to JSX)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/ && git commit -m "feat: add app shell, landing, topbar, inputbar"
```

---

### Task 9: Storybook with PageFlip animation

**Files:**
- Create: `src/components/Book/Storybook.tsx`
- Create: `src/components/Book/LeftPage.tsx`
- Create: `src/components/Book/RightPage.tsx`
- Create: `src/components/Book/PageFlip.tsx`
- Create: `src/components/Book/PageNav.tsx`
- Create: `src/hooks/usePageFlip.ts`

- [ ] **Step 1: Write usePageFlip hook**

Create `src/hooks/usePageFlip.ts`:

```ts
import { useBookStore } from '../stores/useBookStore';
import { useAudio } from './useAudio';

export function usePageFlip() {
  const { pageIndex, isFlipping, nextPage, prevPage, setFlipping } = useBookStore();
  const audio = useAudio();

  const flipForward = () => {
    if (isFlipping || pageIndex >= useBookStore.getState().pages.length - 1) return;
    setFlipping(true); audio.playFlip();
    setTimeout(() => { nextPage(); setFlipping(false); }, 1200);
  };

  const flipBackward = () => {
    if (isFlipping || pageIndex <= 0) return;
    setFlipping(true); audio.playFlip();
    setTimeout(() => { prevPage(); setFlipping(false); }, 1200);
  };

  return { flipForward, flipBackward, isFlipping, pageIndex };
}
```

- [ ] **Step 2: Write Storybook component**

Create `src/components/Book/Storybook.tsx` using Framer Motion for page flip animation. LeftPage reads from `useBookStore`, RightPage renders choices and handles the flip. Structure follows prototype HTML.

- [ ] **Step 3: Write PageNav, LeftPage, RightPage, PageFlip** as focused sub-components

- [ ] **Step 4: Commit**

```bash
git add src/components/Book/ src/hooks/usePageFlip.ts && git commit -m "feat: add storybook with page flip animation"
```

---

## Phase 5: Panels & Overlays

### Task 10: Dice panel with CoC 7th mechanics

**Files:**
- Create: `src/components/Dice/DicePanel.tsx`
- Create: `src/components/Dice/DiceDie.tsx`
- Create: `src/components/Dice/DiceResult.tsx`
- Create: `src/hooks/useDiceRoll.ts`

Write DicePanel with mode selector, target input, bonus/penalty/SAN toggles, two d10 dice, roll button, result display — all driven by `useDiceStore`. DiceDie renders a single d10 face with number display.

### Task 11: Dice history table

**Files:**
- Create: `src/components/Dice/DiceHistory.tsx`

Renders `useDiceStore.history` as a centered table with sticky header, color-coded rows by result type.

### Task 12: Character sheet panel

**Files:**
- Create: `src/components/CharSheet/CharSheetPanel.tsx`
- Create: `src/components/CharSheet/CharGrid.tsx`
- Create: `src/components/CharSheet/SecStats.tsx`
- Create: `src/components/CharSheet/SkillsTable.tsx`
- Create: `src/components/CharSheet/InvestigatorCard.tsx`
- Create: `src/components/CharSheet/TooltipSystem.tsx`
- Create: `src/hooks/useTooltip.ts`

Slide-out left panel with COC 7th character grid, secondary stats 3x2 grid, collapsible skills table, investigator ID card with portrait. TooltipSystem renders progress ring + nested keyword tooltips.

### Task 13: Settings, worldbook, preset, chat panels

**Files:**
- Create: `src/components/Panels/SettingsPanel.tsx`
- Create: `src/components/Panels/WorldbookPanel.tsx`
- Create: `src/components/Panels/LorebookEditor.tsx`
- Create: `src/components/Panels/PresetPanel.tsx`
- Create: `src/components/Panels/PresetEditor.tsx`
- Create: `src/components/Panels/ChatlistPanel.tsx`
- Create: `src/components/Panels/ExtManager.tsx`

Each panel is a centered modal overlay driven by its respective Zustand store. LorebookEditor has left entry list + right entry form. PresetEditor has three tabs (Sampling/Prompts/Order). ExtManager has expandable detail sections with enable toggles.

---

## Phase 6: Shared & Utility Components

### Task 14: Music player, debug log, page editor

**Files:**
- Create: `src/components/Shared/MusicPlayer.tsx`
- Create: `src/components/Shared/DebugLog.tsx`
- Create: `src/components/Shared/PageEditor.tsx`
- Create: `src/components/Shared/KeywordTooltip.tsx`
- Create: `src/components/Book/BookUtils.tsx`
- Create: `src/components/Book/TokenDisplay.tsx`

MusicPlayer: draggable MP3 player with file import. DebugLog: top panel toggle. PageEditor: modal for editing left page content. BookUtils: three small icon buttons outside book top-right. TokenDisplay: bottom-right token count text.

---

## Phase 7: SillyTavern Integration

### Task 15: Dexie database layer

**Files:**
- Create: `src/db/database.ts`

Set up Dexie with tables for lorebooks, presets, chat sessions, settings, and extensions. Add migration hooks.

### Task 16: Lorebook engine + prompt assembler

**Files:**
- Create: `src/sillytavern/types.ts`
- Create: `src/sillytavern/lorebook-engine.ts`
- Create: `src/sillytavern/prompt-assembler.ts`
- Create: `src/sillytavern/variables.ts`

Port the SillyTavern skill templates: keyword matching engine, prompt context injection, MVU variable extraction/merging.

### Task 17: API router + stream parser

**Files:**
- Create: `src/sillytavern/stream-parser.ts`
- Create: `src/sillytavern/api-router.ts`

OpenAI-compatible chat completions API router with streaming support. Stream parser for token-by-token output.

---

## Phase 8: Polish

### Task 18: Framer Motion animations, responsive scaling, final QA

Apply Framer Motion `AnimatePresence` to modal enter/exit, `motion.div` for page flip curl, spring animations for dice pop-in. Responsive scaling via CSS `clamp()` for book dimensions. Cross-browser smoke test.

---

## Verification

After all phases:
- [ ] `npm run dev` starts without errors
- [ ] All 7 overlays open/close (Esc support)
- [ ] Storybook flips 4 layers forward and backward
- [ ] Dice rolls produce all 6 result types
- [ ] Character sheet tooltips show with progress ring
- [ ] World book entries save/delete/create
- [ ] Preset sliders update live values
- [ ] Music player imports MP3 and plays
- [ ] Settings persist via Zustand + localStorage
- [ ] `npx tsc --noEmit` passes with zero errors
