// 文生图 API 配置段(2026-06-08 重构 UI):
// 复用 ApiManagementTab 的 CategoryBar/rowStyle/labelStyle/Toggle/HelpIcon/SliderRow 等 _shared 组件。
// 用 SubLabel 把内容分成 4 个子组以提升视觉层级:
//   - 基础(总开关 + 模型 + 协议 + 自动生成)
//   - 存储(本地/远程 + 单图字节 + RPM)
//   - 生成参数(宽/高/步数/CFG/采样器)
//   - 风格与负面 prompt
// 选择器与数字输入统一走 _shared.selectStyle / _shared.numInputStyle。
// 协议下拉下方追加一行『当前模式特征』灰字,玩家不用点 ? 也能识别。
// 协议=novelai 时显示『采用 832×1216 推荐尺寸』一键按钮。

import { useSettingsStore } from '../../stores/useSettingsStore';
import { useApiProfilesStore } from '../../stores/useApiProfilesStore';
import { ApiModelPicker } from './ApiModelPicker';
import {
  CategoryBar, rowStyle, labelStyle, Toggle, HelpIcon, SliderRow, SubLabel,
  numInputStyle, BrassSelect, type BrassSelectOption,
} from './_shared';
import { SAMPLER_OPTIONS, IMAGE_STYLE_LABELS } from '../../api/image-style-data';
import type { ScenarioImageStyle } from '../../types/scenario';
import type { ImagePayloadMode } from '../../api/image-gen-engine';
import { NOVELAI_DEFAULT_WIDTH, NOVELAI_DEFAULT_HEIGHT } from '../../api/image-gen-novelai';

const STYLE_KEYS: ScenarioImageStyle[] = [
  'vintage_photo', 'oil_painting', 'ink_wash', 'watercolor', 'engraving',
  'cinematic', 'sepia_film', 'photoreal', 'anime', 'custom',
];

/** 各协议模式的一句话特征,显示在下拉下方让玩家不必点 ? 也能识别当前选择。 */
const PAYLOAD_MODE_BRIEF: Record<ImagePayloadMode, string> = {
  'auto':              '按 URL/model 启发式自动选择;首次 4xx 自动降级 openai-strict 重试',
  'openai-strict':     '官方 /v1/images/generations · 仅发 model/prompt/size/n · size 映射到 1024² 系列',
  'gpt-image-1':       '同 openai-strict 但剥 response_format · gpt-image-1 默认 b64_json',
  'sd-compat':         '自建 SD WebUI 或透传中转 · 发完整 SD 五件套 · 保留自由尺寸',
  'pollinations':      'Pollinations(MVP 同 openai-strict 行为)',
  'chat-completions':  '/v1/chat/completions 假流式中转 · messages 包 prompt · markdown 图链回吐',
  'novelai':           '/ai/generate-image 嵌套 parameters · ZIP 响应 · 需 832×1216 推荐尺寸 + 64 倍数',
};

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
          {/* ──── 基础:模型 + 协议 + 自动开关 ──── */}
          <SubLabel label="基础" hint="API 凭证 · 协议 · 自动开关" />
          <ApiModelPicker channel="image" />

          <PayloadModeRow />

          <div style={rowStyle}>
            <span style={labelStyle}>
              自动生成
              <HelpIcon text={'打开=主回合写入新页后自动生图(默认);关闭=只在玩家点击重生成按钮时才生成。\n\n建议先用关闭体验剧情,确认满意再开自动。'} />
            </span>
            <Toggle on={autoGen} onChange={() => setAutoGen(!autoGen)} onLabel="自动" offLabel="手动" />
          </div>

          {/* ──── 存储 ──── */}
          <SubLabel label="存储与限速" hint="图存哪 · 单图上限 · 速率桶" />

          <div style={rowStyle}>
            <span style={labelStyle}>
              存储方式
              <HelpIcon text={'本地 blob=图存在 IndexedDB pageImages 表,30 页约 6MB,断网仍可看;远程 URL=BookPage.imageUrl 直接存 https:// URL,体积 0 但中转站 URL 可能 7 天过期失效。\n\n默认 本地 blob。'} />
            </span>
            <BrassSelect
              value={storageMode}
              onChange={(v) => setStorageMode(v as 'indexeddb-blob' | 'remote-url')}
              options={[
                { value: 'indexeddb-blob', label: '本地 blob', brief: '存 IndexedDB,断网仍可看' },
                { value: 'remote-url', label: '远程 URL', brief: '存中转返回的 URL,体积 0 但可能过期' },
              ]}
              width={200}
            />
          </div>

          {storageMode === 'indexeddb-blob' && (
            <div style={rowStyle}>
              <span style={labelStyle}>
                单张图最大字节
                <HelpIcon text={'本地 blob 模式下,单张图超过此尺寸跳过保存,防 IndexedDB 单 row 膨胀。\n\n参考实测:\n· 832×224 JPEG ≈ 80-180KB(sd-compat / openai-strict 模式)\n· 1024×1024 JPEG ≈ 200-400KB\n· 1024×1024 PNG ≈ 1-2MB(chat-completions 类网关常返回该尺寸 PNG)\n· NovelAI 832×1216 PNG ≈ 1-2.5MB(novelai 模式建议保持 2MB 或上调到 3MB)\n\n默认 2MB,可下调省存储或上调到 10MB 收最高清图。'} />
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={50_000}
                  max={10_000_000}
                  step={100_000}
                  value={maxBlobBytes}
                  onChange={(e) => setMaxBlobBytes(Number(e.target.value) || 2_000_000)}
                  style={{ ...numInputStyle, width: 96, textAlign: 'right' }}
                />
                <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--gold)', fontFamily: 'var(--font-mono)', minWidth: 48, textAlign: 'right' }}>
                  {maxBlobBytes >= 1_000_000 ? `${(maxBlobBytes / 1_000_000).toFixed(1)} MB` : `${Math.round(maxBlobBytes / 1024)} KB`}
                </span>
              </div>
            </div>
          )}

          <SliderRow
            label="图像 RPM"
            help={'图像 API 每分钟最多请求数(独立桶,不与主/MVU/补写共享配额)。0=不限制,最大 10。\n\n图像 API 通常上限独立,DALL-E 3 约 5-15 RPM,SD-WebUI 本地无限制。\nNovelAI 自 2024-03 禁并发,novelai 模式建议设 1。'}
            value={rpmLimit}
            min={0}
            max={10}
            step={1}
            onChange={setRpmLimit}
            formatValue={(v) => (v === 0 ? '不限' : `${v}/分`)}
          />

          {/* ──── 生成参数 ──── */}
          <SubLabel label="生成参数" hint="尺寸 · 步数 · 强度 · 采样器" />

          <NovelAiPresetRow
            currentWidth={imageDefaults.width}
            currentHeight={imageDefaults.height}
            onApplyPortrait={() => setImageDefaults({ width: NOVELAI_DEFAULT_WIDTH, height: NOVELAI_DEFAULT_HEIGHT })}
            onApplyLandscape={() => setImageDefaults({ width: NOVELAI_DEFAULT_HEIGHT, height: NOVELAI_DEFAULT_WIDTH })}
            onApplySquare={() => setImageDefaults({ width: 1024, height: 1024 })}
          />

          <SliderRow
            label="默认宽"
            value={imageDefaults.width}
            min={256}
            max={2048}
            step={32}
            help="生成图像的像素宽度。832×224 是默认横幅(SD 8 倍数友好),浏览器侧自适应填满左页。NovelAI 模式自动 round 到 64 的倍数。"
            onChange={(v) => setImageDefaults({ width: v })}
            unit=" px"
          />
          <SliderRow
            label="默认高"
            value={imageDefaults.height}
            min={128}
            max={1024}
            step={32}
            help="生成图像的像素高度。"
            onChange={(v) => setImageDefaults({ height: v })}
            unit=" px"
          />
          <SliderRow
            label="采样步数"
            value={imageDefaults.steps}
            min={4}
            max={80}
            step={1}
            help="去噪步数,越高质量越细致但越慢。常用 20-30。NovelAI Opus 免费档上限 28。"
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
              <HelpIcon text={'SD 主流采样算法。DPM++ 2M Karras 质量稳定,Euler a 速度快,DDIM 适合写实。\n\n各模式适配:\n· DALL-E / 官方 OpenAI 端点 → 忽略此字段\n· novelai → 自动映射到 NovelAI 的 k_* 系列(Euler a → k_euler_ancestral 等)'} />
            </span>
            <BrassSelect
              value={imageDefaults.sampler}
              onChange={(v) => setImageDefaults({ sampler: v })}
              options={SAMPLER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              width={200}
            />
          </div>

          {/* ──── 风格与负面 prompt ──── */}
          <SubLabel label="风格" hint="预设画风 · 负面词" />

          <div style={rowStyle}>
            <span style={labelStyle}>
              默认风格
              <HelpIcon text={'全局默认风格预设。剧本编辑器可单独覆盖本剧本的风格。\n\n10 种风格各对应一段英文 SD prompt 片段(SD 模型对英文响应远好于中文)。custom=用 stylePromptOverride 自填。'} />
            </span>
            <BrassSelect
              value={imageDefaults.style}
              onChange={(v) => setImageDefaults({ style: v as ScenarioImageStyle })}
              options={STYLE_KEYS.map((k) => ({ value: k, label: IMAGE_STYLE_LABELS[k] }))}
              width={200}
            />
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
                marginLeft: 12,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--brass)',
                color: 'var(--text-light)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'calc(11px * var(--system-ratio, 1))',
                padding: '6px 8px',
                borderRadius: 3,
                resize: 'vertical',
                minHeight: 60,
                outline: 'none',
                caretColor: 'var(--gold)',
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function PayloadModeRow() {
  const mode = useApiProfilesStore((s) => s.selectedImagePayloadMode);
  const setMode = useApiProfilesStore((s) => s.setSelectedImagePayloadMode);

  const options: BrassSelectOption[] = [
    { value: 'auto',             label: 'auto · 自动探测',                  brief: PAYLOAD_MODE_BRIEF['auto'] },
    { value: 'openai-strict',    label: 'openai-strict · OpenAI / DALL-E 3', brief: PAYLOAD_MODE_BRIEF['openai-strict'] },
    { value: 'gpt-image-1',      label: 'gpt-image-1',                       brief: PAYLOAD_MODE_BRIEF['gpt-image-1'] },
    { value: 'chat-completions', label: 'chat-completions · 假流式 / nano-banana', brief: PAYLOAD_MODE_BRIEF['chat-completions'] },
    { value: 'sd-compat',        label: 'sd-compat · 自建 SD / 透传中转',    brief: PAYLOAD_MODE_BRIEF['sd-compat'] },
    { value: 'novelai',          label: 'novelai · NovelAI 官方插画',        brief: PAYLOAD_MODE_BRIEF['novelai'] },
    { value: 'pollinations',     label: 'pollinations',                      brief: PAYLOAD_MODE_BRIEF['pollinations'] },
  ];

  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={labelStyle}>
          协议模式
          <HelpIcon text={[
            '不同后端对 OpenAI 兼容 /v1/images/generations 协议的字段集要求差异巨大。',
            '',
            '【auto】(默认推荐) 自动探测:',
            '  · model 含 nano-banana / 假流式 / gemini+image → chat-completions',
            '  · URL 含 openai.com 或 model 是 dall-e* → openai-strict',
            '  · model 是 gpt-image* → gpt-image-1',
            '  · 其他 → sd-compat',
            '  · 首次 400 自动降级 openai-strict 重试一次',
            '  · novelai 不进 auto,必须显式选',
            '',
            '【openai-strict】OpenAI 官方 / DALL-E 3:仅发 model/prompt/size/n/response_format,size 自动映射到 1024×1024/1792×1024/1024×1792',
            '',
            '【gpt-image-1】同 openai-strict 但额外剥 response_format(gpt-image-1 默认返回 b64_json,不接受显式参数)',
            '',
            '【sd-compat】自建 SD WebUI / SD 透传中转:发完整 SD 五件套(negative_prompt/steps/cfg_scale/sampler/seed),保留 832×224 等自由尺寸',
            '',
            '【chat-completions】"假流式"中转 / nano-banana / gemini-pro-image:走 /v1/chat/completions + messages 包 prompt,响应 content 用 markdown ![](url 或 dataURL) 给图',
            '',
            '【pollinations】Pollinations(MVP 同 openai-strict 行为)',
            '',
            '【novelai】NovelAI 官方 /ai/generate-image:body 走 {input/model/action/parameters} 嵌套结构,响应是 ZIP 内含 PNG。',
            '  · baseUrl 填 https://image.novelai.net(不带 /v1/)',
            '  · apiKey 填 NovelAI Web → 设置 → 账户 → Get Persistent API Token(pst-xxx 格式)',
            '  · model 推荐 nai-diffusion-4-5-full / nai-diffusion-4-5-curated / nai-diffusion-3',
            '  · Opus 免费档:尺寸 ≤ 1024×1024 + 步数 ≤ 28 + 张数 1;超出按 Anlas 计费',
            '  · 宽高需 64 的倍数(超出自动四舍五入),832×224 横幅在 NovelAI 会出畸形,建议 832×1216 portrait',
            '  · 已禁并发,图像 RPM 建议设 1',
            '  · 前端直连有 CORS 限制,实际部署需用支持 NovelAI 透传的中转 / 自建 Cloudflare Worker 代理',
            '  · 高级参数(sm / sm_dyn / cfg_rescale 等)走 extraParams 的 parameters.xxx 点号路径',
            '',
            '遇 HTTP 400 invalid_request:多半是字段不被接受或 size 越界,先尝试切到 openai-strict;若响应里有 message.content 含 markdown 图链接则切 chat-completions。',
          ].join('\n')} />
        </span>
        <BrassSelect
          value={mode}
          onChange={(v) => setMode(v as ImagePayloadMode)}
          options={options}
          width={260}
          popoverMaxHeight={420}
        />
      </div>
      <div style={{
        fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)',
        fontFamily: 'var(--font-ui)', lineHeight: 1.6, paddingLeft: 2,
      }}>
        {PAYLOAD_MODE_BRIEF[mode]}
      </div>
    </div>
  );
}

/** 协议=novelai 时显示的尺寸预设按钮行(portrait/landscape/square,均符合 64 倍数 + ≤ 1MP)。 */
function NovelAiPresetRow({
  currentWidth, currentHeight,
  onApplyPortrait, onApplyLandscape, onApplySquare,
}: {
  currentWidth: number; currentHeight: number;
  onApplyPortrait: () => void; onApplyLandscape: () => void; onApplySquare: () => void;
}) {
  const mode = useApiProfilesStore((s) => s.selectedImagePayloadMode);
  if (mode !== 'novelai') return null;

  const isPortrait = currentWidth === NOVELAI_DEFAULT_WIDTH && currentHeight === NOVELAI_DEFAULT_HEIGHT;
  const isLandscape = currentWidth === NOVELAI_DEFAULT_HEIGHT && currentHeight === NOVELAI_DEFAULT_WIDTH;
  const isSquare = currentWidth === 1024 && currentHeight === 1024;

  return (
    <div style={rowStyle}>
      <span style={labelStyle}>
        NovelAI 预设
        <HelpIcon text="NovelAI Opus 免费档对应的三档官方推荐尺寸,任选一档把『默认宽/默认高』直接设为对应值。" />
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <PresetBtn active={isPortrait} label="纵向 832×1216" onClick={onApplyPortrait} />
        <PresetBtn active={isLandscape} label="横向 1216×832" onClick={onApplyLandscape} />
        <PresetBtn active={isSquare} label="方形 1024×1024" onClick={onApplySquare} />
      </div>
    </div>
  );
}

function PresetBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 3,
        border: active ? '1px solid var(--gold)' : '1px solid var(--brass)',
        background: active ? 'rgba(196,168,85,0.18)' : 'rgba(0,0,0,0.2)',
        color: active ? 'var(--gold)' : 'var(--text-light)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'calc(10px * var(--system-ratio, 1))',
        letterSpacing: 1,
        cursor: 'pointer',
        transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--gold)';
        e.currentTarget.style.color = 'var(--gold)';
        e.currentTarget.style.filter = 'brightness(1.12)';
        e.currentTarget.style.transform = 'scale(1.04)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = active ? 'var(--gold)' : 'var(--brass)';
        e.currentTarget.style.color = active ? 'var(--gold)' : 'var(--text-light)';
        e.currentTarget.style.filter = 'brightness(1)';
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
    >
      {label}
    </button>
  );
}
