-- Open Finance (somente leitura). Nenhuma senha bancária passa por aqui: o consentimento e a autenticação acontecem no provedor/instituição.

CREATE TABLE of_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider           text NOT NULL,
  institution        text NOT NULL DEFAULT '',
  item_enc           text NOT NULL,   -- identificador da conexão no provedor, criptografado (AES-256-GCM)
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'updating', 'error', 'needs_reconnect', 'expired', 'revoked')),
  consent_granted_at timestamptz NOT NULL DEFAULT now(),
  consent_expires_at timestamptz,
  last_sync_at       timestamptz,
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz
);
CREATE INDEX idx_of_connections_user ON of_connections (user_id);

ALTER TABLE fin_accounts
  ADD COLUMN connection_id          uuid REFERENCES of_connections(id) ON DELETE SET NULL,
  ADD COLUMN external_id            text,
  ADD COLUMN provider_balance_cents bigint,       -- saldo informado pela instituição na última atualização
  ADD COLUMN provider_balance_at    timestamptz;
CREATE UNIQUE INDEX uq_fin_accounts_external ON fin_accounts (user_id, connection_id, external_id) WHERE external_id IS NOT NULL;

-- Registro de tudo o que já foi importado. Se você apagar uma movimentação importada, ela continua "vista" e NÃO volta na próxima atualização.
CREATE TABLE of_seen (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id  uuid NOT NULL REFERENCES fin_accounts(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  tx_id       uuid REFERENCES fin_transactions(id) ON DELETE SET NULL,
  PRIMARY KEY (account_id, external_id)
);
