const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function compile(path, imports = {}, fetchMock) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports,
    require: id => { if (id in imports) return imports[id]; throw Error(id); },
    Buffer, fetch: fetchMock, AbortController, AbortSignal, setTimeout, clearTimeout, Date, Map, Set, URL,
    process: { env: { GROQ_API_KEY: 'test-only' } }, console: { error() {} }
  }, { filename: path });
  return module.exports;
}
const deadline = compile('lib/ai-request-deadline.ts');
function route({ user = async () => ({ id: 'test' }), catalogue, generate } = {}) {
  let calls = 0;
  const steps = [{ stepNumber: 1, name: 'Frame', products: [{ id: 'frame', name: 'Frame', stock: 1, price: 500 }] }];
  return compile('app/api/bike-recommendation/route.ts', {
    '@/lib/ai-catalogue': compile('lib/ai-catalogue.ts'),
    '@/lib/ai-request-deadline': { ...deadline,
      withAiDeadline: work => deadline.withAiDeadline(work, 100) },
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '@/lib/supabase/server': { getUser: user },
    '@/lib/data/customer/bike-builder': { getBikeBuilderSteps: async () => ({ data: catalogue ? catalogue(++calls) : steps }) },
  }, async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    if (generate) return generate(JSON.parse(options.body), options);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ status: 'ok', explanation: 'Suitable', selections: [{ stepNumber: 1, productId: 'frame', reason: 'Fits request' }] }) } }] }) };
  });
}
function request() { return new Request('https://example.test/api/bike-recommendation', { method: 'POST', body: JSON.stringify({ prompt: 'Road bicycle', budget: 1000 }) }); }
test('deadline aborts hung work and returns a typed error', async () => {
  let signal;
  await assert.rejects(deadline.withAiDeadline(s => { signal = s; return new Promise(() => {}); }, 15), { name: 'AiDeadlineError' });
  assert.equal(signal.aborted, true);
});
test('successful work returns before deadline', async () => {
  assert.equal(await deadline.withAiDeadline(async () => 42, 20), 42);
});
test('hung authentication returns structured timeout', async () => {
  const result = await route({ user: () => new Promise(() => {}) }).POST(request());
  assert.equal(result.status, 504); assert.equal(result.body.code, 'AI_TIMEOUT');
});
test('Groq request uses strict schema and database prices', async () => {
  const result = await route({ generate: async (params, options) => {
    assert.equal(params.model, 'openai/gpt-oss-20b');
    assert.equal(params.response_format.json_schema.strict, true);
    assert.equal(params.reasoning_effort, 'low');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(JSON.parse(params.messages[1].content).catalogue[0].products[0].id, 'frame');
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ status: 'ok', explanation: 'Suitable', selections: [{ stepNumber: 1, productId: 'frame', reason: 'Fits request' }] }) } }] }) };
  } }).POST(request());
  assert.equal(result.status, 200); assert.equal(result.body.total, 500);
});
test('Groq timeout returns structured timeout', async () => {
  const result = await route({ generate: async () => { const error = new Error(); error.name = 'TimeoutError'; throw error; } }).POST(request());
  assert.equal(result.status, 504); assert.equal(result.body.code, 'AI_TIMEOUT');
});
for (const [upstream, expected, code] of [[401, 503, 'AI_CREDENTIALS_INVALID'], [429, 429, undefined], [400, 503, 'AI_MODEL_OR_REQUEST_INVALID']]) {
  test(`Groq ${upstream} returns safe error without retries`, async () => {
    let calls = 0;
    const result = await route({ generate: async () => { calls++; return { ok: false, status: upstream }; } }).POST(request());
    assert.equal(result.status, expected); assert.equal(calls, 1);
    if (code) assert.equal(result.body.code, code);
    assert.ok(!JSON.stringify(result).includes('test-only'));
  });
}
test('malformed provider content is rejected', async () => {
  const result = await route({ generate: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'bad JSON' } }] }) }) }).POST(request());
  assert.equal(result.status, 502);
});
test('authentication is still required', async () => {
  assert.equal((await route({ user: async () => null }).POST(request())).status, 401);
});
test('stock disappearing during generation is rejected', async () => {
  const result = await route({ catalogue: count => [{ stepNumber: 1, name: 'Frame', products: [{ id: 'frame', name: 'Frame', stock: count === 1 ? 1 : 0, price: 500 }] }] }).POST(request());
  assert.equal(result.status, 502);
});

test('oversized upstream request returns a useful size error', async () => {
  const result = await route({ generate: async () => ({ ok: false, status: 413 }) }).POST(request());
  assert.equal(result.status, 503); assert.equal(result.body.code, 'AI_REQUEST_TOO_LARGE');
});
test('large catalogue stays bounded with every step and cheapest options retained', () => {
  const { compactAiCatalogue } = compile('lib/ai-catalogue.ts');
  const steps = Array.from({ length: 18 }, (_, i) => ({ stepNumber: i + 1, name: `Category ${i}`, products: Array.from({ length: 100 }, (_, j) => ({ id: `product-${i}-${j}`, name: `Road part ${j}`, price: j + 10, stock: 1, specs: { material: 'alloy '.repeat(400) }, description: 'text '.repeat(1000) })) }));
  const before = JSON.stringify(steps);
  const catalogue = compactAiCatalogue(steps, 'Road riding');
  assert.equal(catalogue.length, 18);
  assert.ok(Buffer.byteLength(JSON.stringify(catalogue), 'utf8') <= 8000);
  assert.equal(JSON.stringify(steps), before);
  for (let i = 0; i < 18; i++) {
    assert.ok(catalogue[i].products.some(p => p.id === `product-${i}-0`));
    for (const p of catalogue[i].products) assert.ok(steps[i].products.some(original => original.id === p.id));
  }
});
test('impossibly small payload budget declines instead of omitting steps', () => {
  const { compactAiCatalogue } = compile('lib/ai-catalogue.ts');
  assert.equal(compactAiCatalogue([{ stepNumber: 1, name: 'Frame', products: [{ id: 'x', name: 'Frame', price: 10 }] }], 'road', 1), null);
});
