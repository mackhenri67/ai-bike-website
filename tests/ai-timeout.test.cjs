const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function compile(path, imports = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports,
    require: id => { if (id in imports) return imports[id]; throw Error(id); },
    AbortController, AbortSignal, setTimeout, clearTimeout, Date, Map, Set, URL,
    process: { env: { GEMINI_API_KEY: 'test-only' } }, console: { error() {} }
  }, { filename: path });
  return module.exports;
}
const deadline = compile('lib/ai-request-deadline.ts');
function route({ user = async () => ({ id: 'test' }), catalogue, generate } = {}) {
  let calls = 0;
  const steps = [{ stepNumber: 1, name: 'Frame', products: [{ id: 'frame', stock: 1, price: 500 }] }];
  return compile('app/api/bike-recommendation/route.ts', {
    '@/lib/ai-request-deadline': { ...deadline,
      withAiDeadline: work => deadline.withAiDeadline(work, 100) },
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '@/lib/supabase/server': { getUser: user },
    '@/lib/data/customer/bike-builder': { getBikeBuilderSteps: async () => ({ data: catalogue ? catalogue(++calls) : steps }) },
    '@google/genai': { GoogleGenAI: class {
      interactions = { create: generate || (async () => ({ output_text: JSON.stringify({ status: 'ok', explanation: 'Suitable', selections: [{ stepNumber: 1, productId: 'frame', reason: 'Fits request' }] }) })) };
    } }
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
test('generation uses bounded timeout, no retries, and current catalogue prices', async () => {
  const result = await route({ generate: async (params, options) => {
    assert.equal(options.retries.strategy, 'none');
    assert.ok(options.timeout_ms > 0 && options.timeout_ms <= 40000);
    assert.equal(params.generation_config.thinking_level, 'low');
    assert.ok(options.signal instanceof AbortSignal);
    return { output_text: JSON.stringify({ status: 'ok', explanation: 'Suitable', selections: [{ stepNumber: 1, productId: 'frame', reason: 'Fits request' }] }) };
  } }).POST(request());
  assert.equal(result.status, 200); assert.equal(result.body.total, 500);
});
test('SDK timeout returns structured timeout', async () => {
  const result = await route({ generate: async () => { const error = new Error(); error.name = 'RequestTimeoutError'; throw error; } }).POST(request());
  assert.equal(result.status, 504); assert.equal(result.body.code, 'AI_TIMEOUT');
});
test('authentication is still required', async () => {
  assert.equal((await route({ user: async () => null }).POST(request())).status, 401);
});
test('stock disappearing during generation is rejected', async () => {
  const result = await route({ catalogue: count => [{ stepNumber: 1, name: 'Frame', products: [{ id: 'frame', stock: count === 1 ? 1 : 0, price: 500 }] }] }).POST(request());
  assert.equal(result.status, 502);
});
