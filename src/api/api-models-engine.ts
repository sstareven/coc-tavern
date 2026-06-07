// src/api/api-models-engine.ts —— 模型搜索/分类/掩码 纯逻辑层
// 设计:把多条 ApiProfile 上的 availableModels 摊平为统一的 (profile, model) 池,
// 供 SearchableModelSelect 做扁平搜索 + 分类分组。所有函数纯,无 zustand/React 耦合。

import type { ApiProfile } from './api-profiles-engine';

/** 模型选项:跨 profile 扁平池里的一条。 */
export interface ProfileModel {
  profileId: string;
  profileLabel: string;
  modelName: string;
}

/**
 * 把所有 profile 的 availableModels 摊平为 ProfileModel[]。
 * 顺序:profiles 顺序 × 每个 profile 内 availableModels 顺序(稳定可重排序)。
 */
export function collectAllProfileModels(profiles: ApiProfile[]): ProfileModel[] {
  const out: ProfileModel[] = [];
  for (const p of profiles) {
    for (const m of p.availableModels) {
      out.push({ profileId: p.id, profileLabel: p.label, modelName: m });
    }
  }
  return out;
}

/**
 * 按搜索词不区分大小写过滤;modelName 或 profileLabel 任一含 q 即保留。
 * q 空(trim 后)→ 原列表(包括顺序)直接返回。
 */
export function filterModelsBySearch(items: ProfileModel[], q: string): ProfileModel[] {
  const s = q.trim().toLowerCase();
  if (!s) return items;
  return items.filter(
    (m) => m.modelName.toLowerCase().includes(s) || m.profileLabel.toLowerCase().includes(s),
  );
}

/**
 * 按 modelName 拆首段做分类:'deepseek-v4-pro' → 'deepseek',无分隔符整串作分类。
 * 返回保持 items 顺序的分组对象(insertion order;JS spec 普通字符串 key 保持插入序)。
 * 用法:搜索过滤后传入 → 仅得到有命中的分组;若 items 为空 → 返回 {}。
 */
export function categorizeModels(
  items: ProfileModel[],
  separator: string = '-',
): Record<string, ProfileModel[]> {
  const groups: Record<string, ProfileModel[]> = {};
  for (const it of items) {
    const idx = it.modelName.indexOf(separator);
    const cat = idx === -1 ? it.modelName : it.modelName.slice(0, idx);
    const key = cat.toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(it);
  }
  return groups;
}

/**
 * API Key 显示掩码:保留尾 4 位,前面 ****;短于等于 4 位时全 ****。
 * 用于列表 / 详情页展示,杜绝完整明文出现在 UI 上。
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '****';
  return `****${key.slice(-4)}`;
}

/**
 * 从 URL 取主机名展示;无效 URL 时回退原串(避免抛错)。
 * 用于列表 cell 紧凑显示(代替整段 https://...)。
 */
export function displayHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
