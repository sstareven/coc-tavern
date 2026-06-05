import { describe, it, expect } from 'vitest';
import { isResponseFormatUnsupported } from '../subagent-call';

describe('isResponseFormatUnsupported — 识别 response_format 不被支持的错误', () => {
  it('明确提示 response_format 不被支持 → true', () => {
    expect(isResponseFormatUnsupported(
      400,
      '{"error":{"message":"\'response_format\' of type \'json_object\' is not supported with this model"}}',
    )).toBe(true);
  });

  it('OpenAI 风格 Invalid parameter response_format → true', () => {
    expect(isResponseFormatUnsupported(
      400,
      '{"error":{"message":"Invalid parameter: response_format","type":"invalid_request_error"}}',
    )).toBe(true);
  });

  it('json_object 模式不支持 → true', () => {
    expect(isResponseFormatUnsupported(
      422,
      'Unsupported response format type: json_object',
    )).toBe(true);
  });

  it('does not support 措辞 → true', () => {
    expect(isResponseFormatUnsupported(
      400,
      'This model does not support response_format=json_object',
    )).toBe(true);
  });

  it('普通 401 鉴权错误 → false（不是 response_format 问题）', () => {
    expect(isResponseFormatUnsupported(
      401,
      '{"error":{"message":"Invalid API key"}}',
    )).toBe(false);
  });

  it('普通 429 限流 → false', () => {
    expect(isResponseFormatUnsupported(
      429,
      'Rate limit exceeded',
    )).toBe(false);
  });

  it('500 服务端错误且无 response_format 字样 → false（真正服务端 bug，不该 fallback）', () => {
    expect(isResponseFormatUnsupported(
      500,
      'Internal server error',
    )).toBe(false);
  });

  it('200 OK → false（成功响应根本不该走 fallback 判定）', () => {
    expect(isResponseFormatUnsupported(
      200,
      '{"choices":[{}]}',
    )).toBe(false);
  });

  it('400 但错误文本与 response_format 无关 → false（不要误判）', () => {
    expect(isResponseFormatUnsupported(
      400,
      '{"error":{"message":"max_tokens must be a positive integer"}}',
    )).toBe(false);
  });
});
