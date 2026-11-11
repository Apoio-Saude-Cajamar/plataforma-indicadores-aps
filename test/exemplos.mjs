// Dados de exemplo no formato que a extensão envia (somente totais, nenhum dado de paciente).
export const U = 'UBS Dra Izabel Gratieri';

export function cuboAtendimentos(qtd = 3) {
  const tipos = ['Consulta agendada', 'Consulta no dia', 'Consulta agendada programada / Cuidado continuado', 'Atendimento de urgência'];
  return Array.from({ length: qtd }, (_, i) => ({
    unidade: U, equipe: `EQUIPE ${i % 7}`, cbo: 'MÉDICO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA - 225142', cboCodigo: '225142',
    grupoCBO: 'medicos', tipoAtendimento: tipos[i % tipos.length], n: 10 + i
  }));
}

export const absenteismo = [
  { unidade: U, equipe: 'EQUIPE PANORAMA', cbo: 'MÉDICO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA - 225142', cboCodigo: '225142', grupoCBO: 'medicos', tipoFalta: 'NÃO COMPARECEU', n: 90 },
  { unidade: U, equipe: 'EQUIPE PANORAMA', cbo: 'ENFERMEIRO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA - 223565', cboCodigo: '223565', grupoCBO: 'enfermeiros', tipoFalta: 'NÃO AGUARDOU', n: 10 }
];

export const linhasGestantes = [
  { codigo: 'C3', unidade: U, unidadeCnes: '2045678', equipe: 'EQUIPE PANORAMA', ine: '0002104741', tipoEquipe: 'ESF',
    denominador: 38, somaPontos: 1227, excluidos: 17, itens: { A: 30, B: 22, C: 18 }, puerperasPor294: 4 },
  { codigo: 'C3', recorte: 'desfecho', unidade: U, equipe: 'EQUIPE PANORAMA', ine: '0002104741', tipoEquipe: 'ESF',
    denominador: 6, somaPontos: 410 },
  { codigo: 'S3', unidade: U, equipe: 'EQUIPE PANORAMA', ine: '0002104741', tipoEquipe: 'ESF', numerador: 12, denominador: 38 }
];

export const linhasIdosos = (den) => [
  { codigo: 'C6', unidade: U, equipe: 'EQUIPE PANORAMA', ine: '0002104741', tipoEquipe: 'ESF', denominador: den, somaPontos: den * 60 }
];

export const escuta = [
  { unidade: U, ine: '0002104741', equipe: 'EQUIPE PANORAMA', categoria: 'ENFERMEIRO', escuta: 20, tipos: {}, periodoOk: true },
  { unidade: U, ine: '0002104741', equipe: 'EQUIPE PANORAMA', categoria: 'MÉDICO', escuta: 2, tipos: {}, periodoOk: false }
];

// Coleta típica de uma competência, com uma falha (lista de idosos) a ser refeita depois.
export async function semear(chamar) {
  await chamar('POST', '/coletas', { id: 'col-2026-10-a', competencia: '2026-10', tipo: 'completa', versaoExtensao: '0.4.0',
    iniciadoEm: '2026-11-03T10:00:00Z', config: { unidades: 11 } });
  await chamar('PUT', '/coletas/col-2026-10-a/etapa', { chave: 'gerencial:atendimentos', bloco: 'atendimentos', status: 'ok',
    coletadoEm: '2026-11-03T10:01:00Z', cubos: { atendimentos: cuboAtendimentos(5) } });
  await chamar('PUT', '/coletas/col-2026-10-a/etapa', { chave: 'gerencial:absenteismo', bloco: 'absenteismo', status: 'ok',
    coletadoEm: '2026-11-03T10:02:00Z', cubos: { absenteismo } });
  await chamar('PUT', '/coletas/col-2026-10-a/etapa', { chave: 'lista:gestantes:0002104741', bloco: 'gestantes', unidade: U,
    equipe: 'EQUIPE PANORAMA', ine: '0002104741', tipoEquipe: 'ESF', status: 'ok', coletadoEm: '2026-11-03T10:05:00Z',
    linhas: linhasGestantes, avisos: ['2 registros sem DUM'] });
  await chamar('PUT', '/coletas/col-2026-10-a/etapa', { chave: 'escuta:0002104741:ENFERMEIRO', bloco: 'escuta', unidade: U,
    equipe: 'EQUIPE PANORAMA', ine: '0002104741', status: 'ok', coletadoEm: '2026-11-03T10:09:00Z', cubos: { escuta } });
  await chamar('PUT', '/coletas/col-2026-10-a/etapa', { chave: 'lista:idosos:0002104741', bloco: 'idosos', unidade: U,
    equipe: 'EQUIPE PANORAMA', ine: '0002104741', status: 'falhou', tentativas: 3, erro: 'Tempo esgotado', coletadoEm: '2026-11-03T10:06:00Z' });
  await chamar('POST', '/coletas/col-2026-10-a/concluir', { status: 'parcial', concluidoEm: '2026-11-03T10:20:00Z' });
}
