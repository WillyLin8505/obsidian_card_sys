import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';
const MAX_CONTEXT_CHARS = 8000;

function buildContext(chunks) {
  let context = '';
  for (const chunk of chunks) {
    const block = `--- ${chunk.notePath} ---\n${chunk.content}\n\n`;
    if ((context + block).length > MAX_CONTEXT_CHARS) break;
    context += block;
  }
  return context.trim();
}

export async function formatAnswer(question, chunks, apiKey) {
  const client = new Anthropic({ apiKey });

  const context = buildContext(chunks);

  if (!context) {
    return {
      answer: '在您的 Obsidian Vault 中找不到相關筆記。',
      tokensUsed: 0,
      model: MODEL,
    };
  }

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: '你是使用者的個人知識助理。根據以下筆記片段，用繁體中文回答使用者的問題。回答要具體、清楚，並指出資訊來自哪些筆記。如果筆記中沒有足夠資訊，請誠實說明。',
    messages: [
      {
        role: 'user',
        content: `以下是從我的 Obsidian 筆記庫找到的相關片段：\n\n${context}\n\n我的問題：${question}`,
      },
    ],
  });

  const answer = message.content[0]?.type === 'text' ? message.content[0].text : '無法生成回答';
  const tokensUsed = message.usage?.input_tokens + message.usage?.output_tokens || 0;

  return { answer, tokensUsed, model: MODEL };
}
