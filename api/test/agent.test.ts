// Loop completo do agente (com streaming) usando repositórios em memória e a API da Anthropic simulada.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { anthropicStream, type Block } from './helpers';

process.env.ANTHROPIC_API_KEY = 'test-key';
const { AgentOrchestrator } = await import('../src/agent/orchestrator');
const { PermissionPolicy } = await import('../src/agent/policy');
const { ToolRunner } = await import('../src/agent/runner');
import type { AgentEvent } from '../src/agent/orchestrator';
import type { AgentAction, AgentSettings, ConversationRepository, StoredMessage } from '../src/agent/ports';
import type { ToolDefinition } from '../src/agent/tools';

const settings: AgentSettings = {
  provider: 'anthropic', model: 'claude-test', customInstructions: '', tone: 'direto', language: 'pt-BR',
  includeRoutineContext: false, maxToolSteps: 5, sttMode: 'server', sttModel: 'whisper-1',
};

function fakes() {
  const messages: StoredMessage[] = [];
  const actions: AgentAction[] = [];
  const modes: Record<string, any> = {};
  const conversations = {
    get: async () => ({ id: 'c1', title: 'Nova conversa', createdAt: new Date(), updatedAt: new Date() }),
    rename: async () => {},
    addMessage: async (conversationId: string, m: any) => {
      const row = { id: `m${messages.length}`, conversationId, toolCalls: null, toolCallId: null, toolName: null, createdAt: new Date(), ...m };
      messages.push(row); return row;
    },
    listMessages: async () => [...messages],
  } as unknown as ConversationRepository;
  const actionRepo = {
    create: async (d: any) => { const a = { id: `x${actions.length}`, resolvedAt: null, createdAt: new Date(), ...d }; actions.push(a); return a; },
    get: async (id: string) => actions.find((a) => a.id === id) ?? null,
    resolve: async (id: string, status: any, result: any) => { const a = actions.find((x) => x.id === id)!; Object.assign(a, { status, result }); return a; },
  } as any;
  const ran: string[] = [];
  const tools: ToolDefinition[] = [
    { name: 'create_thing', resource: 'card', action: 'create', label: 'uma coisa', description: 'cria', schema: z.object({ title: z.string() }),
      run: async (a) => { ran.push(`create:${a.title}`); return { id: 'new' }; } },
    { name: 'delete_thing', resource: 'card', action: 'delete', label: 'uma coisa', description: 'apaga', schema: z.object({ id: z.string() }),
      run: async (a) => { ran.push(`delete:${a.id}`); return { deleted: true }; } },
    { name: 'get_profile_info', resource: 'profile', action: 'read', label: 'as informações pessoais', description: 'perfil', schema: z.object({}), run: async () => ({}) },
    { name: 'offer_options', resource: 'agent', action: 'read', label: 'opções', internal: true, description: 'botões',
      schema: z.object({ options: z.array(z.string()) }), run: async () => ({ shown: true }) },
  ];
  const policy = new PermissionPolicy({ all: async () => modes, setMany: async () => {} });
  const runner = new ToolRunner(tools, policy, actionRepo, () => ({ type: 'object', properties: {} })); // conversor injetado: o teste não depende da versão do zod
  const profile = { agentOverview: async () => ({ general: [{ title: 'Nome', content: 'Ana' }], protectedTitles: [] }) } as any;
  const orchestrator = new AgentOrchestrator(conversations, { get: async () => settings, update: async () => settings }, runner, policy, tools, { list: async () => [] } as any, { list: async () => [] } as any, profile);
  return { messages, actions, modes, ran, orchestrator };
}

/** Cada chamada ao modelo consome a próxima resposta da fila; guarda os corpos recebidos. */
function mockAnthropic(replies: Block[][]) {
  const bodies: any[] = [];
  (globalThis as any).fetch = async (_url: string, init: any) => {
    bodies.push(JSON.parse(init.body));
    return anthropicStream(replies.shift() ?? []);
  };
  return bodies;
}

test('streaming: texto chega em pedaços; tool permitida executa; exclusão fica pendente', async () => {
  const f = fakes();
  const bodies = mockAnthropic([
    [
      { type: 'text', text: 'Vou fazer.' },
      { type: 'tool_use', id: 't1', name: 'create_thing', input: { title: 'Ler' } },
      { type: 'tool_use', id: 't2', name: 'delete_thing', input: { id: '9' } },
    ],
    [{ type: 'text', text: 'Criei; a exclusão aguarda sua aprovação.' }],
  ]);

  const events: AgentEvent[] = [];
  const created = await f.orchestrator.handleUserMessage('c1', 'crie e apague', (e) => events.push(e));

  // vários pedaços de texto, não um bloco só
  const deltas = events.filter((e) => e.type === 'text');
  assert.ok(deltas.length > 3);
  assert.equal(deltas.map((d: any) => d.delta).join('').startsWith('Vou fazer.'), true);
  assert.deepEqual(events.filter((e) => e.type === 'step').length, 2);
  assert.deepEqual(events.filter((e) => e.type === 'tool_end').map((e: any) => e.status), ['ok', 'pending']);

  assert.deepEqual(created.map((m) => m.role), ['user', 'assistant', 'tool', 'tool', 'assistant']);
  assert.deepEqual(f.ran, ['create:Ler']); // delete_thing NÃO rodou
  assert.equal(f.actions.find((a) => a.tool === 'delete_thing')?.status, 'pending');

  // prompt inclui o perfil geral do usuário
  assert.match(bodies[0].system, /Nome: Ana/);
  // a segunda chamada recebeu os dois tool_result num único turno user
  const second = bodies[1].messages.at(-1);
  assert.equal(second.role, 'user');
  assert.deepEqual(second.content.map((b: any) => b.tool_use_id), ['t1', 't2']);

  // aprovar executa a ação e registra uma nota na conversa
  const approved = await f.orchestrator.approve(f.actions.find((a) => a.status === 'pending')!.id);
  assert.equal(approved.status, 'executed');
  assert.deepEqual(f.ran, ['create:Ler', 'delete:9']);
  assert.equal(f.messages.at(-1)?.role, 'note');
});

test('offer_options: botões são gravados e o turno termina sem nova chamada ao modelo', async () => {
  const f = fakes();
  const bodies = mockAnthropic([
    [
      { type: 'text', text: 'Quer que eu monte a lista?' },
      { type: 'tool_use', id: 'o1', name: 'offer_options', input: { options: ['Sim, monte', 'Agora não'] } },
    ],
  ]);
  const events: AgentEvent[] = [];
  const created = await f.orchestrator.handleUserMessage('c1', 'como faço bolo de chocolate?', (e) => events.push(e));

  assert.equal(bodies.length, 1); // uma única chamada
  assert.deepEqual(created.map((m) => m.role), ['user', 'assistant', 'tool']);
  assert.deepEqual((created[1].toolCalls as any[])[0].args.options, ['Sim, monte', 'Agora não']);
  assert.equal(events.some((e) => e.type === 'tool_start'), false); // ferramenta interna não aparece como ação
});

test('tool negada: não é oferecida ao modelo e, se chamada, é bloqueada e registrada', async () => {
  const f = fakes();
  f.modes.create_thing = 'deny';
  const bodies = mockAnthropic([
    [{ type: 'tool_use', id: 't1', name: 'create_thing', input: { title: 'X' } }],
    [{ type: 'text', text: 'Não tenho permissão.' }],
  ]);

  await f.orchestrator.handleUserMessage('c1', 'crie X');

  assert.deepEqual(bodies[0].tools.map((t: any) => t.name), ['delete_thing', 'get_profile_info', 'offer_options']); // create_thing escondida
  assert.deepEqual(f.ran, []);
  assert.equal(f.actions[0].status, 'denied');
});

test('argumentos inválidos voltam como erro para o modelo, sem executar', async () => {
  const f = fakes();
  mockAnthropic([
    [{ type: 'tool_use', id: 't1', name: 'create_thing', input: { title: 42 } }],
    [{ type: 'text', text: 'Corrigindo.' }],
  ]);
  const created = await f.orchestrator.handleUserMessage('c1', 'crie');
  assert.match(created[2].content, /Argumentos inválidos/);
  assert.deepEqual(f.ran, []);
});

test('resposta vazia depois de ferramentas não vira mensagem "(sem resposta)"', async () => {
  const f = fakes();
  mockAnthropic([[{ type: 'tool_use', id: 't1', name: 'create_thing', input: { title: 'A' } }], []]);
  const created = await f.orchestrator.handleUserMessage('c1', 'crie A');
  assert.deepEqual(created.map((m) => m.role), ['user', 'assistant', 'tool']);
});
