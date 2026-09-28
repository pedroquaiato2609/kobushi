import { z } from 'zod';

/** zod -> JSON Schema (formato esperado por Anthropic e OpenAI). */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = (z as any).toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/**
 * Remove do schema o que só gasta tokens: expressões regulares longas (o servidor valida de qualquer forma e as
 * descrições já dizem o formato) e additionalProperties. Cada chamada ao modelo reenvia todos os schemas.
 */
export function compactSchema<T>(node: T): T {
  if (Array.isArray(node)) return node.map(compactSchema) as unknown as T;
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'pattern' || k === 'additionalProperties') continue;
      out[k] = compactSchema(v);
    }
    return out as T;
  }
  return node;
}

export function formatIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues.map((i) => `${i.path.map(String).join('.') || 'args'}: ${i.message}`).join('; ');
}
