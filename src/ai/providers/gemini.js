import { GoogleGenerativeAI } from '@google/generative-ai';
import { get } from '../config.js';

const DEFAULT_MODEL = 'gemini-2.5-pro';

export async function* stream(messages, systemPrompt, { model: modelId = DEFAULT_MODEL } = {}) {
  const key = get('gemini');
  if (!key) throw new Error('No Gemini API key stored. Run groundup dig to configure.');

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: systemPrompt,
  });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const last = messages[messages.length - 1]?.content ?? '';

  const chat = model.startChat({ history });
  const result = await chat.sendMessageStream(last);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}
