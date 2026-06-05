// src/utils/auto-name-form-fields.ts
//
// 兜底 polyfill：自动给页面里所有缺 name+id 的 input/textarea/select 加唯一 name 属性,
// 消除浏览器开发者工具的 "A form field element should have an id or name attribute" 警告。
//
// 背景：项目有 50+ 个 form field 散布在 Lorebook / Preset / Regex / Ext Manager / Settings
// 等管理界面里。手工给每个加 name 属性工程量大且易遗漏；这个 polyfill 在 React 渲染后
// 通过 MutationObserver 给所有缺 name+id 的 form field 自动补一个稳定 name(基于 placeholder
// + type + 递增 counter),与项目零侵入。
//
// 行为完全不变 —— React 不读 name 属性,提交也不依赖（项目不用 <form> POST）。这个属性
// 纯粹给浏览器看,让 autofill 警告闭嘴。
//
// 与显式手工 name 兼容: 若元素已有 name 或 id, 跳过。

let counter = 0;
const TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** 给单个元素补 name(若缺 name+id)。name 基于 placeholder 或 type,加递增 counter 保证唯一。 */
function ensureName(el: Element): void {
  if (!TAGS.has(el.tagName)) return;
  const fe = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (fe.name || fe.id) return;
  // 用 placeholder / type / tag 做基底,递增 counter 保证全局唯一
  const placeholder = fe.getAttribute('placeholder') || '';
  const type = (fe as HTMLInputElement).type || fe.tagName.toLowerCase();
  const base = placeholder.trim().slice(0, 24).replace(/\s+/g, '-').replace(/[^\w一-龥-]/g, '') || type;
  fe.setAttribute('name', `auto-${base}-${++counter}`);
}

/** 扫描整个 document.body,给所有缺 name+id 的 form field 补 name。 */
function scanAll(): void {
  document.body.querySelectorAll('input, textarea, select').forEach(ensureName);
}

/**
 * 启动 polyfill：先扫一遍现有 DOM,然后挂 MutationObserver 监听后续动态新增的 form field。
 * 应用启动时(main.tsx)调一次即可,无副作用。
 */
export function startAutoNameFormFields(): void {
  // 等 React 首次渲染完毕再扫(初次扫到的是 LandingScreen 的 form fields)
  if (typeof document === 'undefined') return; // SSR / 测试环境兜底
  const init = () => {
    scanAll();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (TAGS.has(n.tagName)) ensureName(n);
          n.querySelectorAll?.('input, textarea, select').forEach(ensureName);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
