import OpenAI from 'openai';
import { get } from '../config.js';

const DEFAULT_MODEL = 'gpt-4o';

export async function* stream(messages, systemPrompt, { model = DEFAULT_MODEL } = {}) {
  const key = get('openai');
  if (!key) throw new Error('No OpenAI API key stored. Run groundup dig to configure.');

  const client = new OpenAI({ apiKey: key });
  const response = await client.chat.completions.create({
    model,
    stream: true,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  });

  for await (const chunk of response) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}
