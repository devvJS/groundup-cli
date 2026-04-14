import Anthropic from '@anthropic-ai/sdk';
import { get } from '../config.js';

const MODEL = 'claude-opus-4-5';

export async function* stream(messages, systemPrompt) {
  const key = get('claude');
  if (!key) throw new Error('No Claude API key stored. Run groundup dig to configure.');

  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  for await (const event of response) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}
