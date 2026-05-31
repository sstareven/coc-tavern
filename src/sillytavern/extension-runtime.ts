/**
 * 扩展运行时桥接 — inspired by 复用 SillyTavern-style th-script-engine 沙箱。
 *
 * 把「已启用且含内联代码」的 Extension 映射成 TH 脚本节点，交给 loadThScripts 在
 * 受限沙箱（new Function + with，黑名单屏蔽 window/fetch/eval 等）执行。扩展脚本可定义
 * init()/onSend(text)/onReceive(text)，与 TH 全局脚本走同一生命周期。
 *
 * 安全：绝不加载远程 URL / 动态 import；entryPoint 仅作元数据展示。
 * 纯计算层：零副作用，不读 store/kv（扩展由调用方读取后传入）。
 */
import type { Extension, THScriptTree } from '../types';

export function extensionsToScripts(exts: Extension[]): THScriptTree[] {
  const scripts: THScriptTree[] = [];
  for (const ext of exts) {
    if (!ext.enabled || !ext.code || !ext.code.trim()) continue;
    scripts.push({
      id: ext.id,
      type: 'script',
      enabled: true,
      name: ext.name,
      content: ext.code,
      info: ext.description ?? '',
    });
  }
  return scripts;
}
