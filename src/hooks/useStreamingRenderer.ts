import { useState, useCallback } from 'react';
import { useTavernHelperStore } from '../stores/useTavernHelperStore';

/** Hook: returns { streamingText, isStreaming, startStream, endStream } */
export function useStreamingRenderer() {
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const enabled = useTavernHelperStore((s) => s.render.allowStreamRender);

  const onToken = useCallback((token: string) => {
    setStreamingText((prev) => prev + token);
  }, []);

  const startStream = useCallback(() => {
    if (!enabled) return;
    setStreamingText('');
    setIsStreaming(true);
  }, [enabled]);

  const endStream = useCallback(() => {
    setIsStreaming(false);
  }, []);

  return { streamingText, isStreaming, onToken, startStream, endStream, enabled };
}
