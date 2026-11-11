-- Painel APS: composição das equipes (unidade → equipe → profissionais), enviada pela extensão.
-- Um documento JSON por competência; vale o último recebido.
-- Não entra no backup do Drive: a extensão recoleta a cada mês.
CREATE TABLE composicao (
  competencia  TEXT PRIMARY KEY CHECK (competencia GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  coletado_em  TEXT NOT NULL,
  recebido_em  TEXT NOT NULL,
  dados        TEXT NOT NULL
);
