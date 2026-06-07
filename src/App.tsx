import { useState, useEffect, useCallback } from 'react';
import { ErrorBoundary } from './components/Shared/ErrorBoundary';
import { LandingScreen } from './components/Landing/LandingScreen';
import { ChangelogModal } from './components/Landing/ChangelogModal';
import { CharacterCreator } from './components/CharSheet/CharacterCreator';
import { GameView } from './components/Layout/GameView';
import { DicePanel } from './components/Dice/DicePanel';
import { DiceHistory } from './components/Dice/DiceHistory';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { WorldbookPanel } from './components/Settings/WorldbookPanel';
import { LorebookEditor } from './components/Settings/LorebookEditor';
import { PresetPanel } from './components/Settings/PresetPanel';
import { PresetSwitchOverlay } from './components/Settings/PresetSwitchOverlay';
import { PresetEditor } from './components/Settings/PresetEditor';
import { ChatlistPanel } from './components/Settings/ChatlistPanel';
import { ExtManager } from './components/Settings/ExtManager';
import { RegexEditor } from './components/Settings/RegexEditor';
import { VariablePanel } from './components/Settings/VariablePanel';
import { CacheStatsPanel } from './components/Settings/CacheStatsPanel';
import { DebugLog } from './components/Shared/DebugLog';
import { DebugConsole } from './components/Shared/DebugConsole';
import { ErrorModal } from './components/Shared/ErrorModal';
import { StatusToast } from './components/Shared/StatusToast';
import { ScenarioScreen } from './components/Scenario/ScenarioScreen';
import { ScenarioEditor } from './components/Scenario/ScenarioEditor';
import { RosterPicker } from './components/Landing/RosterPicker';
import { RosterPreview } from './components/Landing/RosterPreview';
import { activateScenario } from './scenario/scenario-engine';
import { useScenarioStore } from './stores/useScenarioStore';
import { startNewConversation } from './stores/sessionLifecycle';
import { usePanelStore } from './stores/usePanelStore';
import { initBuiltinCommands } from './sillytavern/slash-commands';
import { initKvCache } from './db/kv';
import { seedFusionPreset } from './db/seed-fusion-preset';
import { migrateFromLocalStorage } from './db/migrations';
import { db, V2_UPGRADE_FAILED } from './db/database';
import { loadConversation, persistActiveGameState } from './stores/sessionLifecycle';
import { useChatStore } from './stores/useChatStore';
import { useBookStore } from './stores/useBookStore';
import { useTextRatios } from './hooks/useTextRatios';
import { useResponsiveZoom } from './hooks/useResponsiveZoom';
import { useButtonSounds } from './hooks/useButtonSounds';
import { useKonamiCode } from './hooks/useKonamiCode';
import { useSettingsStore } from './stores/useSettingsStore';

export function App() {
  useResponsiveZoom(); // 整页自动 zoom：根据浏览器窗口宽度自动缩放(1280px 基准, 0.75~1.5)
  useTextRatios(); // 文字倍率：把 textRatio/systemRatio 挂到 :root CSS 变量供 calc(... * var(...)) 使用
  useButtonSounds(); // 全局按钮音效（柔和木质点击，按 soundEnabled 门控）
  // Konami 序列（↑↑↓↓←→←→BA）解锁「领受赐福」作弊 tab —— 持久化到 useSettingsStore，
  // 后续会话从 store 读 cheatingUnlocked 直接显示 tab，无需再输。
  const cheatingUnlocked = useSettingsStore((s) => s.cheatingUnlocked);
  useKonamiCode(() => {
    const { cheatingUnlocked, unlockCheating } = useSettingsStore.getState();
    if (cheatingUnlocked) return;
    unlockCheating();
    try {
      window.dispatchEvent(new CustomEvent('coc:toast', {
        detail: { type: 'success', message: '✦ 深渊的祝福已显现于设置中 ✦' },
      }));
    } catch { /* SSR/非浏览器忽略 */ }
  }, { enabled: !cheatingUnlocked });
  const [screen, setScreen] = useState<'landing' | 'scenarioPick' | 'rosterPick' | 'rosterPreview' | 'creator' | 'game'>('landing');
  const [editorScenarioId, setEditorScenarioId] = useState<string | null>(null);
  const [activating, setActivating] = useState(false); // 剧本激活中(扩首页 LLM 调用)的 loading 覆盖层
  // 预览阶段记选了哪个角色 + mode；onConfirm 时把这两个透传给 activateScenario。
  // newChar 模式不走预览（CharacterCreator 7 步已经预览过），preset 才进 rosterPreview。
  const [previewPick, setPreviewPick] = useState<{ charIdx: number; mode: 'preset' | 'newChar' } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initBuiltinCommands();
    (async () => {
      await initKvCache();
      // 幂等种入「双人成行融合预设」并设为默认（只写预设存储，不碰会话/存档表）。
      await seedFusionPreset();
      // 一次性 localStorage → Dexie 迁移（幂等）。Dexie v2 .upgrade() 在 db 打开时自动运行。
      await migrateFromLocalStorage();
      // 触碰 db 确保 v2 升级已执行；若升级失败标志已写入则告警（降级路径尽力而为）。
      try {
        await db.open();
        const failed = await db.kvStore.get(V2_UPGRADE_FAILED);
        if (failed?.value === 'true') {
          console.warn('[DB] v2 迁移曾失败，部分历史存档可能未完全迁移到关系表。');
        }
      } catch (err) {
        console.error('[DB] 打开数据库失败：', err);
      }
      // 启动恢复活跃会话的完整状态（pages + gameState 各域）自关系表。
      const activeId = useChatStore.getState().activeId;
      if (activeId) {
        try {
          await loadConversation(activeId);
        } catch (err) {
          console.error('[DB] 启动恢复会话失败：', err);
        }
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const toGame = () => setScreen('game');
    const toMenu = () => setScreen('landing');
    document.addEventListener('debug-enter-game', toGame);
    document.addEventListener('debug-return-menu', toMenu);
    return () => { document.removeEventListener('debug-enter-game', toGame); document.removeEventListener('debug-return-menu', toMenu); };
  }, []);

  // 切回前台时补齐被后台 rAF 暂停而卡住的翻页：浏览器在后台标签页暂停 requestAnimationFrame，
  // 翻页动画无法走到完成帧，导致 pageIndex 不前进、画面停在上一页、isFlipping 卡死，须点击才恢复。
  // 监听 visibilitychange，在重新可见且仍处于翻页中时强制结算，立即提交到目标页。
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && useBookStore.getState().isFlipping) {
        useBookStore.getState().settleFlip();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const openPanel = usePanelStore((s) => s.openPanel);
  const closeAll = usePanelStore((s) => s.closeAll);
  const lorebookEditorBookId = usePanelStore((s) => s.lorebookEditorBookId);
  const presetEditorPreset = usePanelStore((s) => s.presetEditorPreset);
  const presetEditorOnSave = usePanelStore((s) => s.presetEditorOnSave);
  const openLorebookEditor = usePanelStore((s) => s.openLorebookEditor);
  const openPresetEditor = usePanelStore((s) => s.openPresetEditor);

  // 退出到主菜单前，先把活跃会话的最新内存态落库——否则玩家在 UI 里产生的、尚未触发每回合
  // auto-save 的改动会在随后「开新游戏」的 clearAllGameState 中丢失（saveConversation 经 enqueue
  // 串行化，会读取此刻的内存态；返回菜单到开新游戏间隔以秒计，远长于落库耗时，无竞态）。
  const returnToMenu = useCallback(() => { void persistActiveGameState(); setScreen('landing'); }, []);

  // Esc key to close all panels
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeAll]);

  if (!ready) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 40%, var(--abyss) 0%, var(--void) 100%)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '2px solid rgba(196,168,85,0.15)', borderTopColor: 'var(--gold)',
          animation: 'spin 0.9s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <>
      {screen === 'landing' && (
        <LandingScreen
          onStart={() => setScreen('scenarioPick')}
          onLoadGame={() => setScreen('game')}
        />
      )}
      {screen === 'scenarioPick' && (
        <ScenarioScreen
          onPick={(scenarioId) => {
            // 选完剧本统一跳 RosterPicker(不再区分 preset/newChar — 角色选择由 RosterPicker 决定)
            useScenarioStore.getState().setLastPicked(scenarioId);
            setScreen('rosterPick');
          }}
          onClose={() => setScreen('landing')}
          onOpenEditor={(id) => setEditorScenarioId(id)}
        />
      )}
      {screen === 'rosterPick' && (() => {
        const scnId = useScenarioStore.getState().lastPicked;
        if (!scnId) {
          setScreen('scenarioPick');
          return null;
        }
        return (
          <RosterPicker
            scenarioId={scnId}
            onBack={() => setScreen('scenarioPick')}
            onAddNewCharacter={() => setScreen('creator')}
            onPickChar={(charIdx, mode) => {
              // newChar 模式跳过预览 — CharacterCreator 7 步已让玩家审视过自己的卡
              if (mode === 'newChar') {
                void (async () => {
                  startNewConversation('新游戏');
                  setActivating(true);
                  try {
                    await activateScenario(scnId, mode, charIdx);
                  } catch (err) {
                    console.error('[App] 激活剧本失败:', err);
                  } finally {
                    setActivating(false);
                  }
                  setScreen('game');
                })();
              } else {
                // preset 模式先到预览页，玩家点「确认入局」才真正 startNewConversation
                setPreviewPick({ charIdx, mode });
                setScreen('rosterPreview');
              }
            }}
          />
        );
      })()}
      {screen === 'rosterPreview' && (() => {
        const scnId = useScenarioStore.getState().lastPicked;
        if (!scnId || !previewPick) {
          setScreen('rosterPick');
          return null;
        }
        return (
          <RosterPreview
            scenarioId={scnId}
            charIdx={previewPick.charIdx}
            onCancel={() => { setPreviewPick(null); setScreen('rosterPick'); }}
            onConfirm={() => {
              const { charIdx, mode } = previewPick;
              void (async () => {
                startNewConversation('新游戏');
                setActivating(true);
                try {
                  await activateScenario(scnId, mode, charIdx);
                  setPreviewPick(null);
                  setScreen('game');
                } catch (err) {
                  console.error('[App] 激活剧本失败:', err);
                  // 失败回退到预览页，玩家可重试或回到选角列表
                  setScreen('rosterPreview');
                } finally {
                  setActivating(false);
                }
              })();
            }}
          />
        );
      })()}
      {editorScenarioId && (
        <ScenarioEditor
          scenarioId={editorScenarioId}
          onClose={() => setEditorScenarioId(null)}
        />
      )}
      {screen === 'creator' && (
        <CharacterCreator
          onComplete={() => {
            // M4: CharCreator.handleConfirm 已把自创卡 applyPatch 写进剧本,这里只回 RosterPicker 让玩家选他进游戏
            setScreen('rosterPick');
          }}
          onClose={() => setScreen('rosterPick')}
        />
      )}
      {screen === 'game' && (
        <GameView onReturnToMenu={returnToMenu} />
      )}
      <ChangelogModal />

      {/* 剧本激活中的全屏 loading 覆盖层 — 创角完成 / preset 选角时 LLM 扩首页期间显示 */}
      {activating && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9995,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
          background: 'rgba(8,6,4,0.92)', backdropFilter: 'blur(6px)',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '2px solid rgba(196,168,85,0.15)', borderTopColor: 'var(--gold)',
            animation: 'spin 0.9s linear infinite',
          }} />
          <div style={{
            fontFamily: 'var(--font-display)', color: 'var(--gold)',
            fontSize: 'calc(14px * var(--system-ratio, 1))', letterSpacing: 3,
          }}>正在书写序章…</div>
          <div style={{
            fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)',
            fontSize: 'calc(11px * var(--system-ratio, 1))', letterSpacing: 1, maxWidth: 360, textAlign: 'center',
          }}>守秘人正在根据剧本背景为你扩写第一页，请稍候。</div>
        </div>
      )}

      {/* ── Global overlay panels — always mounted, self-managed via stores ── */}
      <DicePanel />
      <PresetSwitchOverlay />

      {openPanel === 'settings' && (
        <SettingsPanel visible={true} onClose={closeAll} onReturnToMenu={returnToMenu} />
      )}
      {openPanel === 'worldbook' && (
        <WorldbookPanel onClose={closeAll} onEditBook={(bookId: string) => openLorebookEditor(bookId)} />
      )}
      {openPanel === 'preset' && (
        <PresetPanel onClose={closeAll} onEditPreset={(preset, onSave) => openPresetEditor(preset, onSave)} />
      )}
      {openPanel === 'presetEditor' && presetEditorPreset && (
        <PresetEditor preset={presetEditorPreset} onClose={closeAll} onSave={presetEditorOnSave ?? (() => {})} />
      )}
      {openPanel === 'chatlist' && (
        <ChatlistPanel onClose={closeAll} />
      )}
      {openPanel === 'lorebookEditor' && lorebookEditorBookId && (
        <LorebookEditor bookId={lorebookEditorBookId} onClose={closeAll} />
      )}
      {openPanel === 'extManager' && (
        <ExtManager onClose={closeAll} />
      )}
      {openPanel === 'diceHistory' && (
        <DiceHistory onClose={closeAll} />
      )}
      {openPanel === 'variable' && (
        <VariablePanel visible={true} onClose={closeAll} />
      )}
      {openPanel === 'cacheStats' && (
        <CacheStatsPanel onClose={closeAll} />
      )}

      <RegexEditor />
      <DebugLog />
      <DebugConsole />
      <ErrorModal />
      <StatusToast />
    </>
    </ErrorBoundary>
  );
}
