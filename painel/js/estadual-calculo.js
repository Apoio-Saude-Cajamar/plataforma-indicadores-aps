// Cálculo do cofinanciamento estadual (IGM SUS Paulista): parcelas, valor vigente, pontuação e estimativa do PEC.
// Usa as variáveis globais LANC, VAC, NESF e parcela, declaradas pela página; as regras vêm de estadual-regras.js.
const R=window.ESTADUAL_REGRAS;
const PARCELAS=[{n:'1ª · maio',p:'2025-Q3',ant:'2025-Q2'},{n:'2ª · setembro',p:'2026-Q1',ant:'2025-Q3'},{n:'3ª · dezembro',p:'2026-Q2',ant:'2026-Q1'}];
const NOMEQ=p=>{const [a,q]=p.split('-Q');return q+'º quadrimestre de '+a};
const fmtE=(v,c=1)=>v==null?'—':v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:c});
const vig=(item,per)=>LANC.find(l=>l.item===item&&l.periodo===per)||null;
function alvo(id,per){const ano=per.slice(0,4);const l=LANC.filter(x=>x.item===id&&x.periodo.startsWith(ano)).sort((a,b)=>b.periodo.localeCompare(a.periodo))[0];return l?l.valor:null}
function dadosItem(it,P){
  const l=vig(it.id,P.p),ant=vig(it.id,P.ant);
  const d={valor:l?l.valor:null,anterior:l&&l.anterior!=null?l.anterior:(ant?ant.valor:null),mediana:l?l.mediana:null,quartil:l?l.quartil:null,quartilAnt:l&&l.quartilAnt!=null?l.quartilAnt:(ant?ant.quartil:null),origem:l?'lançamento':null};
  if(it.id==='mortalidade'&&l&&l.anterior==null&&ant){d.anterior=ant.valor}
  if(it.tipo==='vacina'&&R.DEF[it.id]){
    const est=R.estimativa(it.id,VAC,P.p,alvo(R.DEF[it.id].alvo,P.p));d.est=est;
    // Sem valor oficial, a estimativa do PEC entra marcada como "estimada" (mediana: a última lançada para o indicador).
    if(!l&&est&&est.completo&&est.cobertura!=null){const med=LANC.filter(x=>x.item===it.id&&x.mediana!=null).sort((a,b)=>b.periodo.localeCompare(a.periodo))[0];
      d.valor=est.cobertura;d.mediana=med?med.mediana:null;d.origem='estimativa do PEC (não oficial)'}
  }
  if(it.tipo==='esf'){d.nEsf=l?l.valor:NESF;d.origem=l?'lançamento':(NESF!=null?'PEC (composição)':null);d.valor=d.nEsf}
  return d;
}
function calcular(){
  const linhas=R.ITENS.map(it=>{const d=dadosItem(it,parcela),r=R.pontuar(it,d,R.POP);return {it,d,r}});
  const res=linhas.map(x=>({peso:x.it.peso,pct:x.r.pct}));
  const ob=vig('obito_materno',parcela.p);
  return {linhas,res,nota:R.nota(res,ob?ob.valor===0:undefined),ob};
}
function pill(p){if(p===null)return '<span class="pill pn">sem dado</span>';const k=Math.round(p*100);return '<span class="pill p'+k+'">'+k+'%</span>'}
function mostra(it,d){
  if(it.tipo==='esf')return d.nEsf==null?'—':fmtE(d.nEsf,0)+' eSF · '+fmtE(R.cobertura(d.nEsf,R.POP),1)+'%';
  if(it.tipo==='liraa')return d.valor==null?'—':(d.valor?'realizado':'não realizado');
  if(it.tipo==='mortalidade')return d.valor==null?'—':fmtE(d.valor,2)+' ('+(d.quartil||'?')+'º quartil)';
  return (d.valor==null?'—':fmtE(d.valor,2)+'%')+estPec(it,d);
}
function estPec(it,d){
  const e=d.est;if(!e)return '';
  const resto=d.origem&&d.origem.startsWith('estimativa')?'':(e.cobertura!=null&&d.valor!=null&&e.completo?' · diferença de '+fmtE(Math.abs(e.cobertura-d.valor),1)+' p.p.':'');
  const cob=e.cobertura==null?'informe a população-alvo para calcular':fmtE(e.cobertura,1)+'%';
  return '<small>PEC (estimativa): '+cob+' · '+fmtE(e.doses,0)+' doses'+(e.completo?'':' · só '+e.meses+' de '+e.esperados+' meses coletados')+resto+'</small>';
}
function ref(it,d){
  if(it.tipo==='esf')return '—';
  if(it.tipo==='liraa'||it.tipo==='sifilis')return '—';
  if(it.tipo==='mortalidade')return d.anterior==null?'—':fmtE(d.anterior,2)+' ('+(d.quartilAnt||'?')+'º quartil)';
  const a=d.anterior==null?'—':fmtE(d.anterior,2)+'%';
  return it.tipo==='internacoes'?'média estadual: '+(d.mediana==null?'—':fmtE(d.mediana,2)):a+(d.mediana!=null?' · mediana '+fmtE(d.mediana,2)+'%':'');
}
function dica(x){
  const {it,d,r}=x;
  if(it.tipo==='esf'&&d.nEsf!=null){const c=R.cobertura(d.nEsf,R.POP),preciso=Math.ceil(0.7*R.POP/R.TETO_ESF);return r.motivo+(c<70?' Faltam '+(preciso-d.nEsf)+' eSF para 70%.':'')}
  return r.motivo;
}
