-- Painel APS: chaves de coleta geradas pelo administrador (uma por computador).
-- Guarda só o hash SHA-256; a chave em texto aparece uma única vez, na tela do administrador.
CREATE TABLE chave_coleta (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  prefixo     TEXT NOT NULL,
  hash        TEXT NOT NULL UNIQUE,
  criada_por  INTEGER,
  criada_em   TEXT NOT NULL,
  expira_em   TEXT,
  ultimo_uso  TEXT,
  revogada_em TEXT
);
