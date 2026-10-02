-- Tokens de push do app mobile (Expo Push Notifications). Igual a push_subscriptions (Web Push), mas
-- só uma string de token em vez de endpoint+chaves — formatos diferentes, canais diferentes de envio.
CREATE TABLE expo_push_tokens (
  token      text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
