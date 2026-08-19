const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
export async function callClaudeJson({ system, user, maxTokens = 2000 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 설정되어 있지 않습니다. .env를 확인하세요.');
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Claude API 오류 (${res.status}): ${await res.text().catch(()=>'')}`);
  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  const raw = textBlock ? textBlock.text : '';
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
  try { return JSON.parse(cleaned); }
  catch (err) { throw new Error(`Claude 응답 JSON 파싱 실패: ${err.message}`); }
}
