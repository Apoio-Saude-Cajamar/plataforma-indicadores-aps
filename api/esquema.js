// Estrutura do banco conhecida pela API. Mantenha em sincronia com migrations/.
export const VERSAO_API = '0.1.0';
export const VERSAO_ESQUEMA = 1;

// Colunas de cada tabela, na ordem usada no backup e na restauração.
// A ordem das tabelas também é a ordem de restauração.
export const TABELAS = {
  meta: ['chave', 'valor'],
  coleta: ['id', 'competencia', 'tipo', 'versao_extensao', 'iniciado_em', 'concluido_em', 'status', 'config', 'recebido_em'],
  etapa: ['coleta_id', 'chave', 'competencia', 'bloco', 'unidade', 'unidade_cnes', 'equipe', 'ine', 'tipo_equipe',
          'status', 'tentativas', 'erro', 'coletado_em', 'recebido_em'],
  indicador_equipe: ['coleta_id', 'etapa_chave', 'competencia', 'codigo', 'recorte', 'unidade', 'unidade_cnes', 'equipe', 'ine',
                     'tipo_equipe', 'numerador', 'denominador', 'soma_pontos', 'valor', 'excluidos', 'itens', 'extras'],
  cubo_atendimento: ['coleta_id', 'etapa_chave', 'competencia', 'unidade', 'equipe', 'cbo', 'cbo_codigo', 'grupo_cbo', 'tipo_atendimento', 'n'],
  cubo_falta: ['coleta_id', 'etapa_chave', 'competencia', 'unidade', 'equipe', 'cbo', 'cbo_codigo', 'grupo_cbo', 'tipo_falta', 'n'],
  cubo_escuta: ['coleta_id', 'etapa_chave', 'competencia', 'unidade', 'ine', 'equipe', 'categoria', 'escuta', 'periodo_ok'],
  aviso: ['coleta_id', 'etapa_chave', 'competencia', 'mensagem', 'criado_em']
};

// Tabelas de dados de uma etapa (apagadas e regravadas a cada novo envio da mesma etapa).
export const TABELAS_DA_ETAPA = ['indicador_equipe', 'cubo_atendimento', 'cubo_falta', 'cubo_escuta', 'aviso'];

// Como cada lista enviada pela extensão (campos em camelCase) vira colunas no banco.
// Os valores são caminhos dentro de cada item do JSON enviado.
export const MAPA_ENVIO = {
  linhas: {
    tabela: 'indicador_equipe',
    campos: {
      codigo: '$.codigo', recorte: '$.recorte', unidade: '$.unidade', unidade_cnes: '$.unidadeCnes', equipe: '$.equipe',
      ine: '$.ine', tipo_equipe: '$.tipoEquipe', numerador: '$.numerador', denominador: '$.denominador',
      soma_pontos: '$.somaPontos', valor: '$.valor', excluidos: '$.excluidos', itens: '$.itens', extras: '$.extras'
    }
  },
  atendimentos: {
    tabela: 'cubo_atendimento',
    campos: {
      unidade: '$.unidade', equipe: '$.equipe', cbo: '$.cbo', cbo_codigo: '$.cboCodigo', grupo_cbo: '$.grupoCBO',
      tipo_atendimento: '$.tipoAtendimento', n: '$.n'
    }
  },
  absenteismo: {
    tabela: 'cubo_falta',
    campos: {
      unidade: '$.unidade', equipe: '$.equipe', cbo: '$.cbo', cbo_codigo: '$.cboCodigo', grupo_cbo: '$.grupoCBO',
      tipo_falta: '$.tipoFalta', n: '$.n'
    }
  },
  escuta: {
    tabela: 'cubo_escuta',
    campos: {
      unidade: '$.unidade', ine: '$.ine', equipe: '$.equipe', categoria: '$.categoria', escuta: '$.escuta', periodo_ok: '$.periodoOk'
    }
  }
};

// Campos conhecidos de uma linha de indicador; os demais vão para "extras".
export const CAMPOS_LINHA = new Set(['codigo', 'recorte', 'unidade', 'unidadeCnes', 'equipe', 'ine', 'tipoEquipe',
  'numerador', 'denominador', 'somaPontos', 'valor', 'excluidos', 'itens', 'extras']);
