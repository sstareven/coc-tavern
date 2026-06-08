// 文生图 API 配置段(2026-06-08):
// 复用 ApiManagementTab 的 CategoryBar/rowStyle/labelStyle/Toggle/HelpIcon/SliderRow 等 _shared 组件,
// 与主/MVU/补写三个 CategoryBar 同款视觉。

import { useSettingsStore } from '../../stores/useSettingsStore';
import { ApiModelPicker } from './ApiModelPicker';
import { CategoryBar, rowStyle, labelStyle, Toggle, HelpIcon, SliderRow } from './_shared';
import { SAMPLER_OPTIONS, IMAGE_STYLE_LABELS } from '../../api/image-style-data';
import type { ScenarioImageStyle } from '../../types/scenario';

const numInputStyle: React.CSSProperties = {
  width: 80,
  background: 'rgba(0,0,0,0.15)',
  border: '1px solid rgba(196,168,85,0.3)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'calc(11px * var(--system-ratio, 1))',
  padding: '4px 8px',
  borderRadius: 3,
  textAlign: 'right',
};

const selectStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.15)',
  border: '1px solid rgba(196,168,85,0.3)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'calc(11px * var(--system-ratio, 1))',
  padding: '4px 8px',
  borderRadius: 3,
};

const STYLE_KEYS: ScenarioImageStyle[] = [
  'vintage_photo', 'oil_painting', 'ink_wash', 'watercolor', 'engraving',
  'cinematic', 'sepia_film', 'photoreal', 'anime', 'custom',
];

export function ImageApiSection() {
  const imgEnabled = useSettingsStore((s) => s.imageGenerationEnabled);
  const setImgEnabled = useSettingsStore((s) => s.setImageGenerationEnabled);
  const autoGen = useSettingsStore((s) => s.imageAutoGenerate);
  const setAutoGen = useSettingsStore((s) => s.setImageAutoGenerate);
  const storageMode = useSettingsStore((s) => s.imageStorageMode);
  const setStorageMode = useSettingsStore((s) => s.setImageStorageMode);
  const maxBlobBytes = useSettingsStore((s) => s.imageMaxBlobBytes);
  const setMaxBlobBytes = useSettingsStore((s) => s.setImageMaxBlobBytes);
  const rpmLimit = useSettingsStore((s) => s.imageRpmLimit);
  const setRpmLimit = useSettingsStore((s) => s.setImageRpmLimit);
  const imageDefaults = useSettingsStore((s) => s.imageDefaults);
  const setImageDefaults = useSettingsStore((s) => s.setImageDefaults);

  return (
    <div style={{ marginBottom: 16 }}>
      <CategoryBar label="图像生成 API" />

      <div style={rowStyle}>
        <span style={labelStyle}>
          总开关
          <HelpIcon text={'打开后,主回合 appendPage 之后会自动 fire-and-forget 调用图像 API 生成本回合插画(834×227 自适应在左页顶部)。\n\n关闭=完全不触发生图调用,玩家界面不再显示 banner;已生成的图保留不删。'} />
        </span>
        <Toggle on={imgEnabled} onChange={() => setImgEnabled(!imgEnabled)} onLabel="开" offLabel="关" />
      </div>

      {imgEnabled && (
        <>
          <ApiModelPicker channel="image" />

          <div style={rowStyle}>
            <span style={labelStyle}>
              自动生成
              <HelpIcon text={'打开=主回合写入新页后自动生图(默认);关闭=只在玩家点击重生成按钮时才生成。\n\n建议先用关闭体验剧情,确认满意再开自动。'} />
            </span>
            <Toggle on={autoGen} onChange={() => setAutoGen(!autoGen)} onLabel="自动" offLabel="手动" />
          </div>

          <div style={rowStyle}>
            <span style={labelStyle}>
              存储方式
              <HelpIcon text={'本地 blob=图存在 IndexedDB pageImages 表,30 页约 6MB,断网仍可看;远程 URL=BookPage.imageUrl 直接存 https:// URL,体积 0 但中转站 URL 可能 7 天过期失效。\n\n默认 本地 blob。'} />
            </span>
            <select
              value={storageMode}
              onChange={(e) => setStorageMode(e.target.value as 'indexeddb-blob' | 'remote-url')}
              style={selectStyle}
            >
              <option value="indexeddb-blob">本地 blob</option>
              <option value="remote-url">远程 URL</option>
            </select>
          </div>

          {storageMode === 'indexeddb-blob' && (
            <div style={rowStyle}>
              <span style={labelStyle}>
                单张图最大字节
                <HelpIcon text={'本地 blob 模式下,单张图超过此尺寸跳过保存,防 IndexedDB 单 row 膨胀。832×224 JPEG 实测 80-180KB,默认 300KB 安全;PNG 可能更大,可上调到 800KB。'} />
              </span>
              <input
                type="number"
                min={50_000}
                max={5_000_000}
                step={10_000}
                value={maxBlobBytes}
                onChange={(e) => setMaxBlobBytes(Number(e.target.value) || 300_000)}
                style={numInputStyle}
              />
              <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)', marginLeft: 6 }}>
                {Math.round(maxBlobBytes / 1024)}KB
              </span>
            </div>
          )}

          <div style={rowStyle}>
            <span style={labelStyle}>
              图像 RPM
              <HelpIcon text={'图像 API 每分钟最多请求数(独立桶,不与主/MVU/补写共享配额)。0=不限制,最大 10。\n\n图像 API 通常上限独立,DALL-E 3 约 5-15 RPM,SD-WebUI 本地无限制。'} />
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                value={rpmLimit}
                onChange={(e) => setRpmLimit(Number(e.target.value) || 0)}
                style={numInputStyle}
              />
              <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)' }}>
                {rpmLimit === 0 ? '不限制' : `${rpmLimit} 次/分`}
              </span>
            </div>
          </div>

          <SliderRow
            label="默认宽"
            value={imageDefaults.width}
            min={256}
            max={2048}
            step={32}
            help="生成图像的像素宽度。832×224 是默认横幅(SD 8 倍数友好),浏览器侧自适应填满左页。"
            onChange={(v) => setImageDefaults({ width: v })}
          />
          <SliderRow
            label="默认高"
            value={imageDefaults.height}
            min={128}
            max={1024}
            step={32}
            help="生成图像的像素高度。"
            onChange={(v) => setImageDefaults({ height: v })}
          />
          <SliderRow
            label="采样步数"
            value={imageDefaults.steps}
            min={4}
            max={80}
            step={1}
            help="去噪步数,越高质量越细致但越慢。常用 20-30。"
            onChange={(v) => setImageDefaults({ steps: v })}
          />
          <SliderRow
            label="CFG 强度"
            value={imageDefaults.cfgScale}
            min={1}
            max={20}
            step={1}
            help="prompt 引导强度。值小=更随性自然,值大=更贴合 prompt 但易过饱和。SD 常用 5-9,DALL-E 走 OpenAI 不读此值。"
            onChange={(v) => setImageDefaults({ cfgScale: v })}
          />

          <div style={rowStyle}>
            <span style={labelStyle}>
              采样器
              <HelpIcon text={'SD 主流采样算法。DPM++ 2M Karras 质量稳定,Euler a 速度快,DDIM 适合写实。DALL-E/官方 OpenAI 端点会忽略此字段。'} />
            </span>
            <select
              value={imageDefaults.sampler}
              onChange={(e) => setImageDefaults({ sampler: e.target.value })}
              style={selectStyle}
            >
              {SAMPLER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div style={rowStyle}>
            <span style={labelStyle}>
              默认风格
              <HelpIcon text={'全局默认风格预设。剧本编辑器可单独覆盖本剧本的风格。\n\n10 种风格各对应一段英文 SD prompt 片段(SD 模型对英文响应远好于中文)。custom=用 stylePromptOverride 自填。'} />
            </span>
            <select
              value={imageDefaults.style}
              onChange={(e) => setImageDefaults({ style: e.target.value as ScenarioImageStyle })}
              style={selectStyle}
            >
              {STYLE_KEYS.map((k) => (
                <option key={k} value={k}>{IMAGE_STYLE_LABELS[k]}</option>
              ))}
            </select>
          </div>

          <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
            <span style={{ ...labelStyle, paddingTop: 6 }}>
              负面 prompt
              <HelpIcon text={'生图时不希望出现的元素(英文逗号分隔)。剧本编辑器可在此基础上追加更多。\n\n默认含 lowres/blurry/watermark/extra fingers/bad anatomy 等常见瑕疵。'} />
            </span>
            <textarea
              value={imageDefaults.negativePrompt}
              onChange={(e) => setImageDefaults({ negativePrompt: e.target.value })}
              rows={3}
              style={{
                flex: 1,
                background: 'rgba(0,0,0,0.15)',
                border: '1px solid rgba(196,168,85,0.3)',
                color: 'var(--ink)',
                fontFamily: 'var(--font-ui)',
                fontSize: 'calc(11px * var(--system-ratio, 1))',
                padding: '6px 8px',
                borderRadius: 3,
                resize: 'vertical',
                minHeight: 60,
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
