// 文生图本页插画 banner(2026-06-08)。
// 桌面 LeftPage + 手机 MobileNoteView 共用。设计:
// - 834x227 自适应:width:100% + aspectRatio:'834/227' + objectFit:'cover',
//   父容器宽 437px → 浏览器自动算高 ≈ 119px;手机 360 宽 → ≈ 98px。
// - blob:// 模式异步从 db.pageImages 拉 Blob → createObjectURL,cleanup revokeObjectURL 防泄漏。
// - 远程 URL 直接当 src。
// - status='pending' 显示 IconImage 旋转骨架 + 子标签(订阅 useImageGenProgressStore)+ 底部 indeterminate 进度条。
// - status='failed' 显示 IconAlert + 右上角重生成按钮(IconRefresh)。
// - status='done'(默认) 显示真图 + 右上角小重生成按钮(0.3 透明度,hover 增亮放大,active 按压)。
// - opacity 跟随 isFlipping fade(cubic-bezier(0.4,0,0.2,1)),与 LeftPage 翻页动效协调。

import { useEffect, useState } from 'react';
import { db } from '../../db/database';
import { IconImage, IconRefresh, IconAlert } from '../Layout/TabIcons';
import { useImageGenProgressStore } from '../../stores/useImageGenProgressStore';

interface Props {
  /** 'blob://<pageId>' 或 https://... 远程 URL。 */
  src: string | undefined;
  /** 当 src 为 blob:// 占位时,需要 pageId 去 db.pageImages 取 Blob。 */
  pageId?: string;
  alt?: string;
  isFlipping?: boolean;
  status?: 'pending' | 'done' | 'failed' | 'skipped';
  /** 重生成按钮点击;不提供则隐藏按钮。 */
  onRegenerate?: () => void;
}

const ANIM = 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)';

export function PageBanner({ src, pageId, alt, isFlipping, status = 'done', onRegenerate }: Props) {
  // 若 src 是 blob:// 占位,从 IndexedDB 拉 Blob 转 objectURL;远程 URL 直接用
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);
  // pending 时订阅当前阶段子标签(trigger 各节点 setStage 写入)
  const stage = useImageGenProgressStore((s) => (pageId ? s.progress[pageId] : undefined));

  useEffect(() => {
    if (!src) { setObjectUrl(undefined); return; }
    if (!src.startsWith('blob://')) { setObjectUrl(src); return; }
    if (!pageId) { setObjectUrl(undefined); return; }
    let revoked = false;
    let createdUrl: string | undefined;
    (async () => {
      try {
        const row = await db.pageImages.get(pageId);
        if (revoked) return;
        if (!row) { setObjectUrl(undefined); return; }
        createdUrl = URL.createObjectURL(row.blob);
        setObjectUrl(createdUrl);
      } catch {
        setObjectUrl(undefined);
      }
    })();
    return () => {
      revoked = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src, pageId]);

  // skipped 状态等价无图,不渲染
  if (status === 'skipped' || (!src && status !== 'pending' && status !== 'failed')) return null;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      aspectRatio: '834/227',
      flexShrink: 0,
      marginBottom: 10,
      borderRadius: 3,
      overflow: 'hidden',
      background: 'linear-gradient(135deg, rgba(196,168,85,0.08), rgba(196,168,85,0.03))',
      boxShadow: 'inset 0 0 0 1px rgba(var(--ink-faded-rgb), 0.2), 0 1px 3px rgba(0,0,0,0.1)',
      opacity: isFlipping ? 0 : 1,
      transition: ANIM,
    }}>
      {status === 'done' && objectUrl && (
        <img
          src={objectUrl}
          alt={alt ?? ''}
          loading="lazy"
          onError={() => setObjectUrl(undefined)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            filter: 'sepia(0.15) contrast(0.95)',
          }}
        />
      )}

      {status === 'pending' && (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 6,
          }}>
            <div style={{
              opacity: 0.4,
              animation: 'pagebanner-spin 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            }}>
              <IconImage size={32} />
            </div>
            <span style={{
              fontSize: 11,
              color: 'var(--ink-faded)',
              fontFamily: 'var(--font-ui)',
              letterSpacing: 1,
            }}>正在生成插画</span>
            {stage && (
              <span style={{
                fontSize: 10,
                color: 'var(--gold)',
                fontFamily: 'var(--font-ui)',
                letterSpacing: 2,
                opacity: 0.85,
              }}>{stage}…</span>
            )}
          </div>
          {/* indeterminate 进度条 — 底部铜版风流光 */}
          <div className="page-banner-progress" />
        </>
      )}

      {status === 'failed' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 4, opacity: 0.65,
        }}>
          <IconAlert size={28} />
          <span style={{
            fontSize: 11,
            color: 'var(--ink-faded)',
            fontFamily: 'var(--font-ui)',
            letterSpacing: 1,
          }}>插画生成失败</span>
        </div>
      )}

      {onRegenerate && (status === 'done' || status === 'failed') && (
        <button
          type="button"
          onClick={onRegenerate}
          title="重新生成插画"
          className="page-banner-regen"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 28,
            height: 28,
            border: '1px solid rgba(var(--ink-faded-rgb), 0.4)',
            borderRadius: 3,
            background: 'rgba(var(--parchment-rgb, 245, 235, 215), 0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            opacity: status === 'failed' ? 1 : 0.35,
            transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            padding: 0,
          }}
        >
          <IconRefresh size={16} />
        </button>
      )}

      <style>{`
        @keyframes pagebanner-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pagebanner-progress-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .page-banner-progress {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 3px;
          background: rgba(var(--ink-faded-rgb), 0.12);
          overflow: hidden;
        }
        .page-banner-progress::before {
          content: '';
          position: absolute;
          inset: 0;
          width: 40%;
          background: linear-gradient(90deg, transparent, var(--gold, #c4a855) 50%, transparent);
          animation: pagebanner-progress-slide 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .page-banner-regen:hover {
          opacity: 1 !important;
          transform: scale(1.08);
        }
        .page-banner-regen:active {
          transform: scale(0.95);
        }
      `}</style>
    </div>
  );
}
