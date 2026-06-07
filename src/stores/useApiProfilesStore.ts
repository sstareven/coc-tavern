// src/stores/useApiProfilesStore.ts —— API 凭证管理 zustand 独立 store
// 设计要点:
//   - 与 useSettingsStore 完全分离(decoupling-modularity-required):profile 不挤进 settings
//   - apiKey 字段持久化到 Dexie kvStore — 用户重启不重输(UX > 安全洁癖)
//   - 三套调用站点(主/MVU/补写)各自独立可选 profile + model
//   - deleteProfile 级联清空三处的 selectedXxxApiProfileId(若指向已删 profile),
//     防止下游 effective selector 解析到 null profile 报错
//   - 连接测试拉到的模型列表 setProfileAvailableModels 单独写,不抹其他字段

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';
import {
  type ApiProfile,
  type ApiProfileForm,
  type ApiProfilePatch,
  createApiProfile,
  updateApiProfile,
  deleteApiProfileById,
} from '../api/api-profiles-engine';

interface ApiProfilesState {
  apiProfiles: ApiProfile[];

  /** 主叙事 API 使用哪条 profile;null=未选(下游 effective 走空配置,需提示用户去 API 管理添加)。 */
  selectedMainApiProfileId: string | null;
  /** 主叙事在该 profile 下选了哪个 model id;空串=未选。 */
  selectedMainModel: string;

  /** MVU 提取 API 使用哪条 profile;null=回退主线(配合 settings.mvuUseIndependentApi=false)。 */
  selectedMvuApiProfileId: string | null;
  selectedMvuModel: string;

  /** 行动补写 API 使用哪条 profile;null=回退主线(配合 settings.rewriteUseIndependentApi=false)。 */
  selectedRewriteApiProfileId: string | null;
  selectedRewriteModel: string;
}

interface ApiProfilesStore extends ApiProfilesState {
  /** 添加一条新 profile;返回创建的对象(UI 拿到后可立即 setSelectedMain 设为当前选用)。 */
  addProfile: (form: ApiProfileForm) => ApiProfile;
  /** 编辑现有 profile(部分字段);未传字段保持原值。apiKey 缺省=不覆盖(防误清空)。 */
  updateProfileById: (id: string, patch: ApiProfilePatch) => void;
  /** 删除 profile;同时级联清空指向它的 selectedXxxApiProfileId(三套调用)。 */
  deleteProfileById: (id: string) => void;
  /** 连接测试成功后回写 availableModels(不抹 apiKey 等其他字段)。 */
  setProfileAvailableModels: (id: string, models: string[]) => void;

  setSelectedMain: (profileId: string | null, model: string) => void;
  setSelectedMvu: (profileId: string | null, model: string) => void;
  setSelectedRewrite: (profileId: string | null, model: string) => void;
}

const defaults: ApiProfilesState = {
  apiProfiles: [],
  selectedMainApiProfileId: null,
  selectedMainModel: '',
  selectedMvuApiProfileId: null,
  selectedMvuModel: '',
  selectedRewriteApiProfileId: null,
  selectedRewriteModel: '',
};

export const useApiProfilesStore = create<ApiProfilesStore>()(
  persist(
    (set, get) => ({
      ...defaults,

      addProfile: (form) => {
        const profile = createApiProfile(form);
        set((s) => ({ apiProfiles: [...s.apiProfiles, profile] }));
        return profile;
      },

      updateProfileById: (id, patch) => {
        set((s) => ({
          apiProfiles: s.apiProfiles.map((p) => (p.id === id ? updateApiProfile(p, patch) : p)),
        }));
      },

      deleteProfileById: (id) => {
        const s = get();
        const nextProfiles = deleteApiProfileById(s.apiProfiles, id);
        // 级联清空:指向已删 profile 的三处选择全部回到 null
        const cascade: Partial<ApiProfilesState> = { apiProfiles: nextProfiles };
        if (s.selectedMainApiProfileId === id) {
          cascade.selectedMainApiProfileId = null;
          cascade.selectedMainModel = '';
        }
        if (s.selectedMvuApiProfileId === id) {
          cascade.selectedMvuApiProfileId = null;
          cascade.selectedMvuModel = '';
        }
        if (s.selectedRewriteApiProfileId === id) {
          cascade.selectedRewriteApiProfileId = null;
          cascade.selectedRewriteModel = '';
        }
        set(cascade);
      },

      setProfileAvailableModels: (id, models) => {
        set((s) => ({
          apiProfiles: s.apiProfiles.map((p) =>
            p.id === id ? { ...p, availableModels: models, updatedAt: Date.now() } : p,
          ),
        }));
      },

      setSelectedMain: (profileId, model) => {
        set({ selectedMainApiProfileId: profileId, selectedMainModel: model });
      },
      setSelectedMvu: (profileId, model) => {
        set({ selectedMvuApiProfileId: profileId, selectedMvuModel: model });
      },
      setSelectedRewrite: (profileId, model) => {
        set({ selectedRewriteApiProfileId: profileId, selectedRewriteModel: model });
      },
    }),
    {
      // v1.14.0 起新增的 store。版本号 v1 留作日后 schema 迁移用。
      name: 'coc_api_profiles_v1',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state),
      // 顶层 shallow merge + 老 profile 字段兜底(v1.14.x 新增的 extraParams 补 '')。
      merge: (persisted, current) => {
        const merged = { ...current, ...((persisted ?? {}) as Partial<ApiProfilesStore>) } as ApiProfilesStore;
        // 给老 profile 兜底 extraParams 默认值,防下游 undefined.trim() 等崩
        merged.apiProfiles = (merged.apiProfiles ?? []).map((p) => ({
          ...p,
          extraParams: typeof p.extraParams === 'string' ? p.extraParams : '',
        }));
        return merged;
      },
    },
  ),
);
