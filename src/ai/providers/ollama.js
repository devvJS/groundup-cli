const ENDPOINT = 'http://localhost:11434/api/chat';
const DEFAULT_MODEL = 'llama3';

export async function* stream(messages, systemPrompt, { model = DEFAULT_MODEL } = {}) {
  const body = {
    model,
    stream: true,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  };

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Cannot reach Ollama at ${ENDPOINT}. Is it running? (${err.message})`);
  }

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let json;
      try {
        json = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const text = json.message?.content;
      if (text) yield text;
      if (json.done) return;
    }
  }
}
