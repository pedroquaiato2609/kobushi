// Vocabulário do método Ninshiki. Se o método evoluir, comece por aqui.

export const ACTIVITY_KINDS = ['obligation', 'goal', 'special'] as const; // obrigação | objetivo | objetivo especial (meditação)
export const TIME_MODES = ['fixed', 'period', 'free'] as const; // horário definido | período definido | horário livre
export const PERIODS = ['morning', 'afternoon', 'night'] as const;
export const LEVELS = ['min', 'ideal', 'max'] as const; // mínimo | ideal | máximo

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type TimeMode = (typeof TIME_MODES)[number];
export type Period = (typeof PERIODS)[number];
export type Level = (typeof LEVELS)[number];

export const PROVIDERS = ['anthropic', 'openai'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const STT_MODES = ['server', 'browser'] as const;
export type SttMode = (typeof STT_MODES)[number];

export const RESOURCES = ['activity', 'execution', 'event', 'board', 'card', 'review', 'meditation', 'reminder', 'document', 'profile', 'finance', 'assistant', 'agent', 'gym', 'reading', 'study'] as const;
export type Resource = (typeof RESOURCES)[number];

export const TOOL_ACTIONS = ['read', 'create', 'update', 'delete'] as const;
export type ToolAction = (typeof TOOL_ACTIONS)[number];

export const PERMISSION_MODES = ['allow', 'confirm', 'deny'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const NOTIFY_CHANNELS = ['push', 'whatsapp'] as const; // a caixa de entrada do app é sempre usada
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];
export const REPEATS = ['none', 'daily', 'weekly'] as const;
export type Repeat = (typeof REPEATS)[number];
export const PROFILE_LEVELS = ['general', 'private', 'secret'] as const; // geral | privado | secreto (senha)
export type ProfileLevel = (typeof PROFILE_LEVELS)[number];
export const DOC_KINDS = ['note', 'list', 'file'] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const PROACTIVITY = ['off', 'low', 'normal'] as const; // frequência das sugestões proativas
export type Proactivity = (typeof PROACTIVITY)[number];
export const SUGGESTION_TYPES = ['agenda', 'routine', 'review', 'finance'] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];
export const SEVERITIES = ['info', 'attention', 'high'] as const;
export type Severity = (typeof SEVERITIES)[number];
