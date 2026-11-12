// Monitoramento para administradores: junta o que as coletas e a composição já registram
// e aponta o que está atrasado, falhou ou não foi identificado. Só lê; não altera dados.
const DIA = 86400000;
const dias = (iso, agora) => (agora - new Date(iso).getTime()) / DIA;

export async function monitoramento(env, agora = Date.now()) {
  const limite = Number(env.MONITOR_DIAS) > 0 ? Number(env.MONITOR_DIAS) : 40;
  const itens = [];
  const add = (nivel, fonte, titulo, detalhe, extra) => itens.push({ nivel, fonte, titulo, detalhe: detalhe || '', ...(extra || {}) });

  // 1. Coletas do PEC enviadas pela extensão
  const col = await env.DB.prepare('SELECT id, competencia, tipo, status, versao_extensao, iniciado_em, concluido_em, recebido_em FROM coleta ORDER BY recebido_em DESC LIMIT 1').first();
  if (!col) add('erro', 'Coleta do PEC', 'Nenhuma coleta recebida', 'A extensão ainda não enviou nada. Confira a chave de coleta e o endereço do painel na extensão.');
  else {
    const d = dias(col.recebido_em, agora);
    if (d > limite) add('erro', 'Coleta do PEC', 'Coleta atrasada', `Última coleta recebida há ${Math.floor(d)} dias (competência ${col.competencia}).`, { quando: col.recebido_em });
    else add('ok', 'Coleta do PEC', 'Coleta em dia', `Última recebida em ${col.recebido_em.slice(0, 10)} (competência ${col.competencia}, ${col.status}).`, { quando: col.recebido_em });
    if (col.status === 'em_andamento' && dias(col.iniciado_em, agora) > 0.5) add('atencao', 'Coleta do PEC', 'Coleta iniciada e não concluída', `Começou em ${col.iniciado_em.slice(0, 16).replace('T', ' ')} e não foi finalizada. A sessão do PEC pode ter expirado.`);
    if (col.status === 'parcial') add('atencao', 'Coleta do PEC', 'Coleta parcial', 'Algumas etapas não foram concluídas; veja as falhas abaixo.');
    const falhas = (await env.DB.prepare(`
      WITH o AS (SELECT e.*, ROW_NUMBER() OVER (PARTITION BY e.chave ORDER BY (e.status='ok') DESC, e.coletado_em DESC, e.coleta_id DESC) AS ordem FROM etapa e WHERE e.competencia = ?)
      SELECT chave, unidade, equipe, erro, tentativas FROM o WHERE ordem = 1 AND status <> 'ok' ORDER BY unidade, equipe LIMIT 30`).bind(col.competencia).all()).results;
    if (falhas.length) add('erro', 'Coleta do PEC', `${falhas.length} etapa(s) sem sucesso`, 'Não foi possível ler estes itens no PEC.', { lista: falhas.map(f => [f.unidade, f.equipe, f.chave].filter(Boolean).join(' · ') + (f.erro ? ' — ' + String(f.erro).slice(0, 160) : '')) });
    const avisos = (await env.DB.prepare('SELECT mensagem, etapa_chave FROM aviso WHERE coleta_id = ? ORDER BY criado_em DESC LIMIT 20').bind(col.id).all()).results;
    if (avisos.length) add('atencao', 'Coleta do PEC', `${avisos.length} aviso(s) da extensão`, 'Itens que a extensão não conseguiu identificar ou que vieram fora do esperado.', { lista: avisos.map(a => (a.etapa_chave ? a.etapa_chave + ' — ' : '') + a.mensagem.slice(0, 200)) });
  }

  // 2. Composição das equipes
  const comp = await env.DB.prepare('SELECT competencia, recebido_em, dados FROM composicao ORDER BY competencia DESC LIMIT 1').first();
  if (!comp) add('atencao', 'Composição das equipes', 'Composição ainda não enviada', 'Rode a coleta de composição na extensão.');
  else {
    const d = dias(comp.recebido_em, agora);
    add(d > limite ? 'erro' : 'ok', 'Composição das equipes', d > limite ? 'Composição atrasada' : 'Composição em dia', `Última recebida em ${comp.recebido_em.slice(0, 10)} (competência ${comp.competencia}).`, { quando: comp.recebido_em });
    let dados = {}; try { dados = JSON.parse(comp.dados); } catch { add('erro', 'Composição das equipes', 'Composição ilegível', 'O conteúdo gravado não pôde ser lido.'); }
    const alertas = [...(dados.alertas || [])];
    (dados.unidades || []).forEach(u => { (u.alertas || []).forEach(a => alertas.push(u.nome + ': ' + a)); (u.semEquipe || []).forEach(p => alertas.push(u.nome + ': sem equipe — ' + (p.nome || p))); (u.equipes || []).forEach(e => (e.alertas || []).forEach(a => alertas.push(u.nome + ' · ' + e.nome + ': ' + a))); });
    if (alertas.length) add('atencao', 'Composição das equipes', `${alertas.length} ponto(s) para conferir`, 'Situações que a extensão encontrou na composição (por exemplo, equipe sem médico).', { lista: alertas.slice(0, 40) });
  }

  // 3. Fontes públicas (população do IBGE)
  const gravidade = { erro: 2, atencao: 1, ok: 0 };
  const pior = itens.reduce((m, i) => Math.max(m, gravidade[i.nivel]), 0);
  return { verificadoEm: new Date(agora).toISOString(), limiteDias: limite, situacao: ['ok', 'atencao', 'erro'][pior], problemas: itens.filter(i => i.nivel !== 'ok').length, itens };
}
