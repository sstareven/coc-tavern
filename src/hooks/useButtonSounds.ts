import { useEffect } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { sfxClick, sfxClickPrimary, sfxClickSoft, setSfxVolume } from '../audio/sfx';

const PLAYERS: Record<string, () => void> = {
  click: sfxClick,
  primary: sfxClickPrimary,
  soft: sfxClickSoft,
};

/**
 * 全局按钮音效 + 音效主音量同步。
 * 用一个 pointerdown 委托监听器，给所有 <button> / [role="button"] / [data-sfx]
 * 在按下时播放柔和木质点击音，按 soundEnabled 门控。零侵入——不改任何按钮的 onClick/动效。
 * 分类：默认 'click'；元素上标 data-sfx="primary"|"soft" 切换；data-sfx="none" 或 data-no-sfx 静音。
 * 用 pointerdown（捕获阶段）：按下即响，贴合「按压」反馈，且属用户手势可解锁 AudioContext。
 * 另把设置中的 sfxVolume(0-100) 同步到音效主增益，供「音效音量」滑块实时调节所有合成音。
 */
export function useButtonSounds(): void {
  const sfxVolume = useSettingsStore((s) => s.sfxVolume);
  useEffect(() => {
    setSfxVolume(sfxVolume / 100);
  }, [sfxVolume]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // 仅主键/触摸主点
      const start = e.target as Element | null;
      const el = start?.closest?.('button, [role="button"], [data-sfx]') as HTMLElement | null;
      if (!el) return;
      if (el.hasAttribute('data-no-sfx') || el.closest('[data-no-sfx]')) return;
      if ((el as HTMLButtonElement).disabled) return;
      if (!useSettingsStore.getState().soundEnabled) return;
      const variant = el.getAttribute('data-sfx') || 'click';
      const play = PLAYERS[variant]; // data-sfx="none" 等未知值 → 静音
      if (!play) return;
      try { play(); } catch { /* audio 不可用，静默 */ }
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);
}
