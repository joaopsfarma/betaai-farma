# -*- coding: utf-8 -*-
"""
Tutorial de uso das abas V2 do FarmaIA
Gera PDF com capa, sumário e guia detalhado de cada aba.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus.flowables import Flowable
import os

OUTPUT = os.path.join(os.path.dirname(__file__), "..", "Tutorial_FarmaIA_V2.pdf")

# ─── PALETTE ──────────────────────────────────────────────────────────────────
INDIGO   = colors.HexColor("#4f46e5")
INDIGO_L = colors.HexColor("#eef2ff")
ROSE     = colors.HexColor("#e11d48")
ROSE_L   = colors.HexColor("#fff1f2")
AMBER    = colors.HexColor("#d97706")
AMBER_L  = colors.HexColor("#fffbeb")
EMERALD  = colors.HexColor("#059669")
EMERALD_L= colors.HexColor("#ecfdf5")
VIOLET   = colors.HexColor("#7c3aed")
VIOLET_L = colors.HexColor("#f5f3ff")
RED      = colors.HexColor("#dc2626")
RED_L    = colors.HexColor("#fff1f2")
BLUE     = colors.HexColor("#2563eb")
BLUE_L   = colors.HexColor("#eff6ff")
SLATE900 = colors.HexColor("#0f172a")
SLATE700 = colors.HexColor("#334155")
SLATE500 = colors.HexColor("#64748b")
SLATE300 = colors.HexColor("#cbd5e1")
SLATE100 = colors.HexColor("#f1f5f9")
WHITE    = colors.white

W, H = A4

# ─── STYLES ───────────────────────────────────────────────────────────────────
base = getSampleStyleSheet()

def style(name, **kw):
    s = ParagraphStyle(name, **kw)
    return s

S = {
    "h1":    style("H1",    fontName="Helvetica-Bold",  fontSize=22, textColor=SLATE900,
                            spaceAfter=6, spaceBefore=18, leading=28),
    "h2":    style("H2",    fontName="Helvetica-Bold",  fontSize=15, textColor=INDIGO,
                            spaceAfter=4, spaceBefore=14, leading=20),
    "h3":    style("H3",    fontName="Helvetica-Bold",  fontSize=11, textColor=SLATE700,
                            spaceAfter=3, spaceBefore=10, leading=15),
    "body":  style("Body",  fontName="Helvetica",       fontSize=9.5, textColor=SLATE700,
                            spaceAfter=5, leading=14, alignment=TA_JUSTIFY),
    "small": style("Small", fontName="Helvetica",       fontSize=8.5, textColor=SLATE500,
                            spaceAfter=3, leading=12),
    "bold":  style("Bold",  fontName="Helvetica-Bold",  fontSize=9.5, textColor=SLATE700,
                            spaceAfter=4, leading=14),
    "mono":  style("Mono",  fontName="Courier",         fontSize=8.5, textColor=SLATE700,
                            spaceAfter=3, leading=13, backColor=SLATE100,
                            leftIndent=8, rightIndent=8, borderPad=4),
    "cover_title": style("CT", fontName="Helvetica-Bold", fontSize=34,
                         textColor=WHITE, spaceAfter=8, leading=40, alignment=TA_CENTER),
    "cover_sub":   style("CS", fontName="Helvetica",      fontSize=13,
                         textColor=colors.HexColor("#c7d2fe"), spaceAfter=4,
                         leading=18, alignment=TA_CENTER),
    "toc":   style("TOC",   fontName="Helvetica",       fontSize=10, textColor=SLATE700,
                            spaceAfter=5, leading=15, leftIndent=10),
    "toc_h": style("TOCH",  fontName="Helvetica-Bold",  fontSize=11, textColor=INDIGO,
                            spaceAfter=3, leading=16),
    "tag":   style("Tag",   fontName="Helvetica-Bold",  fontSize=8, textColor=WHITE,
                            spaceAfter=2, leading=11, alignment=TA_CENTER),
}

# ─── HELPERS ──────────────────────────────────────────────────────────────────

def colored_box(text, fg, bg, width=None):
    """Single-cell table acting as a colored badge/box."""
    t = Table([[Paragraph(text, style("_t", fontName="Helvetica-Bold", fontSize=8.5,
                                      textColor=fg, leading=12, alignment=TA_CENTER))]],
              colWidths=[width or 3.5*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("ROUNDEDCORNERS", [4]),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
    ]))
    return t

def info_row(label, value, label_color=INDIGO, value_bg=INDIGO_L, width=17*cm):
    tbl = Table(
        [[Paragraph(f"<b>{label}</b>",
                    style("_ir", fontName="Helvetica-Bold", fontSize=9, textColor=label_color, leading=13)),
          Paragraph(value,
                    style("_iv", fontName="Helvetica", fontSize=9, textColor=SLATE700, leading=13))]],
        colWidths=[4*cm, width - 4*cm]
    )
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), value_bg),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ("LINEBELOW",     (0,0), (-1,-1), 0.4, SLATE300),
    ]))
    return tbl

def section_header(title, subtitle, color, light):
    tbl = Table(
        [[Paragraph(title,    style("_sh", fontName="Helvetica-Bold", fontSize=18,
                                    textColor=WHITE, leading=22)),
          Paragraph(subtitle, style("_ss", fontName="Helvetica", fontSize=9,
                                    textColor=colors.HexColor("#e2e8f0"), leading=13,
                                    alignment=TA_LEFT))]],
        colWidths=[8*cm, 9*cm]
    )
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), color),
        ("TOPPADDING",    (0,0), (-1,-1), 14),
        ("BOTTOMPADDING", (0,0), (-1,-1), 14),
        ("LEFTPADDING",   (0,0), (-1,-1), 14),
        ("RIGHTPADDING",  (0,0), (-1,-1), 14),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    return tbl

def step_table(steps):
    """Numbered steps table."""
    rows = []
    for i, (title, desc) in enumerate(steps, 1):
        num_cell = Paragraph(str(i), style("_n", fontName="Helvetica-Bold", fontSize=14,
                                            textColor=INDIGO, leading=18, alignment=TA_CENTER))
        text_cell = [
            Paragraph(title, style("_st", fontName="Helvetica-Bold", fontSize=9.5,
                                    textColor=SLATE700, leading=13, spaceAfter=2)),
            Paragraph(desc,  style("_sd", fontName="Helvetica", fontSize=9,
                                    textColor=SLATE500, leading=13))
        ]
        rows.append([num_cell, text_cell])

    tbl = Table(rows, colWidths=[1.2*cm, 15.8*cm])
    tbl.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
        ("LINEBELOW",     (0,0), (-1,-1), 0.3, SLATE300),
    ]))
    return tbl

def logic_table(rows_data, headers, col_widths, accent=INDIGO):
    rows = [[Paragraph(h, style("_th", fontName="Helvetica-Bold", fontSize=8.5,
                                 textColor=WHITE, leading=12))
             for h in headers]] + rows_data
    tbl = Table(rows, colWidths=col_widths)
    style_cmds = [
        ("BACKGROUND",    (0,0), (-1,0), accent),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",      (0,1), (-1,-1), 8.5),
        ("TEXTCOLOR",     (0,1), (-1,-1), SLATE700),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [WHITE, SLATE100]),
        ("LINEBELOW",     (0,0), (-1,-1), 0.3, SLATE300),
        ("GRID",          (0,0), (-1,-1), 0.3, SLATE300),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ]
    tbl.setStyle(TableStyle(style_cmds))
    return tbl

def callout(icon, title, body, fg, bg):
    inner = [
        Paragraph(f"{icon}  <b>{title}</b>",
                  style("_ci", fontName="Helvetica-Bold", fontSize=9.5,
                         textColor=fg, leading=14, spaceAfter=3)),
        Paragraph(body, style("_cb", fontName="Helvetica", fontSize=9,
                               textColor=SLATE700, leading=13)),
    ]
    tbl = Table([[inner]], colWidths=[17*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), bg),
        ("TOPPADDING",    (0,0), (-1,-1), 9),
        ("BOTTOMPADDING", (0,0), (-1,-1), 9),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
        ("LINEBEFOREBEFORE", (0,0),(0,-1), 3, fg),
    ]))
    return tbl

# ─── PAGE CALLBACKS ───────────────────────────────────────────────────────────

def cover_page_cb(canvas, doc):
    canvas.saveState()
    # Background gradient-like fill
    canvas.setFillColor(INDIGO)
    canvas.rect(0, H*0.38, W, H*0.62, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#312e81"))
    canvas.rect(0, 0, W, H*0.38, fill=1, stroke=0)
    # Decorative circle
    canvas.setFillColor(colors.HexColor("#4338ca"), alpha=0.25)
    canvas.circle(W*0.85, H*0.7, 5*cm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#6366f1"), alpha=0.15)
    canvas.circle(W*0.1, H*0.55, 3.5*cm, fill=1, stroke=0)
    canvas.restoreState()

def normal_page_cb(canvas, doc):
    canvas.saveState()
    # Top bar
    canvas.setFillColor(INDIGO)
    canvas.rect(0, H - 0.8*cm, W, 0.8*cm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.drawString(1.5*cm, H - 0.55*cm, "FarmaIA · Tutorial de Uso — Abas V2")
    # Bottom bar
    canvas.setFillColor(SLATE100)
    canvas.rect(0, 0, W, 0.9*cm, fill=1, stroke=0)
    canvas.setFillColor(SLATE500)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(1.5*cm, 0.32*cm, "FarmaIA — Uso Interno")
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.drawRightString(W - 1.5*cm, 0.32*cm, f"Página {doc.page}")
    canvas.restoreState()

# ─── CONTENT BUILDERS ─────────────────────────────────────────────────────────

def build_cover():
    story = []
    story.append(Spacer(1, 4.5*cm))
    story.append(Paragraph("FarmaIA", S["cover_title"]))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Tutorial de Uso — Abas V2", S["cover_sub"]))
    story.append(Spacer(1, 0.6*cm))
    story.append(Paragraph(
        "Análise de Dispensários V2 · Rastreio de Falta · Requisição V2",
        style("_cs2", fontName="Helvetica", fontSize=10.5,
               textColor=colors.HexColor("#a5b4fc"), leading=16, alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 4.0*cm))

    # Info box
    info = Table([
        [Paragraph("Versão", style("_k", fontName="Helvetica-Bold", fontSize=9, textColor=colors.HexColor("#a5b4fc"), leading=13)),
         Paragraph("v2.0 — Março 2026", style("_v", fontName="Helvetica", fontSize=9, textColor=WHITE, leading=13))],
        [Paragraph("Público", style("_k", fontName="Helvetica-Bold", fontSize=9, textColor=colors.HexColor("#a5b4fc"), leading=13)),
         Paragraph("Farmacêuticos, Técnicos e Gestores de Farmácia Hospitalar", style("_v", fontName="Helvetica", fontSize=9, textColor=WHITE, leading=13))],
        [Paragraph("Abas cobertas", style("_k", fontName="Helvetica-Bold", fontSize=9, textColor=colors.HexColor("#a5b4fc"), leading=13)),
         Paragraph("Análise Dispensários V2 · Rastreio de Falta · Requisição V2", style("_v", fontName="Helvetica", fontSize=9, textColor=WHITE, leading=13))],
    ], colWidths=[3.5*cm, 10*cm])
    info.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), colors.HexColor("#3730a3")),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("RIGHTPADDING",  (0,0), (-1,-1), 10),
        ("LINEBELOW",     (0,0), (-1,-1), 0.5, colors.HexColor("#4f46e5")),
    ]))
    story.append(info)
    story.append(PageBreak())
    return story


def build_toc():
    story = []
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("Sumário", S["h1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=SLATE300))
    story.append(Spacer(1, 0.3*cm))

    sections = [
        ("1", "Análise de Dispensários V2",  "Visão geral, abas internas, lógicas e plano de ação"),
        ("  1.1", "Como importar os arquivos",          "Passo a passo do upload"),
        ("  1.2", "Aba Transações",                     "Anomalias, categorias de erro e tabela detalhada"),
        ("  1.3", "Aba Saldos",                         "Divergências e plano de ação automático"),
        ("  1.4", "Aba Consumo",                        "Pareto, Curva ABC e indicadores de rotatividade"),
        ("2", "Rastreio de Falta",           "Projeção de dias, nível de risco e tendência"),
        ("  2.1", "Como importar o CSV",                "Formato esperado e detecção automática"),
        ("  2.2", "Indicadores e semáforo",             "Crítico / Alerta / Atenção / OK"),
        ("  2.3", "Filtros e ordenação",                "Como priorizar ações"),
        ("3", "Requisição V2",               "Cálculo de necessidade, status e exportação PDF"),
        ("  3.1", "Arquivos necessários",               "Conferência Satélite, CAF e Consumo"),
        ("  3.2", "Lógica de cálculo",                  "5 dias + 20% segurança — fórmulas detalhadas"),
        ("  3.3", "Status de cada item",                "Pedir / CAF Insuficiente / Sem Estoque / OK"),
        ("  3.4", "Exportar PDF",                       "Como gerar e usar o relatório em PDF"),
        ("4", "Referência rápida",           "Tabelas de status, fórmulas e dicas de uso"),
    ]
    for num, title, desc in sections:
        is_main = not num.startswith(" ")
        entry = Table([[
            Paragraph(f"<b>{num}</b>",
                      style("_tn", fontName="Helvetica-Bold", fontSize=10 if is_main else 9,
                             textColor=INDIGO if is_main else SLATE500, leading=14)),
            Paragraph(f"<b>{title}</b>" if is_main else title,
                      style("_tt", fontName="Helvetica-Bold" if is_main else "Helvetica",
                             fontSize=10 if is_main else 9, textColor=SLATE900 if is_main else SLATE700,
                             leading=14)),
            Paragraph(desc,
                      style("_td", fontName="Helvetica", fontSize=8.5,
                             textColor=SLATE500, leading=13, alignment=TA_LEFT)),
        ]], colWidths=[1.2*cm, 6*cm, 9.8*cm])
        entry.setStyle(TableStyle([
            ("TOPPADDING",    (0,0),(-1,-1), 4 if is_main else 2),
            ("BOTTOMPADDING", (0,0),(-1,-1), 4 if is_main else 2),
            ("LEFTPADDING",   (0,0),(-1,-1), 4),
            ("RIGHTPADDING",  (0,0),(-1,-1), 4),
            ("LINEBELOW",     (0,0),(-1,-1), 0.5 if is_main else 0.2, SLATE300 if is_main else colors.HexColor("#f8fafc")),
        ]))
        story.append(entry)
    story.append(PageBreak())
    return story


def build_analise():
    story = []
    story.append(section_header(
        "1. Análise de Dispensários V2",
        "Importação de transações, saldos e consumo para identificar anomalias e planejar ações corretivas.",
        INDIGO, INDIGO_L
    ))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(
        "A aba <b>Análise de Dispensários V2</b> centraliza três fontes de dados do dispensário automático: "
        "o log de transações (eventos do sistema), o relatório de saldos (comparação entre sistemas) e o "
        "histórico de consumo. A partir desses dados, o sistema gera indicadores automáticos, classifica "
        "anomalias e propõe planos de ação para cada divergência encontrada.",
        S["body"]
    ))

    # Arquivos necessários
    story.append(Paragraph("1.1  Como importar os arquivos", S["h2"]))
    story.append(Paragraph(
        "Cada sub-aba aceita um tipo de arquivo diferente. Todos são importados via upload "
        "(arrastar e soltar ou botão 'Selecionar'). O sistema detecta o separador automaticamente.",
        S["body"]
    ))
    story.append(step_table([
        ("Clique na aba desejada (Transações, Saldos ou Consumo)",
         "Cada aba tem sua própria área de upload independente."),
        ("Arraste o CSV para a área pontilhada ou clique em 'Selecionar Arquivo'",
         "Formatos aceitos: .csv e .txt. Encoding: latin1 (ISO-8859-1)."),
        ("Aguarde o processamento",
         "O sistema exibe um spinner enquanto processa. Arquivos grandes podem levar alguns segundos."),
        ("Analise os KPIs e gráficos gerados automaticamente",
         "Após o carregamento, todos os indicadores são calculados sem ação adicional."),
        ("Use os filtros para aprofundar a análise",
         "Cada tabela possui filtros por categoria, busca textual e ordenação."),
    ]))

    story.append(Paragraph("Formatos de arquivo esperados", S["h3"]))
    story.append(logic_table(
        [
            [Paragraph("Transações", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=INDIGO, leading=12)),
             Paragraph("CSV com separador ponto-e-vírgula (;)", S["small"]),
             Paragraph("Colunas: Operação, Data/Hora, Dispensário, Usuário, Gaveta, Código, Produto, Tipo, Qtde, Saldo...", S["small"])],
            [Paragraph("Saldos", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=ROSE, leading=12)),
             Paragraph("CSV com separador ponto-e-vírgula (;)", S["small"]),
             Paragraph("Colunas: Gaveta, Célula, Código, Descrição, Saldo WL, Saldo Hosp, Saldo Físico (Trn)...", S["small"])],
            [Paragraph("Consumo", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=EMERALD, leading=12)),
             Paragraph("CSV com separador vírgula (,)", S["small"]),
             Paragraph("Colunas: Produto, Descrição, Unidade, Quantidade total consumida...", S["small"])],
        ],
        ["Arquivo", "Separador", "Colunas principais"],
        [3*cm, 4.5*cm, 9.5*cm],
        accent=SLATE700
    ))
    story.append(Spacer(1, 0.3*cm))

    # Aba Transações
    story.append(Paragraph("1.2  Aba Transações — Anomalias e Categorias de Erro", S["h2"]))
    story.append(Paragraph(
        "O sistema varre todas as linhas do log e agrupa os eventos em categorias de anomalia. "
        "Para cada categoria, exibe a contagem, a porcentagem do total e permite expandir para "
        "ver as transações individuais que compõem aquele grupo.",
        S["body"]
    ))

    story.append(Paragraph("Categorias de anomalia detectadas automaticamente", S["h3"]))
    story.append(logic_table(
        [
            [Paragraph("Gaveta aberta pelo usuário", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=RED, leading=12)),
             Paragraph("Usuário abriu o gaveta manualmente sem bipar produto — possível retirada não registrada.", S["small"]),
             Paragraph("Alta", style("_p", fontName="Helvetica-Bold", fontSize=8.5, textColor=RED, leading=12))],
            [Paragraph("Código não reconhecido", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=AMBER, leading=12)),
             Paragraph("Bipar não retornou produto cadastrado — pode indicar produto fora do sistema ou leitura errada.", S["small"]),
             Paragraph("Média", style("_p", fontName="Helvetica-Bold", fontSize=8.5, textColor=AMBER, leading=12))],
            [Paragraph("Divergência de saldo", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=VIOLET, leading=12)),
             Paragraph("Saldo após transação ficou negativo ou inconsistente com o esperado.", S["small"]),
             Paragraph("Alta", style("_p", fontName="Helvetica-Bold", fontSize=8.5, textColor=RED, leading=12))],
            [Paragraph("Reposição sem solicitação", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=BLUE, leading=12)),
             Paragraph("Entrada de produto sem solicitação prévia registrada no sistema.", S["small"]),
             Paragraph("Média", style("_p", fontName="Helvetica-Bold", fontSize=8.5, textColor=AMBER, leading=12))],
            [Paragraph("Cancelamento após dispensa", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=SLATE500, leading=12)),
             Paragraph("Transação de dispensa seguida de cancelamento — verificar se produto foi devolvido.", S["small"]),
             Paragraph("Baixa", style("_p", fontName="Helvetica-Bold", fontSize=8.5, textColor=EMERALD, leading=12))],
        ],
        ["Categoria", "O que significa", "Prioridade"],
        [5*cm, 9.5*cm, 2.5*cm],
        accent=RED
    ))

    story.append(Spacer(1, 0.3*cm))
    story.append(callout(
        "!", "Gavetas abertas sem bipagem",
        "O evento 'Gaveta aberta pelo usuário' NÃO confirma retirada. Ele indica que o gaveta foi aberta "
        "sem que uma transação de dispensa fosse iniciada. Para confirmar se houve retirada não registrada, "
        "cruze o número da gaveta com o produto cadastrado nela (disponível na aba Saldos) e verifique se "
        "o saldo físico posterior é menor que o esperado.",
        AMBER, AMBER_L
    ))

    # Aba Saldos
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("1.3  Aba Saldos — Divergências e Plano de Ação", S["h2"]))
    story.append(Paragraph(
        "Compara três fontes de saldo para cada produto cadastrado no dispensário: "
        "<b>WL</b> (sistema Pyxis/WaveMark), <b>Hosp</b> (sistema hospitalar, ex: MV/SOUL MV) e "
        "<b>Físico (Trn)</b> — contagem física registrada. Quando há divergência, o sistema "
        "classifica automaticamente e propõe um plano de ação.",
        S["body"]
    ))

    story.append(Paragraph("Plano de ação automático — lógica de classificação", S["h3"]))
    story.append(logic_table(
        [
            [Paragraph("WL = Hosp = Fisico", style("_c", fontName="Helvetica", fontSize=8.5, textColor=SLATE700, leading=12)),
             Paragraph("Consistente", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=EMERALD, leading=12)),
             Paragraph("Nenhuma ação necessária.", S["small"]),
             Paragraph("Baixa", style("_p", fontName="Helvetica", fontSize=8.5, textColor=EMERALD, leading=12))],
            [Paragraph("WL > 0, Hosp = 0, Fisico = 0", style("_c", fontName="Helvetica", fontSize=8.5, textColor=SLATE700, leading=12)),
             Paragraph("Inventario Fisico", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=RED, leading=12)),
             Paragraph("WL mostra saldo mas sistemas reais mostram zero — contar fisicamente.", S["small"]),
             Paragraph("Critica", style("_p", fontName="Helvetica-Bold", fontSize=8.5, textColor=RED, leading=12))],
            [Paragraph("WL = 0, Hosp > 0, Fisico = 0", style("_c", fontName="Helvetica", fontSize=8.5, textColor=SLATE700, leading=12)),
             Paragraph("Regularizar no WL", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=AMBER, leading=12)),
             Paragraph("Hosp tem estoque mas WL esta zerado — lan,ar entrada no WL.", S["small"]),
             Paragraph("Alta", style("_p", fontName="Helvetica-Bold", fontSize=8.5, textColor=AMBER, leading=12))],
            [Paragraph("WL = Fisico, Hosp difere", style("_c", fontName="Helvetica", fontSize=8.5, textColor=SLATE700, leading=12)),
             Paragraph("Checar Sist. Hospitalar", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=BLUE, leading=12)),
             Paragraph("WL e fisico estao corretos — verificar lancamentos no sistema hospitalar.", S["small"]),
             Paragraph("Media", style("_p", fontName="Helvetica", fontSize=8.5, textColor=BLUE, leading=12))],
            [Paragraph("WL = Hosp, Fisico difere", style("_c", fontName="Helvetica", fontSize=8.5, textColor=SLATE700, leading=12)),
             Paragraph("Contagem Fisica", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=VIOLET, leading=12)),
             Paragraph("Sistemas concordam mas contagem fisica e diferente — fazer contagem manual.", S["small"]),
             Paragraph("Media", style("_p", fontName="Helvetica", fontSize=8.5, textColor=VIOLET, leading=12))],
            [Paragraph("WL != Hosp != Fisico (todos diferentes)", style("_c", fontName="Helvetica", fontSize=8.5, textColor=SLATE700, leading=12)),
             Paragraph("Inventario Urgente", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=RED, leading=12)),
             Paragraph("Tripla divergencia — parar para inventario imediato.", S["small"]),
             Paragraph("Critica", style("_p", fontName="Helvetica-Bold", fontSize=8.5, textColor=RED, leading=12))],
            [Paragraph("WL > Hosp (todos > 0)", style("_c", fontName="Helvetica", fontSize=8.5, textColor=SLATE700, leading=12)),
             Paragraph("Saida Nao Registrada", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=RED, leading=12)),
             Paragraph("Provavel consumo nao lancado no sistema hospitalar.", S["small"]),
             Paragraph("Alta", style("_p", fontName="Helvetica-Bold", fontSize=8.5, textColor=RED, leading=12))],
            [Paragraph("Hosp > WL (todos > 0)", style("_c", fontName="Helvetica", fontSize=8.5, textColor=SLATE700, leading=12)),
             Paragraph("Entrada Nao Integrada", style("_c", fontName="Helvetica-Bold", fontSize=8.5, textColor=AMBER, leading=12)),
             Paragraph("Entrada no sistema hospitalar ainda nao refletida no WL.", S["small"]),
             Paragraph("Alta", style("_p", fontName="Helvetica-Bold", fontSize=8.5, textColor=AMBER, leading=12))],
        ],
        ["Condicao detectada", "Plano de Acao", "O que fazer", "Prioridade"],
        [4.5*cm, 3.5*cm, 6.5*cm, 2.5*cm],
        accent=VIOLET
    ))

    # Aba Consumo
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("1.4  Aba Consumo — Pareto, Curva ABC e Rotatividade", S["h2"]))
    story.append(Paragraph(
        "A aba Consumo analisa o histórico de dispensação para identificar quais produtos concentram "
        "o maior volume de saídas e como se distribuem por nível de rotatividade.",
        S["body"]
    ))

    story.append(Paragraph("KPIs exibidos", S["h3"]))
    story.append(logic_table(
        [
            [Paragraph("SKUs Ativos", S["bold"]),
             Paragraph("Quantidade de produtos distintos com registro de consumo.", S["small"])],
            [Paragraph("Total Consumido", S["bold"]),
             Paragraph("Soma de todas as unidades dispensadas no periodo.", S["small"])],
            [Paragraph("Media por Produto", S["bold"]),
             Paragraph("Total consumido dividido pelo numero de SKUs.", S["small"])],
            [Paragraph("Maior Consumo", S["bold"]),
             Paragraph("Produto com maior volume de saidas — nome e quantidade.", S["small"])],
            [Paragraph("Pareto 80%", S["bold"]),
             Paragraph("Quantos SKUs representam 80% do consumo total (regra 80/20).", S["small"])],
            [Paragraph("Concentracao Top 10", S["bold"]),
             Paragraph("Percentual do consumo total gerado pelos 10 produtos mais dispensados.", S["small"])],
            [Paragraph("Curva ABC", S["bold"]),
             Paragraph("Alta (> media), Media (25-100% da media), Baixa (< 25% da media).", S["small"])],
        ],
        ["Indicador", "Descricao"],
        [4.5*cm, 12.5*cm],
        accent=EMERALD
    ))

    story.append(Spacer(1, 0.3*cm))
    story.append(callout(
        "i", "Como usar a Curva ABC",
        "Produtos de ALTA rotatividade precisam de reposicao frequente e nivel de seguranca maior. "
        "Produtos de MEDIA rotatividade sao os que mais precisam de monitoramento periodico. "
        "Produtos de BAIXA rotatividade podem ter seu espaco no dispensario revisado — considere "
        "retira-los do dispensario automatico e serve-los sob demanda da farmacia central.",
        BLUE, BLUE_L
    ))

    story.append(PageBreak())
    return story


def build_rastreio():
    story = []
    story.append(section_header(
        "2. Rastreio de Falta",
        "Monitore o risco de falta por produto com projecao de dias restantes, tendencia de consumo e semaforo automatico.",
        ROSE, ROSE_L
    ))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(
        "A aba <b>Rastreio de Falta</b> processa o CSV de tracking global gerado diariamente "
        "pelo dispensario e calcula, para cada produto, quantos dias de estoque ainda restam "
        "com base no consumo recente. O sistema classifica automaticamente em quatro niveis de "
        "risco e detecta tendencias de consumo (alta, estavell ou queda).",
        S["body"]
    ))

    story.append(Paragraph("2.1  Como importar o CSV", S["h2"]))
    story.append(step_table([
        ("Acesse a aba 'Rastreio de Falta'",
         "Encontrada no menu lateral do FarmaIA."),
        ("Arraste o arquivo trackingglobal.csv para a area de upload",
         "O arquivo deve ser o relatorio de tracking global — separador virgula (,), encoding latin1."),
        ("O sistema detecta automaticamente as colunas de dia",
         "Os cabecalhos das colunas de consumo diario sao lidos do proprio CSV e exibidos na tabela."),
        ("Visualize os KPIs e graficos instantaneamente",
         "Nenhuma configuracao adicional e necessaria apos o upload."),
    ]))

    story.append(Paragraph("Formato do CSV de Tracking", S["h3"]))
    story.append(info_row("Separador",  "Virgula (,)", ROSE, ROSE_L))
    story.append(info_row("Encoding",   "Latin1 (ISO-8859-1)", ROSE, ROSE_L))
    story.append(info_row("Coluna 0",   "Codigo do produto (numerico)", ROSE, ROSE_L))
    story.append(info_row("Coluna 1",   "Descricao: 'Nome Comercial - Nome Generico'", ROSE, ROSE_L))
    story.append(info_row("Coluna 2",   "Unidade de medida", ROSE, ROSE_L))
    story.append(info_row("Colunas 3-4","Consumo diario (Dia 1 e Dia 2) — label lido do cabecalho", ROSE, ROSE_L))
    story.append(info_row("Coluna 6",   "Media diaria calculada", ROSE, ROSE_L))
    story.append(info_row("Coluna 7",   "Saldo atual", ROSE, ROSE_L))
    story.append(info_row("Coluna 9",   "Projecao em dias (saldo / media)", ROSE, ROSE_L))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("2.2  Indicadores e Semaforo de Risco", S["h2"]))
    story.append(Paragraph(
        "O nivel de risco e calculado automaticamente com base na projecao de dias restantes:",
        S["body"]
    ))

    story.append(logic_table(
        [
            [Paragraph("Critico", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, leading=13)),
             Paragraph("Saldo zero OU projecao <= 7 dias", S["small"]),
             Paragraph("Acionar reposicao emergencial imediatamente.", S["small"])],
            [Paragraph("Alerta", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, leading=13)),
             Paragraph("Projecao entre 8 e 15 dias", S["small"]),
             Paragraph("Iniciar processo de requisicao com urgencia.", S["small"])],
            [Paragraph("Atencao", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, leading=13)),
             Paragraph("Projecao entre 16 e 30 dias", S["small"]),
             Paragraph("Incluir na proxima requisicao programada.", S["small"])],
            [Paragraph("OK", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, leading=13)),
             Paragraph("Projecao acima de 30 dias", S["small"]),
             Paragraph("Nenhuma acao imediata necessaria.", S["small"])],
        ],
        ["Nivel", "Criterio", "Acao recomendada"],
        [3*cm, 6.5*cm, 7.5*cm],
        accent=ROSE
    ))
    # Override row background with correct colors
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "<font color='#dc2626'><b>Critico</b></font> — vermelho  |  "
        "<font color='#d97706'><b>Alerta</b></font> — laranja  |  "
        "<font color='#2563eb'><b>Atencao</b></font> — azul  |  "
        "<font color='#059669'><b>OK</b></font> — verde",
        style("_badges", fontName="Helvetica", fontSize=9, textColor=SLATE700,
               leading=14, alignment=TA_CENTER)
    ))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Tendencia de consumo", S["h3"]))
    story.append(logic_table(
        [
            [Paragraph("Alta (seta para cima)", S["bold"]),
             Paragraph("Consumo do Dia 2 mais de 25% acima do Dia 1.", S["small"]),
             Paragraph("Produto com demanda crescente — priorizar no planejamento.", S["small"])],
            [Paragraph("Estavel (seta lateral)", S["bold"]),
             Paragraph("Variacao inferior a 25% entre os dois dias.", S["small"]),
             Paragraph("Consumo previsivel — usar media normal para calculos.", S["small"])],
            [Paragraph("Queda (seta para baixo)", S["bold"]),
             Paragraph("Consumo do Dia 2 mais de 25% abaixo do Dia 1.", S["small"]),
             Paragraph("Consumo caindo — pode indicar substitui,ao ou sazonalidade.", S["small"])],
        ],
        ["Tendencia", "Criterio", "Interpretacao"],
        [4*cm, 5.5*cm, 7.5*cm],
        accent=SLATE700
    ))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("2.3  Filtros e Ordenacao", S["h2"]))
    story.append(Paragraph(
        "A tabela pode ser filtrada e ordenada de diversas formas para priorizar acoes:",
        S["body"]
    ))
    story.append(step_table([
        ("Filtro por nivel",
         "Clique em Critico, Alerta, Atencao ou OK para ver apenas os produtos daquele nivel."),
        ("Filtro por tendencia",
         "Filtre por consumo em Alta, Estavell ou Queda para cruzar risco com tendencia."),
        ("Ordenacao",
         "Menor Projecao (mais urgentes primeiro), Maior Consumo, Menor Saldo ou Maior Media."),
        ("Busca textual",
         "Digite qualquer parte do nome comercial, generico, codigo ou unidade para localizar um produto."),
    ]))

    story.append(Spacer(1, 0.3*cm))
    story.append(callout(
        "i", "Dica de uso diario",
        "Use o filtro 'Critico' + ordenacao 'Menor Projecao' todas as manhas para gerar a lista "
        "de acoes emergenciais do dia. Em seguida, use 'Alerta' + tendencia 'Alta' para antecipar "
        "os produtos que provavelmente entrarão em critico nos proximos dias.",
        EMERALD, EMERALD_L
    ))

    story.append(PageBreak())
    return story


def build_requisicao():
    story = []
    story.append(section_header(
        "3. Requisicao V2",
        "Calculo automatico de necessidade de 5 dias com 20% de estoque de seguranca — da satelite para a CAF.",
        INDIGO, INDIGO_L
    ))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(
        "A aba <b>Requisicao V2</b> automatiza o calculo de quanto cada produto precisa ser "
        "requisitado da CAF (Central de Abastecimento Farmaceutico) para abastecer a satelite "
        "por 5 dias, com margem de seguranca de 20%. O sistema cruza tres arquivos CSV e gera "
        "um status para cada item, alem de permitir exportar o resultado em PDF.",
        S["body"]
    ))

    story.append(Paragraph("3.1  Arquivos necessarios", S["h2"]))
    story.append(logic_table(
        [
            [Paragraph("Conferencia Satelite", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=AMBER, leading=13)),
             Paragraph("conferencia332.csv (ou numero da satelite)", S["small"]),
             Paragraph("Estoque atual na satelite por produto. Identificado automaticamente: NAO tem '501' ou '561' no numero do estoque.", S["small"])],
            [Paragraph("Conferencia CAF", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=INDIGO, leading=13)),
             Paragraph("conferencia501.csv ou conferencia561.csv", S["small"]),
             Paragraph("Estoque disponivel na CAF. Identificado automaticamente: numero do estoque e 501 ou 561.", S["small"])],
            [Paragraph("Consumo", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=EMERALD, leading=13)),
             Paragraph("consumo_DDMM332.csv (ou similar)", S["small"]),
             Paragraph("Historico de consumo diario da satelite. Identificado automaticamente: contem colunas 'saldo' e 'total'.", S["small"])],
        ],
        ["Arquivo", "Nome esperado", "Como o sistema identifica"],
        [3.5*cm, 4.5*cm, 9*cm],
        accent=SLATE700
    ))

    story.append(Spacer(1, 0.3*cm))
    story.append(callout(
        "i", "Upload simultaneo",
        "Voce pode arrastar os 3 arquivos de uma vez para a area de upload. O sistema identifica "
        "cada um automaticamente pelo conteudo — nao pelo nome do arquivo. Arquivos parcialmente "
        "carregados sao indicados com badges coloridos na tela de upload.",
        INDIGO, INDIGO_L
    ))

    story.append(Paragraph("3.2  Logica de calculo — formulas detalhadas", S["h2"]))
    story.append(Paragraph(
        "Para cada produto presente no CSV de consumo, o sistema calcula:",
        S["body"]
    ))

    calcs = [
        ("Media Diaria", "media_diaria = coluna 'media' do CSV de consumo",
         "Consumo medio diario do produto na satelite."),
        ("Necessidade 5 dias", "necessidade_5d = media_diaria x 5",
         "Quantidade para cobrir 5 dias de consumo normal."),
        ("Com seguranca (+20%)", "necessidade_seguranca = ceil(necessidade_5d x 1.20)",
         "Arredondado para cima para garantir margem de seguranca."),
        ("Estoque Satelite", "estoque_sat = conferencia_satelite[codigo] ou consumo[saldo]",
         "Prioritariamente da conferencia; fallback para saldo do consumo."),
        ("Quantidade a Pedir", "qtde_pedir = max(0, necessidade_seguranca - estoque_sat)",
         "Zero se o estoque ja e suficiente."),
        ("Quantidade a Requisitar", "qtde_requisitar = min(qtde_pedir, estoque_caf)",
         "Limitado pelo que a CAF tem disponivel."),
    ]
    rows = []
    for name, formula, desc in calcs:
        rows.append([
            Paragraph(name, style("_cn", fontName="Helvetica-Bold", fontSize=9, textColor=INDIGO, leading=13)),
            Paragraph(formula, style("_cf", fontName="Courier", fontSize=8.5, textColor=SLATE700, leading=13, backColor=SLATE100)),
            Paragraph(desc, style("_cd", fontName="Helvetica", fontSize=8.5, textColor=SLATE500, leading=13)),
        ])
    story.append(logic_table(rows, ["Calculo", "Formula", "Descricao"],
                              [4*cm, 6.5*cm, 6.5*cm], accent=INDIGO))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("3.3  Status de cada item", S["h2"]))
    story.append(logic_table(
        [
            [Paragraph("OK", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, leading=13)),
             Paragraph("qtde_pedir = 0 — estoque na satelite ja e suficiente para 5 dias + 20%.", S["small"]),
             Paragraph("Nenhuma acao necessaria. Produto bem abastecido.", S["small"])],
            [Paragraph("Pedir", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, leading=13)),
             Paragraph("qtde_pedir > 0 E estoque_caf >= qtde_pedir — CAF consegue cobrir 100% da necessidade.", S["small"]),
             Paragraph("Requisitar a quantidade indicada na coluna 'Qtde Req.'.", S["small"])],
            [Paragraph("CAF Insuficiente", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, leading=13)),
             Paragraph("qtde_pedir > 0 E 0 < estoque_caf < qtde_pedir — CAF atende parcialmente.", S["small"]),
             Paragraph("Requisitar o disponivel e acionar reposicao emergencial da CAF.", S["small"])],
            [Paragraph("Sem Estoque CAF", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, leading=13)),
             Paragraph("qtde_pedir > 0 E estoque_caf = 0 — CAF nao tem nenhuma unidade.", S["small"]),
             Paragraph("Acionar compra emergencial ou buscar alternativa terapeutica.", S["small"])],
        ],
        ["Status", "Condicao", "Acao recomendada"],
        [3.5*cm, 7*cm, 6.5*cm],
        accent=INDIGO
    ))

    story.append(Spacer(1, 0.3*cm))
    story.append(callout(
        "!", "Deficit total",
        "O card 'Deficit Total' mostra o total de unidades que a CAF nao consegue cobrir "
        "(soma de qtde_pedir - qtde_requisitar para todos os itens). Esse numero e o que precisa "
        "ser endere,ado com compras emergenciais ou transferencias de outros estoques.",
        ROSE, ROSE_L
    ))

    story.append(Paragraph("3.4  Exportar PDF", S["h2"]))
    story.append(Paragraph(
        "Apos carregar os 3 arquivos e a analise estar completa, o botao <b>'Exportar PDF'</b> "
        "(azul, no canto superior direito) gera um PDF em formato paisagem com:",
        S["body"]
    ))
    story.append(step_table([
        ("Cabecalho com titulo e data",
         "Identifica a satelite, a CAF e o criterio utilizado (5 dias + 20%)."),
        ("KPI cards",
         "Total de produtos, a requisitar, CAF insuficiente, sem estoque, OK e total de unidades."),
        ("Tabela completa de itens",
         "Todas as colunas: Codigo, Produto, Generico, Unidade, Media/dia, Nec.5d, +20%, "
         "Estoque Satelite, Estoque CAF, Qtde Requisitar e Status."),
        ("Rodape com numeracao de pagina",
         "Identificacao do documento e numero de pagina em cada folha."),
    ]))
    story.append(Spacer(1, 0.3*cm))
    story.append(callout(
        "i", "Usando o PDF para operacoes",
        "O PDF exportado pode ser usado como documento de requisicao fisica. Filtre por "
        "status 'Pedir' antes de exportar para gerar apenas os itens que precisam de acao — "
        "isso reduz o numero de paginas e facilita a operacao na CAF.",
        EMERALD, EMERALD_L
    ))

    story.append(PageBreak())
    return story


def build_reference():
    story = []
    story.append(Paragraph("4. Referencia Rapida", S["h1"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=INDIGO))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Semaforos de status — resumo geral", S["h2"]))
    story.append(logic_table(
        [
            [Paragraph("Critico / Sem Estoque CAF", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=RED, leading=13)),
             Paragraph("Vermelho (#dc2626)", S["small"]),
             Paragraph("Acao imediata — compra emergencial ou inventario", S["small"])],
            [Paragraph("Alerta / CAF Insuficiente", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=AMBER, leading=13)),
             Paragraph("Laranja (#d97706)", S["small"]),
             Paragraph("Urgente — requisicao prioritaria", S["small"])],
            [Paragraph("Pedir", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=AMBER, leading=13)),
             Paragraph("Amarelo (#d97706)", S["small"]),
             Paragraph("Incluir na requisicao normal", S["small"])],
            [Paragraph("Atencao / Checar Sist. Hosp.", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=BLUE, leading=13)),
             Paragraph("Azul (#2563eb)", S["small"]),
             Paragraph("Investigar — verificar lancamentos", S["small"])],
            [Paragraph("CAF Insuf. / Contagem Fisica", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=VIOLET, leading=13)),
             Paragraph("Violeta (#7c3aed)", S["small"]),
             Paragraph("Contagem ou verificacao parcial necessaria", S["small"])],
            [Paragraph("OK / Consistente", style("_c", fontName="Helvetica-Bold", fontSize=9, textColor=EMERALD, leading=13)),
             Paragraph("Verde (#059669)", S["small"]),
             Paragraph("Nenhuma acao necessaria", S["small"])],
        ],
        ["Status", "Cor", "Acao"],
        [5.5*cm, 4.5*cm, 7*cm],
        accent=SLATE700
    ))

    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("Formulas de calculo — resumo", S["h2"]))
    story.append(logic_table(
        [
            [Paragraph("Projecao de Dias", S["bold"]),
             Paragraph("projecao = saldo_atual / media_diaria", style("_f", fontName="Courier", fontSize=9, textColor=SLATE700, leading=13))],
            [Paragraph("Necessidade 5d", S["bold"]),
             Paragraph("necessidade = media_diaria x 5", style("_f", fontName="Courier", fontSize=9, textColor=SLATE700, leading=13))],
            [Paragraph("+20% Seguranca", S["bold"]),
             Paragraph("com_seg = ceil(necessidade x 1.20)", style("_f", fontName="Courier", fontSize=9, textColor=SLATE700, leading=13))],
            [Paragraph("Qtde a Pedir", S["bold"]),
             Paragraph("a_pedir = max(0, com_seg - estoque_satelite)", style("_f", fontName="Courier", fontSize=9, textColor=SLATE700, leading=13))],
            [Paragraph("Qtde Requisitar", S["bold"]),
             Paragraph("requisitar = min(a_pedir, estoque_caf)", style("_f", fontName="Courier", fontSize=9, textColor=SLATE700, leading=13))],
            [Paragraph("Deficit", S["bold"]),
             Paragraph("deficit = a_pedir - requisitar", style("_f", fontName="Courier", fontSize=9, textColor=SLATE700, leading=13))],
            [Paragraph("Tendencia Alta", S["bold"]),
             Paragraph("dia2 > dia1 x 1.25  (mais de 25% de aumento)", style("_f", fontName="Courier", fontSize=9, textColor=SLATE700, leading=13))],
            [Paragraph("Tendencia Queda", S["bold"]),
             Paragraph("dia2 < dia1 x 0.75  (mais de 25% de reducao)", style("_f", fontName="Courier", fontSize=9, textColor=SLATE700, leading=13))],
        ],
        ["Calculo", "Formula"],
        [5*cm, 12*cm],
        accent=EMERALD
    ))

    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("Dicas de uso diario", S["h2"]))
    story.append(step_table([
        ("Manha: Rastreio de Falta — Critico + Menor Projecao",
         "Identifique emergencias do dia antes de qualquer outra atividade."),
        ("Manha: Rastreio de Falta — Alerta + Tendencia Alta",
         "Antecipe os produtos que entrarão em critico nos proximos 7 dias."),
        ("Semana: Requisicao V2 — gerar antes do dia de pedido da CAF",
         "Carregue os 3 CSVs, filtre por 'Pedir' + 'CAF Insuficiente' e exporte o PDF para operar."),
        ("Semana: Analise Dispensarios — verificar divergencias de saldo",
         "Filtre por prioridade 'Critica' na aba Saldos e resolva as divergencias antes do fechamento."),
        ("Mensal: Curva ABC e Pareto",
         "Revise quais produtos entraram ou sairam da curva A — isso orienta revisao de cadastro no dispensario."),
    ]))

    story.append(Spacer(1, 0.5*cm))
    # Footer note
    note = Table([[
        Paragraph(
            "FarmaIA — Uso Interno · Este documento descreve a logica das abas V2 do sistema FarmaIA. "
            "Para suporte ou duvidas, contate a equipe de desenvolvimento.",
            style("_fn", fontName="Helvetica", fontSize=8, textColor=SLATE500, leading=12,
                   alignment=TA_CENTER)
        )
    ]], colWidths=[17*cm])
    note.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), SLATE100),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (0,0),(-1,-1), 12),
        ("RIGHTPADDING",  (0,0),(-1,-1), 12),
    ]))
    story.append(note)
    return story


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=1.5*cm,  bottomMargin=1.5*cm,
        title="FarmaIA — Tutorial de Uso V2",
        author="FarmaIA",
        subject="Tutorial das Abas V2: Analise Dispensarios, Rastreio de Falta, Requisicao V2",
    )

    story = []
    story += build_cover()
    story += build_toc()
    story += build_analise()
    story += build_rastreio()
    story += build_requisicao()
    story += build_reference()

    def on_page(canvas, doc):
        if doc.page == 1:
            cover_page_cb(canvas, doc)
        else:
            normal_page_cb(canvas, doc)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"PDF gerado: {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
