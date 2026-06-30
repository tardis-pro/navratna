import { describe, expect, it } from 'vitest';

import { mockLLMSuccess } from './mock_http';

describe('mock_http helpers', () => {
  it('stubs fetch with an OpenAI-compatible success payload', async () => {
    const fetchMock = mockLLMSuccess('hello from test', 'gpt-4o-mini');

    expect(fetchMock).toHaveBeenCalledTimes(0);

    const response = await fetch('https://example.test/v1/chat/completions');
    const body = await response.json() as {
      model: string;
      choices: Array<{ message: { content: string } }>;
    };

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.ok).toBe(true);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.choices[0]?.message.content).toBe('hello from test');
  });
});
