-- Painel APS: usuários, sessões e controle de tentativas de login.
-- As senhas são guardadas só como resumo PBKDF2-SHA256 com sal próprio.
-- As sessões guardam só o resumo SHA-256 do código do cookie.
-- Estas tabelas não entram no backup do Google Drive (ver README).

CREATE TABLE usuario (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  login          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome           TEXT NOT NULL,
  email          TEXT,
  perfil         TEXT NOT NULL DEFAULT 'leitor' CHECK (perfil IN ('admin', 'gestor', 'leitor')),
  unidade        TEXT,                       -- se preenchida, o usuário vê só esta unidade
  senha_hash     TEXT,                       -- base64; nulo = só entra pelo Apoio
  senha_sal      TEXT,
  senha_iter     INTEGER,
  trocar_senha   INTEGER NOT NULL DEFAULT 1, -- 1 = pede nova senha no próximo acesso
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL,
  ultimo_acesso  TEXT
);

CREATE TABLE sessao (
  token_hash  TEXT PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  origem      TEXT NOT NULL DEFAULT 'senha' CHECK (origem IN ('senha', 'apoio')),
  criada_em   TEXT NOT NULL,
  expira_em   TEXT NOT NULL,
  ip          TEXT,
  agente      TEXT
);
CREATE INDEX ix_sessao_usuario ON sessao (usuario_id);
CREATE INDEX ix_sessao_expira ON sessao (expira_em);

-- Tentativas de login malsucedidas por janela de 15 minutos (por login e por IP).
CREATE TABLE tentativa_login (
  chave   TEXT NOT NULL,     -- 'login:<login>' ou 'ip:<ip>'
  janela  TEXT NOT NULL,     -- início da janela (ISO, arredondado a 15 min)
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chave, janela)
);

-- Registro de ações administrativas (sem senhas).
CREATE TABLE registro_acesso (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  quando     TEXT NOT NULL,
  usuario_id INTEGER,
  acao       TEXT NOT NULL,
  detalhe    TEXT,
  ip         TEXT
);
