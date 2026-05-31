import { describe, it, expect } from 'vitest';
import { extensionsToScripts } from './extension-runtime';
import type { Extension } from '../types';

function ext(p: Partial<Extension>): Extension {
  return { id: 'e1', name: 'X', version: '0.1.0', author: 'a', description: 'd', enabled: true, entryPoint: '', ...p };
}

describe('extensionsToScripts — 扩展→TH 脚本桥接', () => {
  it('空数组返回空', () => {
    expect(extensionsToScripts([])).toEqual([]);
  });

  it('启用且有 code 的扩展转成 THScript 形状', () => {
    const out = extensionsToScripts([ext({ id: 'a', name: 'Greet', code: 'function onSend(t){return t}' })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'a', type: 'script', enabled: true, name: 'Greet',
      content: 'function onSend(t){return t}',
    });
  });

  it('禁用的扩展被跳过', () => {
    expect(extensionsToScripts([ext({ enabled: false, code: 'x' })])).toHaveLength(0);
  });

  it('无 code / 空白 code 的扩展被跳过', () => {
    expect(extensionsToScripts([ext({ code: '' }), ext({ code: '   ' }), ext({})])).toHaveLength(0);
  });

  it('description 映射到 info', () => {
    const out = extensionsToScripts([ext({ code: 'x', description: '说明' })]);
    expect(out[0]).toMatchObject({ info: '说明' });
  });
});
