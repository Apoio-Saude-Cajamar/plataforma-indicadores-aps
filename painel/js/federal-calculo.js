// Cálculo do cofinanciamento federal (agregação, conceitos e faixas). Usado pela tela /indicadores e pelo relatório /relatorio.
// Usa a variável global `dados` (competência -> linhas) declarada pela página.
const GRUPOS=[
 ['Mais acesso',['C1']],
 ['Cuidado ao longo da vida',['C2','C3','C4','C5','C6','C7','C7-A','C7-B','C7-C','C7-D']],
 ['Vínculo e acompanhamento territorial',['CVAT','CVAT-CAD','CVAT-ACO']],
 ['Odontologia',['B1','B2','B3','B4','B5','B6']],
 ['Equipes multiprofissionais',['M1','M2']],
 ['Consultório na Rua',['CR1','CR2','CR3','CR4']],
 ['Acompanhamento municipal (fora do cofinanciamento federal)',['Q14.2.1','Q12.2','S20','S3','S4','VINC6A12','TERR-ATU','TERR-COMP','TERR-VIS','TERR-FA']]];
const NAO_SOMA_MESES=new Set(['C7','CVAT','M1','Q12.2','VINC6A12','TERR-ATU','TERR-COMP','TERR-VIS','TERR-FA','CVAT-CAD','CVAT-ACO','C7-A','C7-B','C7-C','C7-D','C2','C3','C4','C5','C6','S20','S3','S4','CR2','CR3','CR4']);
// Subitens como C7-B têm nomes que já começam por "C7 · B:"; tira o prefixo repetido (o código aparece à esquerda).
const nomeSem=(cod,n)=>{const b=cod.split('-')[0];const m=String(n).match(new RegExp('^'+b+' · (.*)$'));return m?(cod===b?n:m[1]):n};
const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const fmt=(v,tipo)=>v==null||isNaN(v)?'–':tipo==='percentual'?v.toFixed(1).replace('.',',')+'%':tipo==='contagem'?Math.round(v).toLocaleString('pt-BR'):v.toFixed(2).replace('.',',');
const mesNome=c=>{const [a,m]=c.split('-');return ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][m-1]+'/'+a};
function resultado(g,tipo){
 if(g.direto!==undefined)return g.direto;
 if(tipo==='pontos')return g.den?g.pts/g.den:null;
 if(tipo==='percentual')return g.den?100*g.num/g.den:null;
 if(tipo==='razao')return g.den?g.num/g.den:null;
 return g.val;
}
// Soma as linhas de um conjunto de meses num nível (município, unidade ou equipe).
function agregar(linhas,chave){
 const m=new Map();
 for(const l of linhas){const k=l.codigo+'|'+chave(l);const g=m.get(k)||{codigo:l.codigo,rot:chave(l),num:0,den:0,pts:0,val:0};
  g.num+=l.numerador||0;g.den+=l.denominador||0;g.pts+=l.somaPontos||0;g.val+=l.valor||0;m.set(k,g);}
 // C7: nota a partir dos itens A a D (pesos 20, 30, 30, 20). CVAT: escores do cadastro e do acompanhamento.
 const rots=new Set([...m.values()].map(g=>g.rot));
 for(const r of rots){
  const it=x=>m.get('C7-'+x+'|'+r);
  if(['A','B','C','D'].some(it)){let n=0;[['A',20],['B',30],['C',30],['D',20]].forEach(([x,p])=>{const g=it(x);if(g&&g.den)n+=g.num/g.den*p});m.set('C7|'+r,{codigo:'C7',rot:r,direto:n});}
  const cad=m.get('CVAT-CAD|'+r),aco=m.get('CVAT-ACO|'+r);
  if(cad&&aco){const f=(v,e)=>v>85?e[0]:v>=65?e[1]:v>=45?e[2]:e[3];const ic=cad.den?100*cad.num/cad.den:0,ia=aco.den?100*aco.num/aco.den:0;m.set('CVAT|'+r,{codigo:'CVAT',rot:r,direto:f(ic,[3,2.25,1.5,.75])+f(ia,[7,5.25,3.5,1.75])});}
 }
 return m;
}
// Faixas confirmadas: boas práticas C2 a C7 e CR1 a CR4 (0 a 100), vínculo CVAT (NT 8/2026) e M1 (NT 43/2026).
const FAIXA={C1:'x',C2:'bp',C3:'bp',C4:'bp',C5:'bp',C6:'bp',C7:'bp',CVAT:'cvat',B1:'x',B3:'x',B4:'x',B5:'x',B6:'x',M1:'m1',M2:'x',CR1:'bp',CR2:'bp',CR3:'bp',CR4:'bp'};
// Faixas lidas do desenho do dashboard, ainda a confirmar com a nota técnica vigente: marcadas com asterisco na tela.
const FAIXAX={C1:[[0,10,'r'],[10,30,'s'],[30,50,'b'],[50,70,'o'],[70,1e9,'r']],B1:[[0,.25,'r'],[.25,.75,'s'],[.75,1.25,'b'],[1.25,1e9,'o']],
 B3:[[0,3,'r'],[3,10,'o'],[10,12,'b'],[12,14,'s'],[14,1e9,'r']],B4:[[0,.25,'r'],[.25,.5,'s'],[.5,1,'b'],[1,1e9,'o']],
 B5:[[0,40,'r'],[40,55,'s'],[55,65,'b'],[65,85,'o'],[85,1e9,'r']],B6:[[0,3,'r'],[3,6,'s'],[6,8,'b'],[8,1e9,'o']],M2:[[0,1,'r'],[1,2.5,'s'],[2.5,5,'b'],[5,1e9,'o']]};
const NOTAS=['C1','C2','C3','C4','C5','C6','C7','CVAT','B1','B2','B3','B4','B5','B6','M1','M2','CR1','CR2','CR3','CR4'];
const grupoDe=cod=>(GRUPOS.find(g=>g[1].includes(cod))||[''])[0];
function conceito(cod,v){if(v==null||isNaN(v))return null;const f=FAIXA[cod];
 if(f==='bp')return v>75?'o':v>50?'b':v>25?'s':'r';
 if(f==='cvat')return v>8.5?'o':v>=7?'b':v>=5?'s':'r';
 if(f==='m1')return v>3?'o':v>2?'b':v>1?'s':'r';
 if(f==='x'){const t=FAIXAX[cod].find(([a,b])=>v>=a&&v<b);return t?t[2]:null}return null}
const NOMEC={o:'Ótimo',b:'Bom',s:'Suficiente',r:'Regular'},PILL={o:'c-o',b:'c-b',s:'c-s',r:'c-r'};
const aconf=cod=>FAIXAX[cod]?'<abbr title="Faixa a confirmar com a nota técnica vigente" style="text-decoration:none;cursor:help">*</abbr>':'';
const pc=(cod,v)=>{const k=conceito(cod,v);return k?' <span class="pill '+PILL[k]+'">'+NOMEC[k]+'</span>'+aconf(cod):''};
function linhasDe(cod,comps,un){let ls=[];comps.forEach(c=>ls.push(...(dados[c]||[]).filter(l=>l.codigo===cod||(cod==='C7'&&/^C7-/.test(l.codigo))||(cod==='CVAT'&&/^CVAT-/.test(l.codigo)))));
 ls=ls.filter(l=>l.recorte!=='desfecho'||cod==='C2'||cod==='C3');return un?ls.filter(l=>l.unidade===un):ls}
