-- Finanças pessoais. Valores em centavos (bigint). Tudo é separado por usuário (user_id).

CREATE TABLE fin_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  kind                  text NOT NULL CHECK (kind IN ('checking', 'digital', 'savings', 'cash', 'credit_card')),
  institution           text NOT NULL DEFAULT '',
  number_enc            text,                       -- número da conta, criptografado (AES-256-GCM)
  number_last4          text,                       -- só para exibir mascarado (••••1234)
  initial_balance_cents bigint NOT NULL DEFAULT 0,  -- em cartão: dívida anterior (negativa)
  credit_limit_cents    bigint,
  closing_day           integer CHECK (closing_day BETWEEN 1 AND 31),
  due_day               integer CHECK (due_day BETWEEN 1 AND 31),
  invoice_remind_days   integer CHECK (invoice_remind_days BETWEEN 0 AND 30),
  invoice_remind_channels text[] NOT NULL DEFAULT '{}',
  source                text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'demo')),
  archived              boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fin_accounts_user ON fin_accounts (user_id);

CREATE TABLE fin_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  parent_id  uuid REFERENCES fin_categories(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('expense', 'income')),
  color      text NOT NULL DEFAULT '#7C6CF0',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_fin_categories ON fin_categories (user_id, kind, lower(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE fin_recurring (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description       text NOT NULL,
  amount_cents      bigint NOT NULL CHECK (amount_cents > 0),
  kind              text NOT NULL CHECK (kind IN ('expense', 'income')),
  category_id       uuid REFERENCES fin_categories(id) ON DELETE SET NULL,
  account_id        uuid REFERENCES fin_accounts(id) ON DELETE SET NULL,
  frequency         text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  next_due          date NOT NULL,
  active            boolean NOT NULL DEFAULT true,
  is_subscription   boolean NOT NULL DEFAULT false,
  usage             text CHECK (usage IN ('often', 'sometimes', 'rarely')),  -- informado por você; não há como medir o uso
  remind_days_before integer CHECK (remind_days_before BETWEEN 0 AND 30),
  remind_channels   text[] NOT NULL DEFAULT '{}',
  source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'demo')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fin_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id          uuid NOT NULL REFERENCES fin_accounts(id) ON DELETE CASCADE,
  kind                text NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
  amount_cents        bigint NOT NULL CHECK (amount_cents > 0),
  occurred_on         date NOT NULL,
  description         text NOT NULL DEFAULT '',
  merchant            text NOT NULL DEFAULT '',
  category_id         uuid REFERENCES fin_categories(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed')),
  transfer_account_id uuid REFERENCES fin_accounts(id) ON DELETE CASCADE,
  recurring_id        uuid REFERENCES fin_recurring(id) ON DELETE SET NULL,
  note                text NOT NULL DEFAULT '',
  link_activity_id    uuid REFERENCES activities(id) ON DELETE SET NULL,
  link_card_id        uuid REFERENCES cards(id) ON DELETE SET NULL,
  remind_days_before  integer CHECK (remind_days_before BETWEEN 0 AND 30),
  remind_channels     text[] NOT NULL DEFAULT '{}',
  document_id          uuid REFERENCES documents(id) ON DELETE SET NULL,
  source              text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'demo', 'receipt')),
  external_id         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'transfer' OR (transfer_account_id IS NOT NULL AND transfer_account_id <> account_id))
);
CREATE UNIQUE INDEX uq_fin_tx_external ON fin_transactions (user_id, account_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_fin_tx_user_date ON fin_transactions (user_id, occurred_on DESC);
CREATE INDEX idx_fin_tx_account ON fin_transactions (account_id);

CREATE TABLE fin_budgets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES fin_categories(id) ON DELETE CASCADE,  -- null = orçamento geral
  limit_cents bigint NOT NULL CHECK (limit_cents > 0),
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'demo')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_fin_budgets ON fin_budgets (user_id, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE fin_goals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  target_cents      bigint NOT NULL CHECK (target_cents > 0),
  current_cents     bigint NOT NULL DEFAULT 0,
  deadline          date,
  linked_account_id uuid REFERENCES fin_accounts(id) ON DELETE SET NULL,
  kanban_card_id    uuid REFERENCES cards(id) ON DELETE SET NULL,
  source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'demo')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Insights que o usuário ignorou ou silenciou.
CREATE TABLE fin_insight_states (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        text NOT NULL,
  state      text NOT NULL CHECK (state IN ('dismissed', 'muted')),
  until      date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
