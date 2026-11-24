const { callModel } = require('../urus-gateway');

async function generateFactoryText(prompt, maxTokens) {
  const completion = await callModel({
    provider: 'deepseek',
    model: process.env.FACTORY_DEEPSEEK_MODEL || 'deepseek-flash',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.2,
    thinking: { type: 'disabled' },
    raw: true
  });
  const choice = completion.choices?.[0];
  const text = choice?.message?.content;
  if (choice?.finish_reason !== 'stop' || typeof text !== 'string' || !text.trim()) {
    throw new Error('DeepSeek no completó la generación de Factory: ' + (choice?.finish_reason || 'sin respuesta'));
  }
  return text.trim();
}

module.exports = { generateFactoryText };
