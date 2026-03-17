import { useState, useMemo } from "react";

// ─── Design Tokens (tema claro hospitalar) ────────────────────────────────────
const T = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  cardAlt: "#F1F5F9",
  border: "#E2E8F0",
  borderDark: "#CBD5E1",
  accent: "#0EA5E9",
  accentDark: "#0284C7",
  warn: "#D97706",
  warnBg: "#FFFBEB",
  danger: "#DC2626",
  dangerBg: "#FEF2F2",
  ok: "#16A34A",
  okBg: "#F0FDF4",
  purple: "#7C3AED",
  purpleBg: "#F5F3FF",
  text: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  headerBg: "#0F172A",
};

// ─── Parser CSV ───────────────────────────────────────────────────────────────
function parseCSV(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines
    .filter((l) => /^\d{7,}/.test(l.split(";")[0]))
    .map((line) => {
      const c = line.split(";");
      return {
        atendimento: c[0] || "",
        paciente: c[2] ? `${c[1] || ""} ${c[2] || ""}`.trim() : c[1] || "",
        codProduto: c[3] || "",
        produto: (c[4] || "").replace(/\xa0/g, " ").trim(),
        totalNaoAdm: parseInt(c[5]) || 0,
        totalDevolvido: parseInt(c[6]) || 0,
        qtdePendente: parseInt(c[7]) || 0,
        solicitacoes: c[8] || "",
        prescricao: c[9] || "",
        unidade: c[10] || "",
        leito: c[11] || "",
        alta: (c[12] || "").trim(),
      };
    });
}

type RowData = ReturnType<typeof parseCSV>[number];

// ─── Parse Solicitações ───────────────────────────────────────────────────────
function parseSolicitacoes(raw: string) {
  if (!raw || raw.includes("SEM SOLICITACAO")) return [];
  return raw.split("||").map((s) => s.trim()).filter(Boolean).map((s) => {
    const id = (s.match(/SOLICITAC.O:\((\d+)\)/) || [])[1] || "";
    const qtde = (s.match(/QTDE:\((\d+)\)/) || [])[1] || "";
    const status = (s.match(/STATUS:\s*([A-ZÁÉÍÓÚ ]+)/) || [])[1]?.trim() || "";
    const data = (s.match(/DATA:(\d{2}\/\d{2}\/\d{4})/) || [])[1] || "";
    const usuario = (s.match(/USUARIO:([A-Z0-9]+)/) || [])[1] || "";
    return { id, qtde, status, data, usuario };
  });
}

// ─── Parse Prescrições ────────────────────────────────────────────────────────
function parsePrescricoes(raw: string) {
  if (!raw) return [];
  return raw.split("||").map((s) => s.trim()).filter(Boolean).map((s) => {
    const id = (s.match(/PRESCRICAO:\((\d+)\)/) || [])[1] || "";
    const dh = (s.match(/DH MEDICACAO:\(([^)]+)\)/) || [])[1] || "";
    return { id, dh };
  });
}

// ─── Determina Status ─────────────────────────────────────────────────────────
function getStatusInfo(row: RowData) {
  const sols = parseSolicitacoes(row.solicitacoes);
  const temAlta = !!row.alta && row.alta.length > 4;
  const pendente = row.qtdePendente > 0;
  if (!pendente) return { label: "Regularizado", color: T.ok, bg: T.okBg, icon: "✓" };
  if (temAlta && pendente) return { label: "Alta c/ Pendência", color: T.danger, bg: T.dangerBg, icon: "!" };
  if (sols.length === 0) return { label: "Sem Solicitação", color: T.warn, bg: T.warnBg, icon: "⚠" };
  const atendido = sols.some((s) => s.status === "ATENDIDO");
  if (atendido) return { label: "Em Andamento", color: T.accent, bg: "#EFF6FF", icon: "↻" };
  return { label: "Aguardando", color: T.purple, bg: T.purpleBg, icon: "⏳" };
}

// ─── Componentes ─────────────────────────────────────────────────────────────
function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: bg || color + "18", color,
      border: `1px solid ${color}44`,
      borderRadius: 6, padding: "2px 8px",
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function KPICard({ label, value, sub, color, icon, bg }: { label: string; value: React.ReactNode; sub?: string; color: string; icon: string; bg?: string }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: T.muted, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>{sub}</div>}
        </div>
        <span style={{ fontSize: 24, background: bg || color + "18", borderRadius: 10, padding: 8 }}>{icon}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: 0.5 }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: T.border }} />
      </div>
      {children}
    </div>
  );
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: T.sub, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
      </div>
      <div style={{ height: 6, background: T.cardAlt, borderRadius: 99 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
}

// ─── Modal de Detalhes ────────────────────────────────────────────────────────
function StatusModal({ row, onClose }: { row: RowData; onClose: () => void }) {
  const sols = parseSolicitacoes(row.solicitacoes);
  const prescs = parsePrescricoes(row.prescricao);
  const s = getStatusInfo(row);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.card, borderRadius: 20, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,.18)", border: `1px solid ${T.border}` }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Atendimento {row.atendimento} · Leito {row.leito}</div>
            <div style={{ fontWeight: 700, color: T.text, fontSize: 15, maxWidth: 480 }}>{row.produto}</div>
          </div>
          <button onClick={onClose} style={{ background: T.cardAlt, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 16, color: T.sub }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
            {[
              { l: "Não Admin.", v: row.totalNaoAdm, c: T.warn, bg: T.warnBg },
              { l: "Devolvido", v: row.totalDevolvido, c: T.ok, bg: T.okBg },
              { l: "Pendente", v: row.qtdePendente, c: T.danger, bg: T.dangerBg },
              { l: "Status", v: s.icon + " " + s.label, c: s.color, bg: s.bg },
            ].map((x) => (
              <div key={x.l} style={{ background: x.bg, border: `1px solid ${x.c}33`, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontSize: x.l === "Status" ? 13 : 22, fontWeight: 800, color: x.c }}>{x.v}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>{x.l}</div>
              </div>
            ))}
          </div>
          {row.alta && (
            <div style={{ background: T.warnBg, border: `1px solid ${T.warn}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 20, display: "flex", gap: 8, alignItems: "center" }}>
              <span>🏠</span>
              <span style={{ fontSize: 13, color: T.warn, fontWeight: 600 }}>Alta em {row.alta.substring(0, 10)} — item ainda pendente de devolução</span>
            </div>
          )}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>📋 Solicitações de Devolução</div>
            {sols.length === 0 ? (
              <div style={{ background: T.warnBg, border: `1px solid ${T.warn}33`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: T.warn, fontWeight: 600 }}>⚠ Nenhuma solicitação registrada para este item</div>
            ) : sols.map((sol, i) => (
              <div key={i} style={{ background: T.cardAlt, borderRadius: 10, padding: "12px 16px", marginBottom: 8, border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontWeight: 700, color: T.accent }}>Solicitação #{sol.id}</span>
                  <Badge color={sol.status === "ATENDIDO" ? T.ok : T.warn} bg={sol.status === "ATENDIDO" ? T.okBg : T.warnBg}>{sol.status || "—"}</Badge>
                </div>
                <div style={{ display: "flex", gap: 20, marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: T.sub }}>Qtde: <strong style={{ color: T.text }}>{sol.qtde}</strong></span>
                  <span style={{ fontSize: 12, color: T.sub }}>Data: <strong style={{ color: T.text }}>{sol.data}</strong></span>
                  {sol.usuario && <span style={{ fontSize: 12, color: T.sub }}>Usuário: <strong style={{ color: T.text }}>{sol.usuario}</strong></span>}
                </div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>💊 Prescrições Relacionadas ({prescs.length})</div>
            <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {prescs.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: T.cardAlt, borderRadius: 8, padding: "8px 14px", border: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 12, color: T.muted }}>Prescrição <span style={{ color: T.accent, fontWeight: 700 }}>#{p.id}</span></span>
                  <span style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{p.dh}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Exportar PDF ─────────────────────────────────────────────────────────────
function exportPDF(rows: RowData[]) {
  const now = new Date().toLocaleString("pt-BR");
  const totalNaoAdm = rows.reduce((s, d) => s + d.totalNaoAdm, 0);
  const totalDevolvido = rows.reduce((s, d) => s + d.totalDevolvido, 0);
  const totalPendente = rows.reduce((s, d) => s + d.qtdePendente, 0);
  const taxa = totalNaoAdm > 0 ? ((totalDevolvido / totalNaoAdm) * 100).toFixed(1) : 0;
  const comAlta = rows.filter((d) => d.alta?.length > 4 && d.qtdePendente > 0).length;
  const semSolic = rows.filter((d) => d.solicitacoes.includes("SEM SOLICITACAO") && d.qtdePendente > 0).length;
  const tableRows = rows.map((d) => {
    const s = getStatusInfo(d);
    const sols = parseSolicitacoes(d.solicitacoes);
    const solDesc = sols.length === 0
      ? '<span style="color:#D97706">Sem solicitação</span>'
      : sols.map((x) => `<span style="color:#0284C7;font-weight:700">#${x.id}</span> <span style="color:${x.status === "ATENDIDO" ? "#16A34A" : "#D97706"};font-weight:700">${x.status}</span>${x.data ? ` <span style="color:#94A3B8">${x.data}</span>` : ""}${x.usuario ? ` <span style="color:#94A3B8">· ${x.usuario}</span>` : ""}`).join("<br/>");
    const prescs = parsePrescricoes(d.prescricao);
    return `
      <tr>
        <td style="font-weight:700;color:#0284C7">${d.atendimento}</td>
        <td><strong>${d.produto}</strong><br/><span style="color:#94A3B8;font-size:7px">Cód: ${d.codProduto}</span></td>
        <td><strong style="color:#7C3AED">${d.leito}</strong><br/><span style="color:#94A3B8;font-size:7px">${d.unidade.split(" -")[0]}</span></td>
        <td style="text-align:center;font-weight:700;color:#D97706">${d.totalNaoAdm}</td>
        <td style="text-align:center;font-weight:700;color:#16A34A">${d.totalDevolvido}</td>
        <td style="text-align:center;font-weight:700;color:${d.qtdePendente > 0 ? "#DC2626" : "#16A34A"}">${d.qtdePendente}</td>
        <td>
          <span style="display:inline-block;background:${s.bg};color:${s.color};border:1px solid ${s.color}44;border-radius:4px;padding:2px 6px;font-size:8px;font-weight:700;margin-bottom:4px">${s.icon} ${s.label}</span>
          <div style="font-size:7.5px;line-height:1.8">${solDesc}</div>
        </td>
        <td style="font-size:7.5px;color:#475569">${prescs.length} prescrição(ões)</td>
        <td style="font-size:8px;color:${d.alta ? "#D97706" : "#94A3B8"};font-weight:${d.alta ? 700 : 400}">${d.alta ? "🏠 " + d.alta.substring(0, 10) : "—"}</td>
      </tr>`;
  }).join("");
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Checagem e Devolução de Produtos</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { box-sizing: border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:9px; color:#0F172A; background:#fff; }
  .header { display:flex; justify-content:space-between; align-items:flex-end; padding-bottom:10px; border-bottom:3px solid #0EA5E9; margin-bottom:14px; }
  .h-title { font-size:19px; font-weight:800; color:#0F172A; }
  .h-sub { font-size:10px; color:#64748B; margin-top:2px; }
  .h-meta { text-align:right; font-size:9px; color:#94A3B8; line-height:1.6; }
  .kpis { display:flex; gap:8px; margin-bottom:12px; }
  .kpi { flex:1; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:9px 11px; }
  .kpi-v { font-size:20px; font-weight:800; }
  .kpi-l { font-size:8px; text-transform:uppercase; letter-spacing:1px; color:#94A3B8; margin-top:1px; }
  .alerts { display:flex; gap:8px; margin-bottom:12px; }
  .alert { flex:1; border-radius:6px; padding:7px 10px; font-size:9px; }
  .ad { background:#FEF2F2; border:1px solid #FECACA; color:#DC2626; }
  .aw { background:#FFFBEB; border:1px solid #FDE68A; color:#D97706; }
  table { width:100%; border-collapse:collapse; font-size:8px; }
  thead tr { background:#0F172A; color:#F8FAFC; }
  thead th { padding:7px 7px; text-align:left; font-size:8px; font-weight:700; letter-spacing:.8px; text-transform:uppercase; white-space:nowrap; }
  tbody tr:nth-child(even) { background:#F8FAFC; }
  tbody td { padding:6px 7px; vertical-align:top; border-bottom:1px solid #F1F5F9; line-height:1.4; }
  .footer { margin-top:10px; padding-top:8px; border-top:1px solid #E2E8F0; display:flex; justify-content:space-between; font-size:8px; color:#94A3B8; }
</style></head><body>
<div class="header">
  <div>
    <div class="h-title">⚕ Checagem &amp; Devolução de Produtos</div>
    <div class="h-sub">Relatório detalhado de pendências, solicitações e devoluções</div>
  </div>
  <div class="h-meta">Emitido: ${now}<br/>Total registros: ${rows.length}</div>
</div>
<div class="kpis">
  <div class="kpi" style="border-top:3px solid #0EA5E9"><div class="kpi-v" style="color:#0EA5E9">${new Set(rows.map(d => d.atendimento)).size}</div><div class="kpi-l">Atendimentos</div></div>
  <div class="kpi" style="border-top:3px solid #7C3AED"><div class="kpi-v" style="color:#7C3AED">${new Set(rows.map(d => d.paciente)).size}</div><div class="kpi-l">Pacientes</div></div>
  <div class="kpi" style="border-top:3px solid #D97706"><div class="kpi-v" style="color:#D97706">${totalNaoAdm}</div><div class="kpi-l">Não Administrado</div></div>
  <div class="kpi" style="border-top:3px solid #16A34A"><div class="kpi-v" style="color:#16A34A">${totalDevolvido}</div><div class="kpi-l">Devolvido</div></div>
  <div class="kpi" style="border-top:3px solid #DC2626"><div class="kpi-v" style="color:#DC2626">${totalPendente}</div><div class="kpi-l">Pendente</div></div>
  <div class="kpi" style="border-top:3px solid #0EA5E9"><div class="kpi-v" style="color:#0EA5E9">${taxa}%</div><div class="kpi-l">Taxa Devolução</div></div>
</div>
<div class="alerts">
  <div class="alert ad">⚠ <strong>${comAlta} registros</strong> com alta do paciente e itens ainda pendentes de devolução</div>
  <div class="alert aw">⚠ <strong>${semSolic} itens</strong> pendentes sem nenhuma solicitação de devolução registrada</div>
</div>
<table>
  <thead><tr>
    <th>Atendimento</th><th>Produto</th><th>Leito / Unidade</th>
    <th>Não Adm.</th><th>Devolvido</th><th>Pendente</th>
    <th>Status Detalhado</th><th>Prescrições</th><th>Alta</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="footer">
  <span>Sistema de Checagem e Devolução de Produtos — Uso interno</span>
  <span>Gerado automaticamente · ${now}</span>
</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`;
  const win = window.open("", "_blank", "width=1280,height=900");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ─── Upload Screen ────────────────────────────────────────────────────────────
function UploadScreen({ onData }: { onData: (rows: RowData[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const handle = (file: File | null | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => {
      const rows = parseCSV(e.target?.result as string);
      if (rows.length > 0) { setError(""); onData(rows); }
      else setError("Nenhum dado encontrado. Verifique se o arquivo usa separador ';'.");
    };
    r.readAsText(file, "ISO-8859-1");
  };
  return (
    <div style={{ minHeight: "60vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif", padding: 24 }}>
      <div style={{ marginBottom: 36, textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: T.accentDark, color: "#fff", borderRadius: 99, padding: "4px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>⚕ Sistema Hospitalar</div>
        <h1 style={{ fontSize: 34, fontWeight: 800, color: T.text, margin: "0 0 10px", lineHeight: 1.15 }}>Checagem & Devolução<br/><span style={{ color: T.accent }}>de Produtos</span></h1>
        <p style={{ color: T.sub, fontSize: 14, margin: 0 }}>Análise completa de pendências, devoluções e indicadores por unidade</p>
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, cursor: "pointer", width: "100%", maxWidth: 460, border: `2px dashed ${dragging ? T.accent : T.borderDark}`, borderRadius: 20, padding: "52px 48px", background: dragging ? "#EFF6FF" : T.card, transition: "all .2s", boxShadow: dragging ? `0 0 0 4px ${T.accent}22` : "0 2px 12px rgba(0,0,0,.06)" }}
      >
        <div style={{ fontSize: 52 }}>📋</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, color: T.text, fontSize: 16 }}>Arraste o CSV aqui</div>
          <div style={{ color: T.muted, fontSize: 13, marginTop: 4 }}>ou clique para selecionar o arquivo</div>
        </div>
        <div style={{ background: T.accent, color: "#fff", borderRadius: 10, padding: "10px 28px", fontWeight: 700, fontSize: 14 }}>Selecionar arquivo</div>
        <div style={{ color: T.muted, fontSize: 11 }}>Arquivo .csv com separador ";"</div>
        <input type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={(e) => handle(e.target.files?.[0])} />
      </label>
      {error && <div style={{ marginTop: 16, color: T.danger, background: T.dangerBg, border: `1px solid ${T.danger}44`, borderRadius: 10, padding: "10px 18px", fontSize: 13 }}>⚠ {error}</div>}
    </div>
  );
}

// ─── Dashboard Principal ──────────────────────────────────────────────────────
export function CheckagemDevolucao() {
  const [data, setData] = useState<RowData[] | null>(null);
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [filterUnidade, setFilterUnidade] = useState("Todas");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [sortCol, setSortCol] = useState<keyof RowData>("qtdePendente");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedRow, setSelectedRow] = useState<RowData | null>(null);

  const kpis = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    const totalNaoAdm = data.reduce((s, d) => s + d.totalNaoAdm, 0);
    const totalDevolvido = data.reduce((s, d) => s + d.totalDevolvido, 0);
    const totalPendente = data.reduce((s, d) => s + d.qtdePendente, 0);
    const taxa = totalNaoAdm > 0 ? parseFloat(((totalDevolvido / totalNaoAdm) * 100).toFixed(1)) : 0;
    const comAlta = data.filter((d) => d.alta?.length > 4 && d.qtdePendente > 0).length;
    const semSolic = data.filter((d) => d.solicitacoes.includes("SEM SOLICITACAO") && d.qtdePendente > 0).length;
    const regularizados = data.filter((d) => d.qtdePendente === 0).length;
    return { totalNaoAdm, totalDevolvido, totalPendente, taxa, comAlta, semSolic, regularizados };
  }, [data]);

  const { topProdutos, topUnidades, topLeitos, unidadeList } = useMemo(() => {
    if (!data) return { topProdutos: [] as [string, { pend: number; naoAdm: number; dev: number }][], topUnidades: [] as [string, { pend: number; itens: number; dev: number }][], topLeitos: [] as [string, { pend: number; unid: string }][], unidadeList: ["Todas"] };
    const prodMap: Record<string, { pend: number; naoAdm: number; dev: number }> = {};
    const unidMap: Record<string, { pend: number; itens: number; dev: number }> = {};
    const leitoMap: Record<string, { pend: number; unid: string }> = {};
    data.forEach((d) => {
      if (!prodMap[d.produto]) prodMap[d.produto] = { pend: 0, naoAdm: 0, dev: 0 };
      prodMap[d.produto].pend += d.qtdePendente; prodMap[d.produto].naoAdm += d.totalNaoAdm; prodMap[d.produto].dev += d.totalDevolvido;
      const u = d.unidade.split(" -")[0];
      if (!unidMap[u]) unidMap[u] = { pend: 0, itens: 0, dev: 0 };
      unidMap[u].pend += d.qtdePendente; unidMap[u].itens += 1; unidMap[u].dev += d.totalDevolvido;
      if (!leitoMap[d.leito]) leitoMap[d.leito] = { pend: 0, unid: d.unidade.split(" -")[0] };
      leitoMap[d.leito].pend += d.qtdePendente;
    });
    return {
      topProdutos: Object.entries(prodMap).sort((a, b) => b[1].pend - a[1].pend).slice(0, 10),
      topUnidades: Object.entries(unidMap).sort((a, b) => b[1].pend - a[1].pend),
      topLeitos: Object.entries(leitoMap).sort((a, b) => b[1].pend - a[1].pend).slice(0, 8),
      unidadeList: ["Todas", ...Object.keys(unidMap)],
    };
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter((d) => {
      const u = d.unidade.split(" -")[0];
      const s = getStatusInfo(d);
      return (filterUnidade === "Todas" || u === filterUnidade)
        && (filterStatus === "Todos" || s.label === filterStatus)
        && (!search || [d.produto, d.paciente, d.atendimento, d.leito].some((x) => x.toLowerCase().includes(search.toLowerCase())));
    }).sort((a, b) => {
      const va = (a[sortCol] as number) ?? 0;
      const vb = (b[sortCol] as number) ?? 0;
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [data, search, filterUnidade, filterStatus, sortCol, sortDir]);

  const toggleSort = (col: keyof RowData) => {
    if (sortCol === col) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  if (!data) return <UploadScreen onData={setData} />;

  const TabBtn = ({ id, label, count }: { id: string; label: string; count?: number }) => (
    <button onClick={() => setTab(id)} style={{ background: tab === id ? T.accent : "transparent", color: tab === id ? "#fff" : T.sub, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .15s", display: "flex", alignItems: "center", gap: 6 }}>
      {label}
      {count != null && <span style={{ background: tab === id ? "rgba(255,255,255,.25)" : T.cardAlt, borderRadius: 99, padding: "1px 7px", fontSize: 10 }}>{count}</span>}
    </button>
  );

  const SortTh = ({ col, label, center }: { col: keyof RowData; label: string; center?: boolean }) => (
    <th onClick={() => toggleSort(col)} style={{ padding: "11px 12px", textAlign: center ? "center" : "left", color: sortCol === col ? T.accentDark : T.muted, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, background: T.cardAlt, borderBottom: `2px solid ${T.border}`, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
      {label}{sortCol === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", color: T.text }}>
      {/* Header */}
      <div style={{ background: T.headerBg, padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 12px rgba(0,0,0,.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ background: T.accent, borderRadius: 10, padding: "6px 10px", fontSize: 18 }}>⚕</div>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>Sistema Hospitalar</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#F8FAFC" }}>Checagem & Devolução de Produtos</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748B" }}>{data.length} registros</span>
          <button onClick={() => exportPDF(filteredData.length > 0 ? filteredData : data)} style={{ background: T.accent, color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            📄 Exportar PDF
          </button>
          <button onClick={() => setData(null)} style={{ background: "#1E293B", color: "#94A3B8", border: "none", borderRadius: 9, padding: "9px 14px", fontSize: 12, cursor: "pointer" }}>↩ Novo arquivo</button>
        </div>
      </div>
      {/* Tabs */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "8px 32px", display: "flex", gap: 4 }}>
        <TabBtn id="overview" label="Visão Geral" />
        <TabBtn id="produtos" label="Produtos" count={topProdutos.length} />
        <TabBtn id="unidades" label="Unidades" count={topUnidades.length} />
        <TabBtn id="tabela" label="Registros" count={filteredData.length} />
      </div>
      <div style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>
        {/* ── OVERVIEW ── */}
        {tab === "overview" && (<>
          <Section title="Indicadores Principais">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 14 }}>
              <KPICard label="Atendimentos" value={new Set(data.map(d => d.atendimento)).size} sub="únicos" color={T.accent} icon="🏥" />
              <KPICard label="Pacientes" value={new Set(data.map(d => d.paciente)).size} sub="únicos" color={T.purple} icon="👤" bg={T.purpleBg} />
              <KPICard label="Não Administrado" value={kpis.totalNaoAdm} sub="unidades de produto" color={T.warn} icon="📦" bg={T.warnBg} />
              <KPICard label="Devolvido" value={kpis.totalDevolvido} sub={`${kpis.taxa}% do não adm.`} color={T.ok} icon="✅" bg={T.okBg} />
              <KPICard label="Pendente" value={kpis.totalPendente} sub="aguardando devolução" color={T.danger} icon="⚠️" bg={T.dangerBg} />
              <KPICard label="Regularizados" value={kpis.regularizados} sub="sem pendência" color={T.ok} icon="☑️" bg={T.okBg} />
            </div>
          </Section>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16 }}>📊 Eficiência de Devolução</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 42, fontWeight: 800, color: T.ok, lineHeight: 1 }}>{kpis.taxa}%</span>
                <span style={{ fontSize: 13, color: T.sub, paddingBottom: 6 }}>de taxa de devolução</span>
              </div>
              <div style={{ height: 14, background: T.cardAlt, borderRadius: 99, marginBottom: 20 }}>
                <div style={{ height: "100%", width: `${kpis.taxa}%`, background: `linear-gradient(90deg,${T.ok},${T.accent})`, borderRadius: 99 }} />
              </div>
              {[{ l: "Total Não Administrado", v: kpis.totalNaoAdm, c: T.warn }, { l: "Total Devolvido", v: kpis.totalDevolvido, c: T.ok }, { l: "Total Pendente de Devolução", v: kpis.totalPendente, c: T.danger }].map((x) => (
                <div key={x.l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 13, color: T.sub }}>{x.l}</span>
                  <span style={{ fontWeight: 700, color: x.c }}>{x.v}</span>
                </div>
              ))}
            </div>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16 }}>🛏 Top Leitos — Pendências</div>
              {topLeitos.map(([leito, info], i) => (
                <MiniBar key={leito} label={`${leito} · ${info.unid}`} value={info.pend} max={topLeitos[0]?.[1]?.pend || 1} color={i === 0 ? T.danger : i < 3 ? T.warn : T.accent} />
              ))}
            </div>
          </div>
          <Section title="Alertas e Prioridades">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
              {[
                { icon: "🔴", title: "Alta com Pendência Crítica", val: kpis.comAlta, desc: "registros de pacientes com alta e itens ainda pendentes de devolução.", color: T.danger, bg: T.dangerBg },
                { icon: "🟡", title: "Sem Solicitação Registrada", val: kpis.semSolic, desc: "itens pendentes sem nenhuma solicitação de devolução criada.", color: T.warn, bg: T.warnBg },
                { icon: "🟢", title: "Devoluções Regularizadas", val: kpis.regularizados, desc: "registros com devolução completamente resolvida.", color: T.ok, bg: T.okBg },
              ].map((a) => (
                <div key={a.title} style={{ background: a.bg, border: `1px solid ${a.color}33`, borderRadius: 14, padding: 20 }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{a.icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: a.color, marginBottom: 4 }}>{a.val}</div>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: 13, marginBottom: 6 }}>{a.title}</div>
                  <div style={{ color: T.sub, fontSize: 12, lineHeight: 1.6 }}>{a.val} {a.desc}</div>
                </div>
              ))}
            </div>
          </Section>
        </>)}
        {/* ── PRODUTOS ── */}
        {tab === "produtos" && (
          <Section title="Top 10 Produtos com Maior Pendência">
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
              {topProdutos.map(([prod, vals], i) => (
                <div key={prod} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: i < topProdutos.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
                      <span style={{ minWidth: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: i === 0 ? T.danger : i < 3 ? T.warn : T.cardAlt, fontSize: 12, fontWeight: 800, color: i < 3 ? "#fff" : T.muted, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 13, color: T.text, fontWeight: 600, lineHeight: 1.4 }}>{prod}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Badge color={T.warn} bg={T.warnBg}>Não adm: {vals.naoAdm}</Badge>
                      <Badge color={T.ok} bg={T.okBg}>Dev: {vals.dev}</Badge>
                      <Badge color={T.danger} bg={T.dangerBg}>Pend: {vals.pend}</Badge>
                    </div>
                  </div>
                  <div style={{ height: 8, background: T.cardAlt, borderRadius: 99 }}>
                    <div style={{ height: "100%", width: `${(vals.pend / (topProdutos[0]?.[1]?.pend || 1)) * 100}%`, background: i === 0 ? T.danger : i < 3 ? T.warn : T.accent, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
        {/* ── UNIDADES ── */}
        {tab === "unidades" && (
          <Section title="Pendências por Unidade">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
              {topUnidades.map(([unid, vals]) => {
                const total = vals.pend + vals.dev;
                const pct = total > 0 ? Math.round((vals.dev / total) * 100) : 0;
                const cor = pct >= 70 ? T.ok : pct >= 40 ? T.warn : T.danger;
                return (
                  <div key={unid} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: T.text, marginBottom: 14 }}>{unid}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
                      {[{ l: "Itens", v: vals.itens, c: T.accent }, { l: "Pendente", v: vals.pend, c: T.danger }, { l: "Devolvido", v: vals.dev, c: T.ok }].map((x) => (
                        <div key={x.l} style={{ textAlign: "center", background: T.cardAlt, borderRadius: 8, padding: "10px 6px" }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: x.c }}>{x.v}</div>
                          <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: 1 }}>{x.l}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: T.muted }}>Taxa de devolução</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cor }}>{pct}%</span>
                    </div>
                    <div style={{ height: 7, background: T.cardAlt, borderRadius: 99 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: cor, borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}
        {/* ── TABELA ── */}
        {tab === "tabela" && (
          <Section title="Registros Detalhados">
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍  Buscar produto, atendimento, leito..." style={{ flex: 1, minWidth: 240, background: T.card, border: `1px solid ${T.borderDark}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontFamily: "inherit", fontSize: 13, outline: "none" }} />
              <select value={filterUnidade} onChange={(e) => setFilterUnidade(e.target.value)} style={{ background: T.card, border: `1px solid ${T.borderDark}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontFamily: "inherit", fontSize: 13, outline: "none" }}>
                {unidadeList.map((u) => <option key={u}>{u}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ background: T.card, border: `1px solid ${T.borderDark}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontFamily: "inherit", fontSize: 13, outline: "none" }}>
                {["Todos", "Alta c/ Pendência", "Sem Solicitação", "Em Andamento", "Aguardando", "Regularizado"].map((s) => <option key={s}>{s}</option>)}
              </select>
              <button onClick={() => exportPDF(filteredData)} style={{ background: T.accentDark, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📄 PDF desta seleção</button>
              <span style={{ fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>{filteredData.length} registros</span>
            </div>
            <div style={{ overflowX: "auto", borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 6px rgba(0,0,0,.06)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <SortTh col="atendimento" label="Atendimento" />
                    <th style={{ padding: "11px 12px", textAlign: "left", color: T.muted, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, background: T.cardAlt, borderBottom: `2px solid ${T.border}` }}>Produto</th>
                    <th style={{ padding: "11px 12px", textAlign: "left", color: T.muted, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, background: T.cardAlt, borderBottom: `2px solid ${T.border}` }}>Leito / Unidade</th>
                    <SortTh col="totalNaoAdm" label="Não Adm." center />
                    <SortTh col="totalDevolvido" label="Devolvido" center />
                    <SortTh col="qtdePendente" label="Pendente" center />
                    <th style={{ padding: "11px 12px", textAlign: "left", color: T.muted, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, background: T.cardAlt, borderBottom: `2px solid ${T.border}`, minWidth: 200 }}>Status Detalhado</th>
                    <th style={{ padding: "11px 12px", textAlign: "left", color: T.muted, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, background: T.cardAlt, borderBottom: `2px solid ${T.border}` }}>Alta</th>
                    <th style={{ padding: "11px 12px", background: T.cardAlt, borderBottom: `2px solid ${T.border}`, width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((d, i) => {
                    const s = getStatusInfo(d);
                    const sols = parseSolicitacoes(d.solicitacoes);
                    const prescs = parsePrescricoes(d.prescricao);
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? T.card : T.bg, borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: "12px 12px", color: T.accentDark, fontWeight: 700, whiteSpace: "nowrap" }}>{d.atendimento}</td>
                        <td style={{ padding: "12px 12px", maxWidth: 250 }}>
                          <div style={{ fontWeight: 600, color: T.text, lineHeight: 1.4, fontSize: 12 }}>{d.produto}</div>
                          <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>Cód: {d.codProduto}</div>
                        </td>
                        <td style={{ padding: "12px 12px", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 700, color: T.purple }}>{d.leito}</div>
                          <div style={{ fontSize: 10, color: T.muted }}>{d.unidade.split(" -")[0]}</div>
                        </td>
                        <td style={{ padding: "12px 12px", textAlign: "center" }}><Badge color={T.warn} bg={T.warnBg}>{d.totalNaoAdm}</Badge></td>
                        <td style={{ padding: "12px 12px", textAlign: "center" }}><Badge color={T.ok} bg={T.okBg}>{d.totalDevolvido}</Badge></td>
                        <td style={{ padding: "12px 12px", textAlign: "center" }}><Badge color={d.qtdePendente > 0 ? T.danger : T.ok} bg={d.qtdePendente > 0 ? T.dangerBg : T.okBg}>{d.qtdePendente}</Badge></td>
                        <td style={{ padding: "10px 12px", minWidth: 200 }}>
                          <div style={{ marginBottom: sols.length > 0 ? 6 : 0 }}>
                            <Badge color={s.color} bg={s.bg}>{s.icon} {s.label}</Badge>
                          </div>
                          {sols.length > 0 && sols.map((sol, si) => (
                            <div key={si} style={{ fontSize: 11, color: T.sub, lineHeight: 1.7, paddingLeft: 2 }}>
                              <span style={{ color: T.accent, fontWeight: 700 }}>#{sol.id}</span>
                              {" "}<span style={{ fontWeight: 700, color: sol.status === "ATENDIDO" ? T.ok : T.warn }}>{sol.status}</span>
                              {sol.data && <span style={{ color: T.muted }}> · {sol.data}</span>}
                              {sol.qtde && <span style={{ color: T.muted }}> · qtde: {sol.qtde}</span>}
                              {sol.usuario && <span style={{ color: T.muted, display: "block", paddingLeft: 14, fontSize: 10 }}>usuário: {sol.usuario}</span>}
                            </div>
                          ))}
                          {sols.length === 0 && d.qtdePendente > 0 && (
                            <div style={{ fontSize: 10, color: T.warn, marginTop: 4, fontWeight: 600 }}>Nenhuma solicitação criada</div>
                          )}
                          <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{prescs.length} prescrição(ões)</div>
                        </td>
                        <td style={{ padding: "12px 12px", whiteSpace: "nowrap" }}>
                          {d.alta ? <span style={{ fontSize: 11, color: T.warn, fontWeight: 600 }}>🏠 {d.alta.substring(0, 10)}</span> : <span style={{ color: T.muted }}>—</span>}
                        </td>
                        <td style={{ padding: "12px 12px" }}>
                          <button onClick={() => setSelectedRow(d)} style={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: T.accentDark, fontWeight: 700 }}>Detalhar →</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredData.length === 0 && <div style={{ textAlign: "center", padding: 48, color: T.muted, fontSize: 14 }}>Nenhum registro encontrado com os filtros aplicados.</div>}
            </div>
          </Section>
        )}
      </div>
      {selectedRow && <StatusModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #F1F5F9; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
        select option { background: #fff; color: #0F172A; }
        tbody tr:hover td { background: #EFF6FF !important; }
        input:focus { border-color: #0EA5E9 !important; box-shadow: 0 0 0 3px #0EA5E922; }
      `}</style>
    </div>
  );
}
