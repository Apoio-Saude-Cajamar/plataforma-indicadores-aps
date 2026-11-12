-- Painel APS: comunicados internos. O administrador escreve; os usuários veem um aviso no topo
-- das páginas até marcarem "Entendi". Não guarda dados de pacientes.
CREATE TABLE comunicado (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo         TEXT NOT NULL,
  texto          TEXT NOT NULL,
  nivel          TEXT NOT NULL DEFAULT 'info' CHECK (nivel IN ('info', 'importante')),
  publico        TEXT NOT NULL DEFAULT 'todos' CHECK (publico IN ('todos', 'admin', 'gestor', 'leitor')),
  inicio_em      TEXT,
  fim_em         TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_por     INTEGER,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL
);

CREATE TABLE comunicado_leitura (
  comunicado_id  INTEGER NOT NULL,
  usuario_id     INTEGER NOT NULL,
  lido_em        TEXT NOT NULL,
  PRIMARY KEY (comunicado_id, usuario_id)
);
