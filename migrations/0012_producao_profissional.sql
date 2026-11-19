-- Painel APS: produção por profissional (relatório "Produção e notas"). A tabela também se cria sozinha no primeiro uso
-- (api/producao.js); esta migração só garante que um banco novo, montado pelas migrações, a tenha desde o início.
CREATE TABLE IF NOT EXISTS producao_profissional (
  competencia TEXT NOT NULL, unidade TEXT NOT NULL, equipe TEXT NOT NULL DEFAULT '', ine TEXT NOT NULL DEFAULT '',
  cbo TEXT NOT NULL, cbo_nome TEXT, nome TEXT NOT NULL,
  individuais INTEGER NOT NULL DEFAULT 0, compartilhados INTEGER NOT NULL DEFAULT 0, por_tipo TEXT,
  coletivas_responsavel INTEGER NOT NULL DEFAULT 0, coletivas_envolvido INTEGER NOT NULL DEFAULT 0, participacoes INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (competencia, unidade, equipe, cbo, nome));
