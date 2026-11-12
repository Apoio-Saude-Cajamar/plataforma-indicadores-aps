# Gera painel/js/dados-federal.js a partir da planilha oficial (Siaps/MS). Só totais por conceito, nunca dados de pessoas.
import openpyxl, json, sys
src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, data_only=True)
def linhas(nome, cab):
    ws = wb[nome]; it = ws.iter_rows(values_only=True); r = []
    for row in it:
        if row and row[0] and str(row[0])[:2] in ('1º', '2º', '3º') and row[1]: r.append(row)
    return r
conceitos = [dict(q=r[0], eq=r[1], sig=r[3], nome=r[4], peso=r[5], o=r[6], b=r[7], s=r[8], r=r[9], n=r[10]) for r in linhas('Conceitos', 1)]
final = [dict(q=r[0], eq=r[1], comp=r[2], o=r[3], b=r[4], s=r[5], r=r[6], n=r[7]) for r in linhas('Classificacao_final', 1)]
js = '// Gerado por scripts/gerar-dados-federal.py. Fonte: Ministério da Saúde, Siaps (relatórios públicos), consulta de 09/11/2026.\nwindow.FEDERAL=' + json.dumps({'conceitos': conceitos, 'final': final}, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(out, 'w').write(js); print(len(conceitos), len(final))
