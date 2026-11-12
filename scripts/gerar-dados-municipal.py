# Gera painel/js/dados-municipal.js a partir da planilha da PAS (DAPS). Só metas e totais, nunca dados de pessoas.
import openpyxl, json, sys
src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, data_only=True)
def n(x): return round(x, 4) if isinstance(x, float) else x
metas, dir_ = [], ''
for r in wb['Parcial'].iter_rows(values_only=True):
    if r[0] and str(r[0]).startswith('D') and r[1] and str(r[1]).startswith('DIRETRIZ'): dir_ = r[1]; continue
    if r[0] and r[1] and r[4] in ('Soma', 'Posição'):
        metas.append(dict(id=str(r[0]), dir=dir_, meta=r[1], ind=r[2], un=r[3], tipo=r[4], pol=r[5], alvo=n(r[6]), q1=n(r[7]), q2=n(r[8]), set=n(r[9]), acum=n(r[10]), prev=n(r[11]), pct=n(r[12]), sit=r[13], resp=r[15], obs=r[17]))
vac = []
rows = list(wb['Vacinas_MS'].iter_rows(values_only=True))
for r in rows:
    if r[0] and r[2] is not None and isinstance(r[2], (int, float)) and r[0][:1].isdigit():
        vac.append(dict(v=r[0], metaPAS=n(r[2]), metaMS=n(r[3]) if isinstance(r[3], (int, float)) else None, d25=n(r[4]) if isinstance(r[4], (int, float)) else None, ago=n(r[5]) if isinstance(r[5], (int, float)) else None, set=n(r[6]) if isinstance(r[6], (int, float)) else None, abaixo=r[7], obs=r[8]))
pend = [dict(n=r[0], t=r[1], metas=r[2], resp=r[3], prazo=str(r[4]) if r[4] else '') for r in wb['Pendencias'].iter_rows(min_row=2, values_only=True) if isinstance(r[0], (int, float))]
js = '// Gerado por scripts/gerar-dados-municipal.py. Fonte: PAS 2026, parcial do 3º quadrimestre (DAPS, extração de 09/11/2026).\nwindow.MUNICIPAL=' + json.dumps(dict(metas=metas, vacinas=vac, pendencias=pend), ensure_ascii=False, separators=(',', ':')) + ';\n'
open(out, 'w').write(js); print(len(metas), len(vac), len(pend))
