"""
Demo PDF — Rastreio de Falta v2 (Design Melhorado)
Gerado com xhtml2pdf (HTML/CSS → PDF, funciona no Windows)

Dependencias:
    pip install xhtml2pdf matplotlib pillow

Uso:
    py scripts/demo_rastreio_pdf.py
"""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import io, base64, os
from datetime import datetime

# ─── Dados de exemplo (baseados na screenshot real) ───────────────────────────
# (codigo, produto, unidade, dias=[19..25], media, saldo, projecao, tend, nivel)
DIA_LABELS  = ['19', '20', '21', '22', '23', '24', '25']
PERIODO_STR = 'Dias: 19, 20, 21, 22, 23, 24, 25  ·  Mar/2026'

DADOS = [
  ('73103',  'ROSUVASTATINA 10MG COMP REV EMS',         'COMP C/10MG',  [10,33,20,10,29,14,0],   16.6,  1,   0,  'Queda',  'Critico'),
  ('201608', 'AVENTAL CIRURGICO STD ESTERIL G 40G',     'UNIDADE',      [96,0,0,0,0,0,96],        27.4, 13,   0,  'Alta',   'Critico'),
  ('37371',  'ENALAPRIL 5MG COMP EMS',                  'COMP C/5MG',   [1,5,6,5,2,4,0],           3.3,  2,   1,  'Queda',  'Critico'),
  ('8810',   'FRALDA DESC ADULTO P BIGFRAL PLUS',       'UNIDADE',      [0,0,0,5,10,0,5],          2.9,  2,   1,  'Alta',   'Critico'),
  ('4174',   'ESPESSANTE RESOURCE THICKEN',             'UNIDADE',      [114,78,86,58,44,30,52],  66.0, 62,   1,  'Alta',   'Critico'),
  ('707',    'ROCEFIN 1.000MG FR/AMP IM',               'FA C/1000MG',  [3,0,2,0,4,8,1],           2.6,  3,   1,  'Queda',  'Critico'),
  ('7762',   'FIO SUTURA ABSORVIVEL VICRYL 4',          'UNIDADE',      [0,0,0,15,0,0,0],          2.1,  3,   1,  'Estavel','Critico'),
  ('2768',   'TYLEX 500/7,5MG COMP',                   'COMPRIMIDO',   [0,7,4,4,0,0,0],           2.0,  3,   2,  'Estavel','Critico'),
  ('29292',  'TORAGESIC 10MG COMP SL',                 'COMP C/10MG',  [0,0,6,4,0,0,0],           1.3,  2,   2,  'Estavel','Critico'),
  ('1052',   'DIPIRONA 500MG COMP',                    'COMPRIMIDO',   [45,52,38,60,71,55,48],   52.7,320,   6,  'Estavel','Critico'),
  ('3388',   'OMEPRAZOL 20MG CAP',                     'CAPSULA',      [30,25,40,35,28,32,29],   31.3,280,   8,  'Estavel','Alerta'),
  ('9901',   'CEFTRIAXONA 1G INJ',                     'FA C/1G',      [8,12,10,9,11,7,13],      10.0,115,  11,  'Alta',   'Alerta'),
  ('5521',   'METFORMINA 850MG COMP',                  'COMPRIMIDO',   [20,18,22,19,21,17,20],   19.6,245,  12,  'Estavel','Alerta'),
  ('4477',   'AMOXICILINA 500MG CAP',                  'CAPSULA',      [35,42,38,45,30,40,36],   38.0,530,  13,  'Estavel','Alerta'),
  ('6612',   'LOSARTANA 50MG COMP',                    'COMPRIMIDO',   [55,48,62,51,59,53,50],   54.0,880,  16,  'Queda',  'Atencao'),
  ('8834',   'SINVASTATINA 40MG COMP',                 'COMPRIMIDO',   [40,38,42,39,41,37,43],   40.0,900,  22,  'Estavel','Atencao'),
  ('2231',   'PARACETAMOL 750MG COMP',                 'COMPRIMIDO',   [80,95,88,102,79,91,85],  88.6,2200, 24,  'Estavel','Atencao'),
  ('7743',   'ATORVASTATINA 20MG COMP',                'COMPRIMIDO',   [22,25,20,28,23,26,24],   24.0,720,  30,  'Alta',   'Atencao'),
  ('3319',   'CAPTOPRIL 25MG COMP',                    'COMPRIMIDO',   [15,18,14,16,17,15,16],   15.9,650,  40,  'Estavel','OK'),
  ('1188',   'HIDROCLOROTIAZIDA 25MG COMP',            'COMPRIMIDO',   [28,31,27,30,29,32,28],   29.3,1800, 61,  'Estavel','OK'),
  ('5501',   'IBUPROFENO 600MG COMP',                  'COMPRIMIDO',   [50,55,48,52,54,51,53],   51.9,3500, 67,  'Alta',   'OK'),
  ('9977',   'VITAMINA C 500MG COMP',                  'COMPRIMIDO',   [35,40,37,42,38,41,39],   38.9,3200, 82,  'Estavel','OK'),
]

# ─── Paleta de cores ──────────────────────────────────────────────────────────
NIVEL_COR = {
  'Critico': {'bg': '#fff1f2', 'text': '#991b1b', 'badge': '#dc2626'},
  'Alerta':  {'bg': '#fffbeb', 'text': '#92400e', 'badge': '#d97706'},
  'Atencao': {'bg': '#eff6ff', 'text': '#1e40af', 'badge': '#2563eb'},
  'OK':      {'bg': '#f0fdf4', 'text': '#065f46', 'badge': '#16a34a'},
}
TEND_COR = {'Alta': '#16a34a', 'Queda': '#dc2626', 'Estavel': '#64748b'}

def proj_cor(d: int) -> str:
    if d <= 0:  return '#dc2626'
    if d <= 7:  return '#dc2626'
    if d <= 15: return '#d97706'
    if d <= 30: return '#2563eb'
    return '#16a34a'


# ─── Gráfico: Distribuição por nível (barras horizontais) ────────────────────
def grafico_distribuicao(critico, alerta, atencao, ok) -> str:
    fig, ax = plt.subplots(figsize=(8.5, 2.8))
    fig.patch.set_facecolor('white')
    ax.set_facecolor('#f8fafc')

    cats   = ['OK', 'Atencao', 'Alerta', 'Critico']
    vals   = [ok, atencao, alerta, critico]
    colors = ['#16a34a', '#2563eb', '#d97706', '#dc2626']

    bars = ax.barh(cats, vals, color=colors, height=0.52, zorder=2, edgecolor='none')
    for bar, v in zip(bars, vals):
        ax.text(bar.get_width() + 0.4, bar.get_y() + bar.get_height()/2,
                str(v), va='center', fontsize=11, fontweight='bold', color='#1e293b')

    ax.set_xlabel('Quantidade de produtos', fontsize=9, color='#64748b')
    ax.set_title('Distribuicao por Nivel de Criticidade', fontsize=11,
                 fontweight='bold', color='#1e293b', pad=10)
    ax.spines[['top','right','bottom']].set_visible(False)
    ax.tick_params(colors='#64748b', labelsize=10)
    ax.grid(axis='x', color='#e2e8f0', zorder=1, linewidth=0.8)
    ax.set_xlim(0, max(vals) * 1.18 or 1)
    plt.tight_layout(pad=1.2)

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode()
    plt.close(fig)
    return f'data:image/png;base64,{b64}'


# ─── Gráfico: Tendências (pizza) ──────────────────────────────────────────────
def grafico_tendencias(alta, queda, estavel) -> str:
    labels = []; vals = []; cores = []
    for lbl, v, cor in [('Alta', alta,'#16a34a'), ('Queda', queda,'#dc2626'), ('Estavel', estavel,'#94a3b8')]:
        if v > 0:
            labels.append(lbl); vals.append(v); cores.append(cor)

    fig, ax = plt.subplots(figsize=(4.0, 2.8))
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')

    wedges, texts, autotexts = ax.pie(
        vals, labels=labels, autopct='%1.0f%%', colors=cores,
        startangle=90, pctdistance=0.72,
        wedgeprops={'linewidth': 2, 'edgecolor': 'white'}
    )
    for at in autotexts:
        at.set_fontsize(9); at.set_fontweight('bold'); at.set_color('white')
    for t in texts:
        t.set_fontsize(9); t.set_color('#1e293b')

    ax.set_title('Tendencias', fontsize=11, fontweight='bold', color='#1e293b', pad=8)
    plt.tight_layout(pad=0.8)

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode()
    plt.close(fig)
    return f'data:image/png;base64,{b64}'


# ─── Gerar linhas HTML da tabela ─────────────────────────────────────────────
def linhas_html(dados) -> str:
    out = ''
    for i, (cod, prod, und, dias, media, saldo, proj, tend, nivel) in enumerate(dados, 1):
        nc  = NIVEL_COR[nivel]
        tc  = TEND_COR.get(tend, '#64748b')
        pc  = proj_cor(proj)
        row_bg = '#ffffff' if i % 2 == 1 else '#f8fafc'

        dias_td = ''
        for d in dias:
            cor_d = '#dc2626' if d == 0 else '#334155'
            fw    = '700' if d == 0 else '400'
            val   = str(d) if d >= 0 else '&mdash;'
            dias_td += f'<td style="text-align:center; color:{cor_d}; font-weight:{fw};">{val}</td>'

        proj_txt  = '&mdash;' if proj <= 0 else f'{int(proj)}d'
        saldo_fmt = f'{int(saldo):,}'.replace(',', '.')
        nome      = prod[:44] + ('...' if len(prod) > 44 else '')

        out += f'''<tr style="background:{row_bg};">
          <td style="text-align:center; color:#94a3b8; font-size:9pt;">{i}</td>
          <td style="font-weight:600; color:#475569; font-size:9pt;">{cod}</td>
          <td style="color:#1e293b; font-size:9pt;">{nome}</td>
          <td style="color:#64748b; font-size:9pt;">{und}</td>
          {dias_td}
          <td style="text-align:center; font-weight:600; color:#334155;">{media:.1f}</td>
          <td style="text-align:center; font-weight:600; color:#334155;">{saldo_fmt}</td>
          <td style="text-align:center; font-weight:700; color:{pc};">{proj_txt}</td>
          <td style="text-align:center; font-weight:600; color:{tc}; font-size:9pt;">{tend}</td>
          <td style="text-align:center; background:{nc['bg']};">
            <span style="background:{nc['badge']}; color:white; font-size:8pt; font-weight:700;
                  padding:1px 6px; border-radius:8px;">{nivel}</span>
          </td>
        </tr>\n'''
    return out


# ─── Montar HTML ──────────────────────────────────────────────────────────────
def gerar_html(dados) -> str:
    total      = len(dados)
    critico    = sum(1 for d in dados if d[8] == 'Critico')
    alerta     = sum(1 for d in dados if d[8] == 'Alerta')
    atencao    = sum(1 for d in dados if d[8] == 'Atencao')
    ok         = sum(1 for d in dados if d[8] == 'OK')
    t_alta     = sum(1 for d in dados if d[7] == 'Alta')
    t_queda    = sum(1 for d in dados if d[7] == 'Queda')
    t_estavel  = total - t_alta - t_queda

    g_dist = grafico_distribuicao(critico, alerta, atencao, ok)
    g_tend = grafico_tendencias(t_alta, t_queda, t_estavel)

    agora = datetime.now().strftime('%d/%m/%Y %H:%M')

    kpis = [
        ('Total Produtos', total,   '#475569', '#f1f5f9'),
        ('Critico',        critico, '#dc2626', '#fff1f2'),
        ('Alerta',         alerta,  '#d97706', '#fffbeb'),
        ('Atencao',        atencao, '#2563eb', '#eff6ff'),
        ('OK',             ok,      '#16a34a', '#f0fdf4'),
        ('Tend. Alta',     t_alta,  '#16a34a', '#f0fdf4'),
        ('Tend. Queda',    t_queda, '#dc2626', '#fff1f2'),
    ]
    kpi_html = ''.join(f'''
      <td style="width:14%; border-radius:6px; border:1px solid #e2e8f0;
                 border-top:3px solid {cor}; background:{bg};
                 padding:10px 8px; text-align:center; vertical-align:top;">
        <div style="font-size:22pt; font-weight:900; color:{cor}; line-height:1;">{val}</div>
        <div style="font-size:7pt; color:#64748b; font-weight:600; text-transform:uppercase;
                    letter-spacing:0.5px; margin-top:4px;">{lbl}</div>
      </td>''' for lbl, val, cor, bg in kpis)

    cab_dias = ''.join(f'<th style="width:28px;">{d}</th>' for d in DIA_LABELS)
    corpo    = linhas_html(dados)

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page {{
    size: A4 landscape;
    margin: 14mm 12mm 18mm 12mm;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10pt;
    color: #1e293b;
    background: white;
  }}

  /* ── Capa ── */
  .cover {{
    background: #b91c1c;
    padding: 28mm 26mm 22mm;
    color: white;
    page-break-after: always;
    min-height: 160mm;
  }}
  .cover-badge {{
    font-size: 8pt; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3); padding: 4px 14px;
    border-radius: 100px; display: inline-block; margin-bottom: 20px;
  }}
  .cover-title {{
    font-size: 38pt; font-weight: 900; line-height: 1.05;
    margin-bottom: 14px; letter-spacing: -0.5px;
  }}
  .cover-sub {{ font-size: 12pt; opacity: 0.72; margin-bottom: 24px; }}
  .cover-line {{ border: none; border-top: 1px solid rgba(255,255,255,0.25); margin: 22px 0 16px; }}
  .cover-meta-row {{ overflow: hidden; }}
  .cover-meta {{ float: left; margin-right: 40px; }}
  .cover-meta .lbl {{ font-size: 8pt; opacity: 0.55; text-transform: uppercase;
                      letter-spacing: 1px; margin-bottom: 2px; }}
  .cover-meta .val {{ font-size: 12pt; font-weight: 700; }}
  .cover-brand {{ text-align: right; font-size: 9pt; opacity: 0.4;
                  letter-spacing: 1px; text-transform: uppercase;
                  margin-top: 18px; }}

  /* ── Seção ── */
  .section-hd {{
    overflow: hidden; border-bottom: 2px solid #e2e8f0;
    padding-bottom: 8px; margin-bottom: 14px;
  }}
  .section-num {{
    float: left; width: 26px; height: 26px; background: #b91c1c;
    border-radius: 50%; color: white; text-align: center; line-height: 26px;
    font-weight: 800; font-size: 12pt; margin-right: 10px;
  }}
  .section-title {{
    float: left; font-size: 14pt; font-weight: 800; color: #7f1d1d;
    line-height: 26px;
  }}

  /* ── KPI cards (tabela) ── */
  .kpi-table {{ width: 100%; border-collapse: separate; border-spacing: 6px; }}

  /* ── Gráficos ── */
  .charts-table {{ width: 100%; border-collapse: separate; border-spacing: 10px;
                   margin-bottom: 0; }}
  .chart-cell {{
    background: white; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 10px; vertical-align: top;
  }}
  .chart-cell img {{ width: 100%; }}

  /* ── Nota ── */
  .note {{
    background: #fff7ed; border-left: 4px solid #ea580c;
    border-radius: 0 6px 6px 0; padding: 8px 12px; margin-top: 12px;
  }}
  .note-title {{ font-weight: 700; color: #c2410c; font-size: 9pt; margin-bottom: 3px; }}
  .note-body  {{ color: #7c2d12; font-size: 8.5pt; line-height: 1.6; }}

  /* ── Tabela principal ── */
  .tbl-wrap {{
    background: white; border: 1px solid #e2e8f0; border-radius: 8px;
    overflow: hidden;
  }}
  .tbl {{ width: 100%; border-collapse: collapse; font-size: 9pt; }}
  .tbl thead tr {{ background: #b91c1c; }}
  .tbl th {{
    color: white; font-size: 8pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.3px;
    padding: 7px 4px; text-align: center; white-space: nowrap;
  }}
  .tbl th.left {{ text-align: left; padding-left: 7px; }}
  .tbl td {{
    padding: 5px 4px; border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
  }}
  .tbl td.left {{ text-align: left; padding-left: 7px; }}
  .tbl tbody tr:last-child td {{ border-bottom: none; }}
</style>
</head>
<body>

<!-- ══ CAPA ════════════════════════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-badge">Relatorio Operacional</div>
  <div class="cover-title">Rastreio<br>de Falta</div>
  <div class="cover-sub">
    Monitoramento diario de risco de ruptura por produto —
    projecao de cobertura, tendencias e alertas automaticos.
  </div>
  <hr class="cover-line">
  <div class="cover-meta-row">
    <div class="cover-meta">
      <div class="lbl">Emitido em</div>
      <div class="val">{agora}</div>
    </div>
    <div class="cover-meta">
      <div class="lbl">Periodo analisado</div>
      <div class="val">{PERIODO_STR}</div>
    </div>
    <div class="cover-meta">
      <div class="lbl">Total monitorado</div>
      <div class="val">{total} produtos</div>
    </div>
  </div>
  <div class="cover-brand">FarmaIA  ·  Logistica Farmaceutica</div>
</div>

<!-- ══ SEÇÃO 1 — SUMÁRIO EXECUTIVO ═════════════════════════════════════════ -->
<div class="section-hd">
  <div class="section-num">1</div>
  <div class="section-title">Sumario Executivo</div>
</div>

<table class="kpi-table"><tr>{kpi_html}</tr></table>

<br>

<table class="charts-table">
  <tr>
    <td class="chart-cell" style="width:66%;">
      <img src="{g_dist}" alt="Distribuicao por nivel">
    </td>
    <td class="chart-cell" style="width:34%;">
      <img src="{g_tend}" alt="Tendencias">
    </td>
  </tr>
</table>

<div class="note">
  <div class="note-title">Legenda de Niveis</div>
  <div class="note-body">
    <span style="color:#dc2626; font-weight:700;">Critico</span> — saldo zero ou cobertura ate 7 dias. Acao imediata requerida.&nbsp;&nbsp;
    <span style="color:#d97706; font-weight:700;">Alerta</span> — cobertura 8-15 dias. Iniciar compra.&nbsp;&nbsp;
    <span style="color:#2563eb; font-weight:700;">Atencao</span> — cobertura 16-30 dias. Monitorar.&nbsp;&nbsp;
    <span style="color:#16a34a; font-weight:700;">OK</span> — cobertura acima de 30 dias.
  </div>
</div>

<pdf:nextpage/>

<!-- ══ SEÇÃO 2 — TABELA DETALHADA ═════════════════════════════════════════ -->
<div class="section-hd">
  <div class="section-num">2</div>
  <div class="section-title">Detalhe por Produto — {total} itens monitorados</div>
</div>

<div class="tbl-wrap">
  <table class="tbl">
    <thead>
      <tr>
        <th style="width:20px;">#</th>
        <th style="width:42px;">Codigo</th>
        <th class="left" style="width:135px;">Produto</th>
        <th style="width:58px;">Unidade</th>
        {cab_dias}
        <th style="width:38px;">Med/d</th>
        <th style="width:38px;">Saldo</th>
        <th style="width:38px;">Proj.</th>
        <th style="width:42px;">Tend.</th>
        <th style="width:52px;">Status</th>
      </tr>
    </thead>
    <tbody>
      {corpo}
    </tbody>
  </table>
</div>

</body>
</html>"""


# ─── Entry point ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_pdf   = os.path.join(project_root, 'rastreio_falta_DEMO.pdf')

    html = gerar_html(DADOS)

    try:
        from xhtml2pdf import pisa

        with open(output_pdf, 'wb') as f:
            result = pisa.CreatePDF(html, dest=f)

        if result.err:
            print(f'[ERRO] xhtml2pdf encontrou {result.err} erro(s). PDF pode estar incompleto.')
        else:
            print(f'[OK] PDF gerado: {output_pdf}')

    except ImportError:
        # Fallback: salvar HTML
        html_out = output_pdf.replace('.pdf', '.html')
        with open(html_out, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'[AVISO] xhtml2pdf nao instalado. HTML salvo em: {html_out}')
        print('  Instale com: pip install xhtml2pdf')
