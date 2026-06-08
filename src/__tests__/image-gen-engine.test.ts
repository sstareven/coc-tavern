import { describe, it, expect } from 'vitest';
import { detectPayloadMode, mapToOpenAiSize, parseChatCompletionsImage } from '../api/image-gen-engine';

describe('detectPayloadMode', () => {
  it('OpenAI 官方 URL → openai-strict', () => {
    expect(detectPayloadMode('https://api.openai.com/v1', 'dall-e-3')).toBe('openai-strict');
    expect(detectPayloadMode('https://api.openai.com', 'dall-e-2')).toBe('openai-strict');
  });

  it('model 是 gpt-image* → gpt-image-1(无论 URL)', () => {
    expect(detectPayloadMode('https://random.com/v1', 'gpt-image-1')).toBe('gpt-image-1');
    expect(detectPayloadMode('https://relay.com', 'gpt-image-2')).toBe('gpt-image-1');
  });

  it('model dall-e* 即便不在 openai.com → openai-strict(中转 DALL-E)', () => {
    expect(detectPayloadMode('https://onehub.relay.com/v1', 'dall-e-3')).toBe('openai-strict');
  });

  it('URL 含 pollinations → pollinations', () => {
    expect(detectPayloadMode('https://image.pollinations.ai', 'flux')).toBe('pollinations');
  });

  it('其他全部走 sd-compat 默认(保留老行为)', () => {
    expect(detectPayloadMode('https://api.deepseek.com/v1', 'random-sd')).toBe('sd-compat');
    expect(detectPayloadMode('https://volcengine-ark.com', 'doubao-seedream-3-0')).toBe('sd-compat');
    expect(detectPayloadMode('https://siliconflow.cn', 'flux-dev')).toBe('sd-compat');
    expect(detectPayloadMode('http://127.0.0.1:7860', 'sd_xl')).toBe('sd-compat');
  });

  it('空字符串安全', () => {
    expect(detectPayloadMode('', '')).toBe('sd-compat');
  });

  describe('chat-completions 探测', () => {
    it('"假流式-gemini-3-pro-image" → chat-completions', () => {
      expect(detectPayloadMode('https://api.test.icu/v1', '假流式-gemini-3-pro-image')).toBe('chat-completions');
    });
    it('nano-banana 系 → chat-completions', () => {
      expect(detectPayloadMode('https://relay.com/v1', 'nano-banana-2024')).toBe('chat-completions');
    });
    it('gemini-2.5-flash-image-preview → chat-completions', () => {
      expect(detectPayloadMode('https://api.test.com/v1', 'gemini-2.5-flash-image-preview')).toBe('chat-completions');
    });
    it('URL 明确含 /chat/completions → chat-completions', () => {
      expect(detectPayloadMode('https://api.test.com/v1/chat/completions', 'whatever-model')).toBe('chat-completions');
    });
    it('普通 gemini(不含 image) → 不走 chat-completions(回退 sd-compat)', () => {
      expect(detectPayloadMode('https://api.test.com/v1', 'gemini-2.5-pro')).toBe('sd-compat');
    });
  });
});

describe('mapToOpenAiSize', () => {
  it('832×224(横幅 3.71:1)→ 1792×1024', () => {
    expect(mapToOpenAiSize(832, 224)).toBe('1792x1024');
  });
  it('1024×1024(方) → 1024×1024', () => {
    expect(mapToOpenAiSize(1024, 1024)).toBe('1024x1024');
  });
  it('竖幅 → 1024×1792', () => {
    expect(mapToOpenAiSize(512, 1024)).toBe('1024x1792');
    expect(mapToOpenAiSize(800, 1200)).toBe('1024x1792');
  });
  it('接近方形 → 1024×1024', () => {
    expect(mapToOpenAiSize(900, 1000)).toBe('1024x1024');
    expect(mapToOpenAiSize(1100, 1000)).toBe('1024x1024');
  });
  it('极端宽幅 → 1792×1024', () => {
    expect(mapToOpenAiSize(2048, 512)).toBe('1792x1024');
  });
  it('非法输入 → 1024×1024 兜底', () => {
    expect(mapToOpenAiSize(0, 0)).toBe('1024x1024');
    expect(mapToOpenAiSize(-1, 100)).toBe('1024x1024');
  });
});

describe('parseChatCompletionsImage', () => {
  it('markdown ![](https://...) → url', () => {
    const c = '这是生成的图: ![cat](https://cdn.x.com/cat.png) 满意吗?';
    expect(parseChatCompletionsImage(c)).toEqual({ url: 'https://cdn.x.com/cat.png' });
  });

  it('markdown ![](data:image/png;base64,xxx) → b64Data 已剥 prefix', () => {
    const c = '![img](data:image/png;base64,iVBORw0KGgoAAA==)';
    expect(parseChatCompletionsImage(c)).toEqual({ b64Data: 'iVBORw0KGgoAAA==' });
  });

  it('裸 data URL → b64Data', () => {
    const c = 'here is your image: data:image/jpeg;base64,/9j/4AAQSkZJRg== done';
    expect(parseChatCompletionsImage(c)).toEqual({ b64Data: '/9j/4AAQSkZJRg==' });
  });

  it('裸 https png → url', () => {
    const c = 'image link: https://example.com/img/abc.png?token=xyz';
    expect(parseChatCompletionsImage(c)).toEqual({ url: 'https://example.com/img/abc.png?token=xyz' });
  });

  it('multimodal 数组 image_url(string) → url', () => {
    const c = [
      { type: 'text', text: 'here is' },
      { type: 'image_url', image_url: 'https://cdn.x/y.jpg' },
    ];
    expect(parseChatCompletionsImage(c)).toEqual({ url: 'https://cdn.x/y.jpg' });
  });

  it('multimodal 数组 image_url{url:...} → url', () => {
    const c = [
      { type: 'image_url', image_url: { url: 'https://cdn.x/z.png' } },
    ];
    expect(parseChatCompletionsImage(c)).toEqual({ url: 'https://cdn.x/z.png' });
  });

  it('multimodal 数组 image_url{url: dataURL} → b64Data', () => {
    const c = [
      { type: 'image_url', image_url: { url: 'data:image/webp;base64,AAAA' } },
    ];
    expect(parseChatCompletionsImage(c)).toEqual({ b64Data: 'AAAA' });
  });

  it('Gemini multimodal inline_data → b64Data', () => {
    const c = [
      { type: 'text', text: 'done' },
      { type: 'image', inline_data: { mime_type: 'image/png', data: 'A'.repeat(200) } },
    ];
    expect(parseChatCompletionsImage(c)).toEqual({ b64Data: 'A'.repeat(200) });
  });

  it('裸长 base64(>=1000 字符 无 prefix)→ b64Data', () => {
    const c = 'iVBORw0KGgo' + 'A'.repeat(1500);
    expect(parseChatCompletionsImage(c)).toEqual({ b64Data: 'iVBORw0KGgo' + 'A'.repeat(1500) });
  });

  it('提不出图返回 null', () => {
    expect(parseChatCompletionsImage('just plain text no image')).toBeNull();
    expect(parseChatCompletionsImage('')).toBeNull();
    expect(parseChatCompletionsImage(null)).toBeNull();
    expect(parseChatCompletionsImage(undefined)).toBeNull();
  });

  it('裸 base64 但 <1000 字符 → null(避免短文本误判)', () => {
    expect(parseChatCompletionsImage('iVBORw0KGgoAAA==')).toBeNull();
  });

  it('Anthropic 风格 source.data → b64Data', () => {
    const c = [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'B'.repeat(200) } },
    ];
    expect(parseChatCompletionsImage(c)).toEqual({ b64Data: 'B'.repeat(200) });
  });
});

