// src/api/api-profiles-engine.ts —— API 管理「Profile」纯逻辑层
// 设计:与 zustand store / React 完全解耦,所有 CRUD/校验/脱敏均为纯函数,可独立单测。
//   ApiProfile = 一条 LLM 接入凭证(API 地址 + Key + 识别名 + 该端点的可用模型列表)
//   主/MVU/补写 三套调用站点通过 selectedXxxApiProfileId 引用 ApiProfile,
//   useSettingsStore.getEffectiveMainApi/Mvu/Rewrite() 把 (profile, model) 拉平为
//   {baseUrl, apiKey, model} 喂给下游 sendChatCompletion/fetchModelList。

/** 一条 API 凭证记录。apiKey 字段持久化(重启不重输),但 export/UI 显示走脱敏。 */
export interface ApiProfile {
  /** 内部 ID — crypto.randomUUID 或时间戳+随机降级。永不修改。 */
  id: string;
  /** 识别名 — 用户必填的人类可读别名,如「DeepSeek 官方」「OpenRouter 备用」。 */
  label: string;
  /** OpenAI 兼容 base URL,如 https://api.deepseek.com。不含末尾 / 也行,fetchModelList 会自处理。 */
  apiBaseUrl: string;
  /** API Key 明文(用于 Authorization: Bearer)。UI/日志/export 均脱敏。 */
  apiKey: string;
  /** 上次「连接测试」拉到的模型 ID 列表。空数组=未测过或失败。 */
  availableModels: string[];
  /** 创建时间(ms epoch)。 */
  createdAt: number;
  /** 最近编辑时间(ms epoch)。 */
  updatedAt: number;
}

/** 新建/编辑表单输入(无 ID、无时间戳、无 availableModels)。 */
export interface ApiProfileForm {
  label: string;
  apiBaseUrl: string;
  apiKey: string;
}

/** 编辑时的部分更新载荷;apiKey 缺省=保持原值(防误清空)。 */
export interface ApiProfilePatch {
  label?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  availableModels?: string[];
}

/** 生成新 ID。优先 crypto.randomUUID;降级时间戳+随机串(老浏览器/SSR fallback)。 */
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 从表单创建一条新 profile。label/apiBaseUrl 自动 trim;时间戳填当前。 */
export function createApiProfile(form: ApiProfileForm): ApiProfile {
  const now = Date.now();
  return {
    id: genId(),
    label: form.label.trim(),
    apiBaseUrl: form.apiBaseUrl.trim(),
    apiKey: form.apiKey,
    availableModels: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** 用 patch 部分更新一条 profile。trim label/apiBaseUrl;updatedAt 自动刷新。 */
export function updateApiProfile(existing: ApiProfile, patch: ApiProfilePatch): ApiProfile {
  return {
    ...existing,
    ...(patch.label !== undefined ? { label: patch.label.trim() } : null),
    ...(patch.apiBaseUrl !== undefined ? { apiBaseUrl: patch.apiBaseUrl.trim() } : null),
    ...(patch.apiKey !== undefined ? { apiKey: patch.apiKey } : null),
    ...(patch.availableModels !== undefined ? { availableModels: patch.availableModels } : null),
    updatedAt: Date.now(),
  };
}

/** 从列表中移除指定 ID 的 profile。返回新数组,不就地修改。 */
export function deleteApiProfileById(profiles: ApiProfile[], id: string): ApiProfile[] {
  return profiles.filter((p) => p.id !== id);
}

/** 按 ID 查找 profile;null/未匹配返回 null。供 store 的 effective selector 用。 */
export function resolveProfileById(profiles: ApiProfile[], id: string | null | undefined): ApiProfile | null {
  if (!id) return null;
  return profiles.find((p) => p.id === id) ?? null;
}

/**
 * 校验表单。规则:
 *   - label 必填非空
 *   - apiBaseUrl 必填,必须是合法 http(s) URL
 *   - apiKey 允许空(某些本地代理无鉴权),但 UI 会提示
 */
export function validateApiProfileForm(form: ApiProfileForm): { ok: boolean; error?: string } {
  const label = form.label.trim();
  const url = form.apiBaseUrl.trim();
  if (!label) return { ok: false, error: '识别名不能为空' };
  if (!url) return { ok: false, error: 'API 地址不能为空' };
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'API 地址必须以 http 或 https 开头' };
    }
  } catch {
    return { ok: false, error: 'API 地址格式无效' };
  }
  return { ok: true };
}
