/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from "recharts";

// ─── PARSE 7400 ──────────────────────────────────────────────────────────────
function parseCSV(text: string) {
  const lines = text.split(/\r?\n/);
  const meta: Record<string, string> = {};
  for (let i = 0; i < 6; i++) {
    const l = lines[i];
    if (l.includes("Data Inicial:")) meta.dataInicial = l.split("Data Inicial:")[1]?.trim().replace(/;.*/,"").trim();
    if (l.includes("Data Final:"))   meta.dataFinal   = l.split("Data Final:")[1]?.trim().replace(/;.*/,"").trim();
    if (l.includes("Informe o estoque::")) meta.estoque = l.split("::")[1]?.trim().replace(/;.*/,"").trim();
    if (l.includes("Empresa::"))     meta.empresa     = l.split("::")[1]?.trim().replace(/;.*/,"").trim();
  }
  let headerIdx = -1;
  for (let i = 0; i < 10; i++) {
    if (lines[i].includes("Código Solicitação")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return null;
  const headers = lines[headerIdx].split(";");
  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const parts = lines[i].split(";");
    if (parts.length < 20) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h.trim()] = parts[idx]?.trim() || ""; });
    if (row["Status"] && row["Produto"]) rows.push(row);
  }
  return { meta, rows };
}

function build7400Lookup(rows: Record<string, string>[]) {
  const map: Record<string, any[]> = {};
  rows.forEach(r => {
    const atend = r["Atendimento"];
    const cod   = r["Código Produto"];
    if (!atend || !cod) return;
    const key = `${atend}__${cod}`;
    if (!map[key]) map[key] = [];
    map[key].push({
      solicitacao7400: r["Código Solicitação"],
      status:   r["Status"],
      qtdSol:   r["Qtd Solicitada"],
      qtdDisp:  r["Qtd Dispensada"],
      saldo:    r["Saldo"],
      produto7400: r["Produto"],
    });
  });
  return map;
}

// ─── PARSE R_CONS_PAC ─────────────────────────────────────────────────────────
function parsePACLine(line: string): string[] {
  line = line.trimEnd();
  const cols: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { cols.push(cur); cur = ""; }
    else cur += c;
  }
  cols.push(cur);
  if (cols.length === 1 && cols[0].length > 10) {
    return parsePACLine(cols[0]);
  }
  return cols;
}

function parsePAC(text: string) {
  const lines = text.split(/\r?\n/);
  const records: any[] = [];
  let atend = "", pac = "", med = "";
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    if (s.startsWith("Atendimento:")) {
      const p = s.split(","); atend = (p[3] || "").trim(); continue;
    }
    if (s.startsWith("Paciente:")) {
      const p = s.split(","); pac = (p[3] || "").trim(); continue;
    }
    if (s.startsWith(",M") && s.includes("dico:")) {
      const p = s.split(","); med = (p[2] || p[3] || "").trim(); continue;
    }
    const cols = parsePACLine(line);
    while (cols.length < 22) cols.push("");
    const prodRaw = cols[11].trim();
    const sol     = cols[7].trim();
    if (!prodRaw || !sol) continue;
    if (s.includes("Total:") || prodRaw.startsWith("Produto") || prodRaw.startsWith("Dt.")) continue;
    const m = prodRaw.match(/^(\d+)\s*-\s*(.+)/);
    const codProduto = m ? m[1] : "";
    const produto    = m ? m[2].trim() : prodRaw;
    const qtd = parseFloat(cols[18].trim().replace(",",".")) || 0;
    records.push({
      atendimento: atend, paciente: pac, medico: med,
      dtMvto: cols[0].trim(), mvto: cols[2].trim(),
      solicitacaoPAC: sol, prescricao: cols[8].trim(),
      codProduto, produto,
      lote: cols[12].trim(), validade: cols[15].trim(),
      qtdPAC: qtd, unidade: cols[16].trim(),
    });
  }
  return records;
}

function crossRef(pacRecords: any[], lookup: Record<string, any[]>) {
  return pacRecords.map(r => {
    const key = `${r.atendimento}__${r.codProduto}`;
    const hits = lookup[key];
    if (hits && hits.length > 0) {
      const h = hits[0];
      const qtdPAC  = r.qtdPAC;
      const qtdDisp = parseFloat(h.qtdDisp) || 0;
      const diffQtd = qtdDisp - qtdPAC;
      return {
        ...r, ...h,
        matched: true,
        diffQtd,
        lotePresente: !!r.lote,
        divergenciaQtd: Math.abs(diffQtd) > 0,
      };
    }
    return { ...r, matched: false, status: "Sem correspondência no 7400", qtdSol: "—", qtdDisp: "—", saldo: "—", produto7400: "—", solicitacao7400: "—", diffQtd: null };
  });
}

// ─── THEME ───────────────────────────────────────────────────────────────────
const T = {
  bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", border2: "#f1f5f9",
  text: "#0f172a", text2: "#475569", text3: "#94a3b8",
  input: "#f1f5f9", rowAlt: "#f8fafc",
};

const STATUS_CONFIG: Record<string, { color: string; light: string; border: string; short?: string }> = {
  "Item dispensado totalmente": { color: "#059669", light: "#d1fae5", border: "#6ee7b7" },
  "Item não dispensado":        { color: "#dc2626", light: "#fee2e2", border: "#fca5a5" },
  "Item dispensado a mais":     { color: "#d97706", light: "#fef3c7", border: "#fcd34d" },
  "Item dispensado a menos":    { color: "#7c3aed", light: "#ede9fe", border: "#c4b5fd" },
  "Sem correspondência no 7400":{ color: "#64748b", light: "#f1f5f9", border: "#cbd5e1" },
};
const scfg = (s: string) => STATUS_CONFIG[s] || { color: "#64748b", light: "#f1f5f9", border: "#cbd5e1" };

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color, light, icon }: any) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 1px 4px #0000000a", borderTop: `3px solid ${color}` }}>
      <div style={{ background: light, borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "'Syne', sans-serif", letterSpacing: -1, marginTop: 6 }}>
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
      <div style={{ fontSize: 13, color: T.text2, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function SecTitle({ children, accent }: any) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <div style={{ width: 4, height: 16, borderRadius: 2, background: accent || "#0284c7" }} />
      <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 14, color: T.text }}>{children}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = scfg(status);
  return (
    <span style={{ background: cfg.light, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}

const Tip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", boxShadow: "0 4px 20px #00000015" }}>
      <div style={{ color: T.text2, fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p: any, i: number) => <div key={i} style={{ color: p.fill || p.color || T.text, fontSize: 13, fontWeight: 600 }}>{p.name}: {Number(p.value).toLocaleString("pt-BR")}</div>)}
    </div>
  );
};

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 22, boxShadow: "0 1px 4px #0000000a" };

const PBtn = ({ children, onClick, disabled }: any) => (
  <button onClick={onClick} disabled={disabled} style={{ background: T.card, border: `1px solid ${T.border}`, color: disabled ? T.text3 : T.text2, borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: disabled ? "not-allowed" : "pointer" }}>{children}</button>
);

// ─── UPLOAD SCREEN ───────────────────────────────────────────────────────────
function UploadScreen({ onData }: { onData: (d: any) => void }) {
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const handle = (file: File | null) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = e => {
      const parsed = parseCSV((e.target as any).result);
      if (!parsed || !parsed.rows.length) { setError("Arquivo inválido."); return; }
      onData(parsed);
    };
    r.readAsText(file, "ISO-8859-1");
  };
  return (
    <div style={{ minHeight: "60vh", background: "linear-gradient(135deg,#f0f9ff,#e0f2fe 50%,#f0fdf4)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", borderRadius: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={{ textAlign: "center", maxWidth: 500, width: "90%" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>💊</div>
        <h1 style={{ color: "#0f172a", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 36, margin: "0 0 8px", lineHeight: 1.1 }}>
          Análise<br /><span style={{ color: "#0284c7" }}>Dispensação V2</span>
        </h1>
        <p style={{ color: "#64748b", marginTop: 10, fontSize: 15, marginBottom: 28 }}>Indicador 7400 — Solicitações × Materiais Dispensados</p>
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
          onClick={() => document.getElementById("csv-inp-v2")?.click()}
          style={{ border: `2px dashed ${drag ? "#0284c7" : "#bae6fd"}`, borderRadius: 20, padding: "48px 32px", background: drag ? "#e0f2fe" : "#fff", cursor: "pointer", transition: "all .2s", boxShadow: "0 2px 12px #00000008" }}>
          <input id="csv-inp-v2" type="file" accept=".csv,.CSV" style={{ display: "none" }} onChange={e => handle(e.target.files?.[0] ?? null)} />
          <div style={{ fontSize: 46, marginBottom: 12 }}>📂</div>
          <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Arraste o CSV aqui ou clique para selecionar</div>
          <div style={{ color: "#94a3b8", fontSize: 13 }}>Exportação do indicador 7400 (.CSV)</div>
        </div>
        {error && <div style={{ color: "#dc2626", marginTop: 12, fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  );
}

// ─── CRUZAMENTO PANEL ────────────────────────────────────────────────────────
function CruzamentoPanel({ crossed, onClose }: { crossed: any[]; onClose: () => void }) {
  const [search, setSearch]   = useState("");
  const [fStatus, setFStatus] = useState("todos");
  const [fMatch, setFMatch]   = useState("todos");
  const [page, setPage]       = useState(0);
  const PAGE = 20;

  const statusCount = useMemo(() => {
    const c: Record<string, number> = {};
    crossed.forEach(r => { c[r.status] = (c[r.status]||0)+1; });
    return c;
  }, [crossed]);

  const matched   = crossed.filter(r => r.matched).length;
  const unmatched = crossed.filter(r => !r.matched).length;
  const divQtd    = crossed.filter(r => r.matched && r.divergenciaQtd).length;

  const filtered = useMemo(() => {
    let f = crossed;
    if (fStatus !== "todos") f = f.filter(r => r.status === fStatus);
    if (fMatch  === "matched")   f = f.filter(r => r.matched);
    if (fMatch  === "unmatched") f = f.filter(r => !r.matched);
    if (fMatch  === "diverge")   f = f.filter(r => r.matched && r.divergenciaQtd);
    if (search) {
      const q = search.toLowerCase();
      f = f.filter(r => r.produto?.toLowerCase().includes(q) || r.paciente?.toLowerCase().includes(q) || r.atendimento?.includes(q) || r.lote?.toLowerCase().includes(q));
    }
    return f;
  }, [crossed, fStatus, fMatch, search]);

  const totalPages = Math.ceil(filtered.length / PAGE);
  const paged = filtered.slice(page * PAGE, (page+1) * PAGE);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000055", zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
      <div style={{ background: T.bg, borderRadius: 20, width: "100%", maxWidth: 1300, boxShadow: "0 20px 60px #00000030" }}>
        <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, borderRadius: "20px 20px 0 0", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: T.text }}>🔗 Cruzamento R_CONS_PAC × 7400</div>
            <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>Solicitação · Quantidade · Lote</div>
          </div>
          <button onClick={onClose} style={{ background: "#fee2e2", border: "none", color: "#dc2626", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>✕ Fechar</button>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
            <KPICard label="Total de Itens" value={crossed.length} icon="📋" color="#0284c7" light="#e0f2fe" />
            <KPICard label="Cruzados c/ êxito" value={matched} icon="✅" color="#059669" light="#d1fae5" sub={`${(matched/crossed.length*100).toFixed(1)}% localizados`} />
            <KPICard label="Sem correspondência" value={unmatched} icon="❓" color="#64748b" light="#f1f5f9" sub="Não achado no 7400" />
            <KPICard label="Divergência de Qtd" value={divQtd} icon="⚠️" color="#d97706" light="#fef3c7" sub="Qtd PAC ≠ Qtd dispensada" />
            <KPICard label="Dispensado Totalmente" value={statusCount["Item dispensado totalmente"]||0} icon="💊" color="#059669" light="#d1fae5" />
            <KPICard label="Não Dispensados" value={statusCount["Item não dispensado"]||0} icon="🚫" color="#dc2626" light="#fee2e2" />
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="🔍  Produto, paciente, atendimento, lote..."
              style={{ flex: 1, minWidth: 240, background: T.input, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 13px", color: T.text, fontSize: 13, outline: "none" }} />
            <select value={fStatus} onChange={e => { setFStatus(e.target.value); setPage(0); }}
              style={{ background: T.input, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 13px", color: T.text, fontSize: 13, outline: "none" }}>
              <option value="todos">Todos os status</option>
              {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={fMatch} onChange={e => { setFMatch(e.target.value); setPage(0); }}
              style={{ background: T.input, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 13px", color: T.text, fontSize: 13, outline: "none" }}>
              <option value="todos">Todos</option>
              <option value="matched">Cruzados</option>
              <option value="unmatched">Sem correspondência</option>
              <option value="diverge">Com divergência de qtd</option>
            </select>
            <div style={{ background: T.input, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 13px", color: T.text2, fontSize: 13 }}>
              {filtered.length.toLocaleString("pt-BR")} resultados
            </div>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.rowAlt, borderBottom: `2px solid ${T.border}` }}>
                    {["Atendimento","Paciente","Produto (PAC)","Sol. PAC","Lote (PAC)","Validade","Qtd PAC","Qtd Sol. 7400","Qtd Disp.","Saldo","Dif. Qtd","Status"].map(h => (
                      <th key={h} style={{ padding: "10px 11px", textAlign: "left", color: T.text2, fontWeight: 700, whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r, i) => {
                    const dif = r.diffQtd;
                    const difColor = dif == null ? T.text3 : dif > 0 ? "#d97706" : dif < 0 ? "#dc2626" : "#059669";
                    const difLabel = dif == null ? "—" : dif > 0 ? `+${dif}` : dif < 0 ? `${dif}` : "=";
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${T.border2}`, background: i%2===0?T.rowAlt:"#fff" }}>
                        <td style={{ padding: "7px 11px", color: "#0284c7", fontWeight: 700, whiteSpace: "nowrap" }}>{r.atendimento || "—"}</td>
                        <td style={{ padding: "7px 11px", color: T.text2, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.paciente}>{r.paciente || "—"}</td>
                        <td style={{ padding: "7px 11px", color: T.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.produto}>{r.produto}</td>
                        <td style={{ padding: "7px 11px", color: "#6366f1", fontWeight: 600, whiteSpace: "nowrap" }}>{r.solicitacaoPAC}</td>
                        <td style={{ padding: "7px 11px", whiteSpace: "nowrap" }}>
                          {r.lote
                            ? <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>{r.lote}</span>
                            : <span style={{ color: T.text3 }}>—</span>}
                        </td>
                        <td style={{ padding: "7px 11px", color: T.text3, whiteSpace: "nowrap" }}>{r.validade || "—"}</td>
                        <td style={{ padding: "7px 11px", textAlign: "right", color: "#6366f1", fontWeight: 700 }}>{r.qtdPAC ?? "—"}</td>
                        <td style={{ padding: "7px 11px", textAlign: "right", color: T.text2 }}>{r.qtdSol || "—"}</td>
                        <td style={{ padding: "7px 11px", textAlign: "right", color: "#059669", fontWeight: 700 }}>{r.qtdDisp || "—"}</td>
                        <td style={{ padding: "7px 11px", textAlign: "right", color: parseFloat(r.saldo)<0?"#dc2626":parseFloat(r.saldo)>0?"#d97706":T.text3, fontWeight: 600 }}>{r.saldo || "—"}</td>
                        <td style={{ padding: "7px 11px", textAlign: "right", fontWeight: 800, color: difColor }}>
                          {dif != null
                            ? <span style={{ background: dif===0?"#d1fae5":dif>0?"#fef3c7":"#fee2e2", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>{difLabel}</span>
                            : "—"}
                        </td>
                        <td style={{ padding: "7px 11px", whiteSpace: "nowrap" }}><StatusBadge status={r.status} /></td>
                      </tr>
                    );
                  })}
                  {paged.length === 0 && <tr><td colSpan={12} style={{ padding: 32, textAlign: "center", color: T.text3 }}>Nenhum resultado.</td></tr>}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: `1px solid ${T.border}`, background: T.rowAlt }}>
                <span style={{ fontSize: 12, color: T.text2 }}>Página {page+1} de {totalPages} · {filtered.length.toLocaleString("pt-BR")} itens</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {([["«",0],["‹",page-1],["›",page+1],["»",totalPages-1]] as [string,number][]).map(([l,t],i) => {
                    const dis = t<0||t>=totalPages||t===page;
                    return <PBtn key={i} onClick={()=>!dis&&setPage(t)} disabled={dis}>{l}</PBtn>;
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({ data, onReset }: { data: any; onReset: () => void }) {
  const { meta, rows } = data;
  const [activeTab, setActiveTab]   = useState("visao-geral");
  const [searchProd, setSearchProd] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [sortCol, setSortCol]       = useState("dispensadaMais");
  const [sortDir, setSortDir]       = useState<"asc"|"desc">("desc");
  const [tablePage, setTablePage]   = useState(0);
  const [pacData, setPacData]       = useState<any[] | null>(null);
  const [showCruz, setShowCruz]     = useState(false);
  const [loadingPAC, setLoadingPAC] = useState(false);
  const PAGE_SIZE = 15;

  const statusCount = useMemo(() => { const c: Record<string,number>={}; rows.forEach((r: any)=>{ c[r.Status]=(c[r.Status]||0)+1; }); return c; }, [rows]);
  const totalSol  = useMemo(()=>rows.reduce((s: number,r: any)=>s+(parseFloat(r["Qtd Solicitada"])||0),0),[rows]);
  const totalDisp = useMemo(()=>rows.reduce((s: number,r: any)=>s+(parseFloat(r["Qtd Dispensada"])||0),0),[rows]);
  const uniqueSol      = useMemo(()=>new Set(rows.map((r: any)=>r["Código Solicitação"])).size,[rows]);
  const uniqueAtend    = useMemo(()=>new Set(rows.map((r: any)=>r["Atendimento"]).filter(Boolean)).size,[rows]);
  const uniqueProd     = useMemo(()=>new Set(rows.map((r: any)=>r["Produto"])).size,[rows]);
  const uniqueSolicitantes = useMemo(()=>new Set(rows.map((r: any)=>r["Usuário Solicitação"]).filter(Boolean)).size,[rows]);
  const saldoNeg  = useMemo(()=>rows.filter((r: any)=>r.Status==="Item não dispensado"||r.Status==="Item dispensado a menos").reduce((s: number,r: any)=>s+Math.abs(parseFloat(r.Saldo)||0),0),[rows]);
  const saldoPos  = useMemo(()=>rows.filter((r: any)=>r.Status==="Item dispensado a mais").reduce((s: number,r: any)=>s+Math.abs(parseFloat(r.Saldo)||0),0),[rows]);
  const divTotal  = useMemo(()=>rows.reduce((s: number,r: any)=>s+Math.abs((parseFloat(r["Qtd Solicitada"])||0)-(parseFloat(r["Qtd Dispensada"])||0)),0),[rows]);
  const taxaAcerto = rows.length>0?((statusCount["Item dispensado totalmente"]||0)/rows.length*100):0;
  const taxaNao    = rows.length>0?((statusCount["Item não dispensado"]||0)/rows.length*100):0;
  const taxaMais   = rows.length>0?((statusCount["Item dispensado a mais"]||0)/rows.length*100):0;
  const taxaMenos  = rows.length>0?((statusCount["Item dispensado a menos"]||0)/rows.length*100):0;

  const byProduct = useMemo(()=>{
    const m: Record<string,any> = {};
    rows.forEach((r: any)=>{
      const p=r["Produto"]||"—";
      if(!m[p]) m[p]={produto:p,solicitada:0,dispensada:0,dispensadaMais:0,dispensadaMenos:0,naoDispensado:0,total:0,count:0};
      m[p].solicitada+=parseFloat(r["Qtd Solicitada"])||0;
      m[p].dispensada+=parseFloat(r["Qtd Dispensada"])||0;
      m[p].count++;
      if(r.Status==="Item dispensado a mais")     m[p].dispensadaMais++;
      if(r.Status==="Item dispensado a menos")    m[p].dispensadaMenos++;
      if(r.Status==="Item não dispensado")        m[p].naoDispensado++;
      if(r.Status==="Item dispensado totalmente") m[p].total++;
    });
    return Object.values(m);
  },[rows]);

  const byHour = useMemo(()=>{
    const m: Record<string,any>={};
    rows.forEach((r: any)=>{
      const h=(r["Hora Pedido"]||"00").slice(0,2);
      if(!m[h]) m[h]={hora:h+"h",count:0,dispensadaMais:0,naoDispensado:0,dispensadoTotal:0};
      m[h].count++;
      if(r.Status==="Item dispensado a mais")     m[h].dispensadaMais++;
      if(r.Status==="Item não dispensado")        m[h].naoDispensado++;
      if(r.Status==="Item dispensado totalmente") m[h].dispensadoTotal++;
    });
    return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0])).map(([,v])=>v);
  },[rows]);

  const byUser = useMemo(()=>{
    const m: Record<string,any>={};
    rows.forEach((r: any)=>{
      const u=r["Usuário Solicitação"]||"—";
      if(!m[u]) m[u]={usuario:u,count:0,dispensadaMais:0,naoDispensado:0,dispensadoTotal:0};
      m[u].count++;
      if(r.Status==="Item dispensado a mais")     m[u].dispensadaMais++;
      if(r.Status==="Item não dispensado")        m[u].naoDispensado++;
      if(r.Status==="Item dispensado totalmente") m[u].dispensadoTotal++;
    });
    return Object.values(m).sort((a,b)=>b.count-a.count).slice(0,8);
  },[rows]);

  const byMovimentador = useMemo(()=>{
    const m: Record<string,any>={};
    rows.forEach((r: any)=>{
      const u=r["Usuário Movimentação Estoque"]||"—";
      if(!m[u]) m[u]={usuario:u,count:0,dispensadaMais:0,naoDispensado:0};
      m[u].count++;
      if(r.Status==="Item dispensado a mais") m[u].dispensadaMais++;
      if(r.Status==="Item não dispensado")    m[u].naoDispensado++;
    });
    return Object.values(m).sort((a,b)=>b.count-a.count).slice(0,8);
  },[rows]);

  const byAtendimento = useMemo(()=>{
    const m: Record<string,any>={};
    rows.forEach((r: any)=>{
      const a=r["Atendimento"]||"—";
      if(!m[a]) m[a]={atendimento:a,count:0,naoDispensado:0,dispensadaMais:0,dispensadoTotal:0};
      m[a].count++;
      if(r.Status==="Item não dispensado")        m[a].naoDispensado++;
      if(r.Status==="Item dispensado a mais")     m[a].dispensadaMais++;
      if(r.Status==="Item dispensado totalmente") m[a].dispensadoTotal++;
    });
    return Object.values(m).sort((a,b)=>b.naoDispensado-a.naoDispensado).slice(0,10);
  },[rows]);

  const byTipo = useMemo(()=>{
    const m: Record<string,number>={};
    rows.forEach((r: any)=>{ const t=r["Tipo Solicitação"]||"—"; m[t]=(m[t]||0)+1; });
    return Object.entries(m).map(([tipo,count])=>({tipo,count})).sort((a,b)=>b.count-a.count);
  },[rows]);

  const pieData = useMemo(()=>
    Object.entries(statusCount).filter(([k])=>k).map(([k,v])=>({
      name: STATUS_CONFIG[k]?.short || k.replace("Item ",""), value: v as number, color: STATUS_CONFIG[k]?.color||"#94a3b8"
    })),[statusCount]);

  // ── CRUZAMENTO POR SOLICITAÇÃO + PRODUTO ────────────────────────────────────
  // Agrupa por (Código Solicitação + Produto): detecta o MESMO produto na
  // mesma solicitação com status "a mais" E "a menos" → possível falso resultado
  const cruzSolic = useMemo(() => {
    if (!rows.length) return null;
    type ProdPair = {
      solicitacao: string; atendimento: string; usuario: string; produto: string;
      rowAMais: any[]; rowAMenos: any[]; rowNaoDisp: any[];
      qtdSol: number; qtdDispMais: number; qtdDispMenos: number;
      saldoMais: number; saldoMenos: number; netSaldo: number;
    };
    const map: Record<string, ProdPair> = {};
    rows.forEach((r: any) => {
      const s = r["Código Solicitação"];
      const p = r["Produto"] || "";
      if (!s || !p) return;
      const key = `${s}||${p}`;
      if (!map[key]) map[key] = {
        solicitacao: s, atendimento: r["Atendimento"]||"",
        usuario: r["Usuário Solicitação"]||"", produto: p,
        rowAMais: [], rowAMenos: [], rowNaoDisp: [],
        qtdSol: 0, qtdDispMais: 0, qtdDispMenos: 0,
        saldoMais: 0, saldoMenos: 0, netSaldo: 0,
      };
      if (r.Status === "Item dispensado a mais")  map[key].rowAMais.push(r);
      if (r.Status === "Item dispensado a menos") map[key].rowAMenos.push(r);
      if (r.Status === "Item não dispensado")     map[key].rowNaoDisp.push(r);
    });
    Object.values(map).forEach(g => {
      const allRows = [...g.rowAMais, ...g.rowAMenos, ...g.rowNaoDisp];
      g.qtdSol       = allRows.length > 0 ? (parseFloat(allRows[0]["Qtd Solicitada"])||0) : 0;
      g.qtdDispMais  = g.rowAMais.reduce((a: number, r: any) => a + (parseFloat(r["Qtd Dispensada"])||0), 0);
      g.qtdDispMenos = [...g.rowAMenos, ...g.rowNaoDisp].reduce((a: number, r: any) => a + (parseFloat(r["Qtd Dispensada"])||0), 0);
      g.saldoMais    = g.rowAMais.reduce((a: number, r: any) => a + Math.abs(parseFloat(r.Saldo)||0), 0);
      g.saldoMenos   = [...g.rowAMenos, ...g.rowNaoDisp].reduce((a: number, r: any) => a + Math.abs(parseFloat(r.Saldo)||0), 0);
      g.netSaldo     = g.saldoMais - g.saldoMenos;
    });
    const all = Object.values(map);
    // Pares: mesmo produto, mesma solicitação, com A MAIS e A MENOS/NÃO DISP.
    const pares    = all.filter(g => g.rowAMais.length > 0 && (g.rowAMenos.length > 0 || g.rowNaoDisp.length > 0));
    const soAMais  = all.filter(g => g.rowAMais.length > 0 && g.rowAMenos.length === 0 && g.rowNaoDisp.length === 0);
    const soAMenos = all.filter(g => g.rowAMais.length === 0 && (g.rowAMenos.length > 0 || g.rowNaoDisp.length > 0));
    const falsoResultado = pares.filter(g => g.netSaldo <= 0);
    const desvioReal     = pares.filter(g => g.netSaldo > 0);
    const totalSuperavit = pares.reduce((s, g) => s + g.saldoMais,  0);
    const totalDeficit   = pares.reduce((s, g) => s + g.saldoMenos, 0);
    // Solicitações únicas que têm pelo menos 1 par
    const solicComPar = new Set(pares.map(g => g.solicitacao)).size;
    return { total: all.length, pares, falsoResultado, desvioReal, soAMais, soAMenos, totalSuperavit, totalDeficit, solicComPar };
  }, [rows]);

  const [cruzSearch, setCruzSearch] = useState("");
  const [cruzFiltro, setCruzFiltro] = useState<"pares"|"falsoResultado"|"desvioReal"|"soAMais"|"soAMenos">("pares");
  const cruzRows = useMemo(() => {
    if (!cruzSolic) return [];
    let base = cruzFiltro === "pares"          ? cruzSolic.pares
             : cruzFiltro === "falsoResultado" ? cruzSolic.falsoResultado
             : cruzFiltro === "desvioReal"     ? cruzSolic.desvioReal
             : cruzFiltro === "soAMais"        ? cruzSolic.soAMais
             : cruzSolic.soAMenos;
    if (cruzSearch.trim()) {
      const q = cruzSearch.toLowerCase();
      base = base.filter(g =>
        g.solicitacao.includes(q) ||
        g.atendimento.toLowerCase().includes(q) ||
        g.usuario.toLowerCase().includes(q) ||
        g.produto.toLowerCase().includes(q)
      );
    }
    return base.sort((a, b) => Math.abs(b.netSaldo) - Math.abs(a.netSaldo));
  }, [cruzSolic, cruzFiltro, cruzSearch]);

  const tableRows = useMemo(()=>{
    let f=rows;
    if(statusFilter!=="todos") f=f.filter((r: any)=>r.Status===statusFilter);
    if(searchProd){ const q=searchProd.toLowerCase(); f=f.filter((r: any)=>r.Produto?.toLowerCase().includes(q)||r["Código Solicitação"]?.includes(q)||r["Usuário Solicitação"]?.toLowerCase().includes(q)); }
    return f;
  },[rows,statusFilter,searchProd]);

  const sortedProducts = useMemo(()=>{
    const list=[...byProduct];
    list.sort((a,b)=>(a[sortCol]-b[sortCol])*(sortDir==="asc"?1:-1));
    return list;
  },[byProduct,sortCol,sortDir]);

  const totalTablePages = Math.ceil(tableRows.length/PAGE_SIZE);
  const pagedRows = tableRows.slice(tablePage*PAGE_SIZE,(tablePage+1)*PAGE_SIZE);
  const toggleSort = (col: string) => { if(sortCol===col) setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortCol(col);setSortDir("desc");} };

  const [showPDF, setShowPDF] = useState(false);
  const [pdfSections, setPdfSections] = useState({
    kpis: true, divergencia: true, distribuicao: true,
    atendimentos: true, produtos: true, tempo: true, tabela: false,
  });
  const pdfLabels: Record<string,string> = {
    kpis:         "📊 KPIs e Indicadores Gerais",
    divergencia:  "🔺 Cards de Divergência",
    distribuicao: "🥧 Gráfico de Distribuição por Status",
    atendimentos: "🏥 Top Atendimentos",
    produtos:     "💊 Gráficos de Produtos",
    tempo:        "⏰ Gráfico por Hora",
    tabela:       "🔍 Tabela de Detalhes (pode ser longa)",
  };

  const handlePrint = () => {
    const hide = Object.entries(pdfSections).filter(([,v])=>!v).map(([k])=>k);
    const styleId = "pdf-hide-style-v2";
    let el = document.getElementById(styleId);
    if (!el) { el = document.createElement("style"); el.id = styleId; document.head.appendChild(el); }
    el.innerHTML = hide.map(k => `[data-pdf="${k}"] { display: none !important; }`).join("\n") +
      `\n@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`;
    setShowPDF(false);
    setTimeout(() => { window.print(); setTimeout(() => { if(el) el.innerHTML = ""; }, 1000); }, 200);
  };

  const handlePACImport = (file: File) => {
    if (!file) return;
    setLoadingPAC(true);
    const r = new FileReader();
    r.onload = e => {
      const pacRecords = parsePAC((e.target as any).result);
      const lookup = build7400Lookup(rows);
      const crossed = crossRef(pacRecords, lookup);
      setPacData(crossed);
      setShowCruz(true);
      setLoadingPAC(false);
    };
    r.readAsText(file, "ISO-8859-1");
  };

  const TABS = [
    { id: "visao-geral",  label: "📊 Visão Geral" },
    { id: "produtos",     label: "💊 Produtos" },
    { id: "tempo",        label: "⏰ Tempo & Usuários" },
    { id: "cruzamento",   label: `🔀 Cruzamento Prod.${cruzSolic && cruzSolic.pares.length > 0 ? ` (${cruzSolic.pares.length})` : ""}` },
    { id: "detalhes",     label: "🔍 Detalhes" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      {showCruz && pacData && <CruzamentoPanel crossed={pacData} onClose={()=>setShowCruz(false)} />}

      {/* HEADER */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "13px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 8px #00000008" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, color: T.text }}>💊 Análise Dispensação V2</div>
            <div style={{ fontSize: 12, color: T.text3 }}>{meta.empresa} · {meta.dataInicial === meta.dataFinal ? meta.dataInicial : `${meta.dataInicial} → ${meta.dataFinal}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label htmlFor="pac-inp-v2" style={{
            display: "flex", alignItems: "center", gap: 7,
            background: loadingPAC ? "#f1f5f9" : "linear-gradient(135deg,#4f46e5,#7c3aed)",
            color: loadingPAC ? T.text2 : "#fff",
            border: "none", borderRadius: 10, padding: "8px 16px",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: loadingPAC ? "none" : "0 2px 8px #6366f140",
            transition: "all .2s"
          }}>
            <input id="pac-inp-v2" type="file" accept=".txt,.csv,.CSV" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handlePACImport(e.target.files[0])} />
            <span style={{ fontSize: 15 }}>{loadingPAC ? "⏳" : "🔗"}</span>
            {loadingPAC ? "Processando..." : pacData ? "R_CONS_PAC ✓" : "Importar R_CONS_PAC"}
          </label>
          {pacData && (
            <button onClick={()=>setShowCruz(true)} style={{ background: "#e0f2fe", border: "1px solid #bae6fd", color: "#0284c7", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Ver cruzamento →
            </button>
          )}
          <div style={{ background: T.input, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, color: T.text2 }}>{rows.length.toLocaleString("pt-BR")} registros</div>
          <button onClick={() => setShowPDF(true)} style={{ background: "#fff", border: "1px solid #bae6fd", color: "#0284c7", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>🖨️ Exportar PDF</button>
          <button onClick={onReset} style={{ background: "#fff", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>↩ Trocar</button>
        </div>
      </div>

      {/* PDF MODAL */}
      {showPDF && (
        <div style={{ position: "fixed", inset: 0, background: "#00000055", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => e.target === e.currentTarget && setShowPDF(false)}>
          <div style={{ background: "#fff", borderRadius: 18, padding: "28px 32px", width: 420, boxShadow: "0 8px 40px #00000025", border: `1px solid ${T.border}` }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: T.text, marginBottom: 6 }}>🖨️ Exportar PDF</div>
            <div style={{ fontSize: 13, color: T.text2, marginBottom: 20 }}>Selecione as seções que deseja incluir:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {Object.entries(pdfLabels).map(([key, label]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "10px 14px", borderRadius: 10, border: `1px solid ${pdfSections[key as keyof typeof pdfSections] ? "#bae6fd" : T.border}`, background: pdfSections[key as keyof typeof pdfSections] ? "#f0f9ff" : "#fafafa", transition: "all .15s" }}>
                  <div onClick={() => setPdfSections(p => ({ ...p, [key]: !p[key as keyof typeof pdfSections] }))}
                    style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${pdfSections[key as keyof typeof pdfSections] ? "#0284c7" : "#cbd5e1"}`, background: pdfSections[key as keyof typeof pdfSections] ? "#0284c7" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                    {pdfSections[key as keyof typeof pdfSections] && <span style={{ color: "#fff", fontSize: 12, lineHeight: "1" }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, color: pdfSections[key as keyof typeof pdfSections] ? T.text : T.text2, fontWeight: pdfSections[key as keyof typeof pdfSections] ? 600 : 400 }}>{label}</span>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowPDF(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${T.border}`, background: "#fff", color: T.text2, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handlePrint} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0284c7,#0369a1)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🖨️ Imprimir / Salvar PDF</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "22px 28px", maxWidth: 1400, margin: "0 auto" }}>
        {/* TABS */}
        <div style={{ display: "flex", gap: 2, marginBottom: 26, background: "#f1f5f9", borderRadius: 12, padding: 4, width: "fit-content", border: `1px solid ${T.border}` }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              background: activeTab===t.id?"#fff":"transparent",
              border: `1px solid ${activeTab===t.id?T.border:"transparent"}`,
              color: activeTab===t.id?T.text:T.text2,
              borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              boxShadow: activeTab===t.id?"0 1px 4px #00000010":"none", transition: "all .15s"
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── VISÃO GERAL ── */}
        {activeTab === "visao-geral" && (
          <div>
            <div data-pdf="kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 13, marginBottom: 13 }}>
              <KPICard label="Total de Registros" value={rows.length} icon="📋" color="#0284c7" light="#e0f2fe" sub={`${uniqueSol.toLocaleString("pt-BR")} solicitações únicas`} />
              <KPICard label="Eficiência" value={`${taxaAcerto.toFixed(1)}%`} icon="✅" color="#059669" light="#d1fae5" sub={`${(statusCount["Item dispensado totalmente"]||0).toLocaleString("pt-BR")} itens perfeitos`} />
              <KPICard label="Não Dispensados" value={statusCount["Item não dispensado"]||0} icon="🚫" color="#dc2626" light="#fee2e2" sub={`${taxaNao.toFixed(1)}%`} />
              <KPICard label="Dispensados a Mais" value={statusCount["Item dispensado a mais"]||0} icon="⚠️" color="#d97706" light="#fef3c7" sub={`${taxaMais.toFixed(1)}%`} />
              <KPICard label="Dispensados a Menos" value={statusCount["Item dispensado a menos"]||0} icon="📉" color="#7c3aed" light="#ede9fe" sub={`${taxaMenos.toFixed(1)}%`} />
            </div>
            <div data-pdf="kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 13, marginBottom: 22 }}>
              <KPICard label="Atendimentos" value={uniqueAtend} icon="🏥" color="#0369a1" light="#e0f2fe" />
              <KPICard label="Produtos Distintos" value={uniqueProd} icon="💉" color="#0891b2" light="#cffafe" />
              <KPICard label="Solicitantes" value={uniqueSolicitantes} icon="👤" color="#6d28d9" light="#ede9fe" />
              <KPICard label="Qtd Solicitada" value={Math.round(totalSol)} icon="📤" color="#0369a1" light="#dbeafe" />
              <KPICard label="Qtd Dispensada" value={Math.round(totalDisp)} icon="📥" color="#047857" light="#d1fae5" sub={totalDisp>totalSol?`▲ ${Math.round(totalDisp-totalSol)} a mais`:totalDisp<totalSol?`▼ ${Math.round(totalSol-totalDisp)} a menos`:"= Exato"} />
            </div>
            <div data-pdf="divergencia" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13, marginBottom: 22 }}>
              {[
                { color:"#dc2626", light:"#fee2e2", icon:"🔻", val:Math.round(saldoNeg), label:"Unidades não entregues",       sub:"Não disp. + a menos" },
                { color:"#d97706", light:"#fef3c7", icon:"🔺", val:Math.round(saldoPos), label:"Unidades dispensadas a mais",  sub:"Excesso total dispensado" },
                { color:"#0284c7", light:"#e0f2fe", icon:"📊", val:Math.round(divTotal), label:"Divergência total de qtd",     sub:"Soma de todas variações" },
              ].map((k,i) => (
                <div key={i} style={{ ...card, borderLeft: `4px solid ${k.color}`, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ background: k.light, borderRadius: 12, padding: 10, fontSize: 22 }}>{k.icon}</div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontFamily: "'Syne', sans-serif" }}>{k.val.toLocaleString("pt-BR")}</div>
                    <div style={{ fontSize: 13, color: T.text2, fontWeight: 500 }}>{k.label}</div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{k.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <div data-pdf="distribuicao" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 18, marginBottom: 18 }}>
              <div style={card}>
                <SecTitle accent="#0284c7">Distribuição por Status</SecTitle>
                <PieChart width={270} height={170}>
                  <Pie data={pieData} cx={130} cy={80} innerRadius={50} outerRadius={78} paddingAngle={3} dataKey="value">
                    {pieData.map((e,i)=><Cell key={i} fill={e.color} stroke="none"/>)}
                  </Pie>
                  <Tooltip formatter={(v: any)=>Number(v).toLocaleString("pt-BR")} contentStyle={{ background:"#fff",border:`1px solid ${T.border}`,borderRadius:8 }} />
                </PieChart>
                {pieData.map((e,i)=>(
                  <div key={i} style={{ display:"flex",alignItems:"center",gap:8,marginBottom:7 }}>
                    <div style={{ width:9,height:9,borderRadius:2,background:e.color,flexShrink:0 }} />
                    <span style={{ flex:1,fontSize:12,color:T.text2 }}>{e.name}</span>
                    <span style={{ fontSize:12,fontWeight:700,color:e.color }}>{e.value.toLocaleString("pt-BR")}</span>
                    <span style={{ fontSize:11,color:T.text3 }}>({(e.value/rows.length*100).toFixed(1)}%)</span>
                  </div>
                ))}
              </div>
              <div data-pdf="atendimentos" style={{ display:"flex",flexDirection:"column",gap:14 }}>
                <div style={card}>
                  <SecTitle accent="#dc2626">Top Atendimentos — Problemas de Dispensação</SecTitle>
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={byAtendimento} margin={{ left:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                      <XAxis dataKey="atendimento" tick={{ fill:T.text3,fontSize:11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill:T.text3,fontSize:11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<Tip/>} />
                      <Legend wrapperStyle={{ color:T.text2,fontSize:12 }} />
                      <Bar dataKey="naoDispensado" name="Não Dispensado" fill="#dc2626" radius={[4,4,0,0]} />
                      <Bar dataKey="dispensadaMais" name="A Mais" fill="#d97706" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={card}>
                  <SecTitle accent="#6d28d9">Tipo de Solicitação</SecTitle>
                  <ResponsiveContainer width="100%" height={90}>
                    <BarChart data={byTipo} layout="vertical" margin={{ left:0,right:20 }}>
                      <XAxis type="number" tick={{ fill:T.text3,fontSize:11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="tipo" tick={{ fill:T.text2,fontSize:11 }} axisLine={false} tickLine={false} width={130} />
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                      <Tooltip content={<Tip/>} />
                      <Bar dataKey="count" name="Registros" fill="#6d28d9" radius={[0,6,6,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PRODUTOS ── */}
        {activeTab === "produtos" && (
          <div data-pdf="produtos">
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18 }}>
              <div style={card}>
                <SecTitle accent="#dc2626">Top 10 — Não Dispensados</SecTitle>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={[...byProduct].sort((a,b)=>b.naoDispensado-a.naoDispensado).slice(0,10).map(p=>({...p,nome:(p.produto as string).split(" ").slice(0,3).join(" ")}))} layout="vertical" margin={{ left:0,right:10 }}>
                    <XAxis type="number" tick={{ fill:T.text3,fontSize:11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="nome" tick={{ fill:T.text2,fontSize:11 }} axisLine={false} tickLine={false} width={130} />
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                    <Tooltip content={<Tip/>} />
                    <Bar dataKey="naoDispensado" name="Ocorrências" fill="#dc2626" radius={[0,6,6,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={card}>
                <SecTitle accent="#d97706">Top 10 — Dispensados a Mais</SecTitle>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={[...byProduct].sort((a,b)=>b.dispensadaMais-a.dispensadaMais).slice(0,10).map(p=>({...p,nome:(p.produto as string).split(" ").slice(0,3).join(" ")}))} layout="vertical" margin={{ left:0,right:10 }}>
                    <XAxis type="number" tick={{ fill:T.text3,fontSize:11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="nome" tick={{ fill:T.text2,fontSize:11 }} axisLine={false} tickLine={false} width={130} />
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                    <Tooltip content={<Tip/>} />
                    <Bar dataKey="dispensadaMais" name="Ocorrências" fill="#d97706" radius={[0,6,6,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ ...card,marginBottom:18 }}>
              <SecTitle accent="#0284c7">Top 20 Produtos — Solicitado vs Dispensado</SecTitle>
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={[...byProduct].sort((a,b)=>b.count-a.count).slice(0,20).map(p=>({...p,nome:(p.produto as string).split(" ").slice(0,2).join(" ")}))} margin={{ left:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                  <XAxis dataKey="nome" tick={{ fill:T.text3,fontSize:10 }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fill:T.text3,fontSize:11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tip/>} />
                  <Legend wrapperStyle={{ color:T.text2,fontSize:12 }} />
                  <Bar dataKey="solicitada" name="Solicitada" fill="#6366f1" radius={[4,4,0,0]} />
                  <Bar dataKey="dispensada"  name="Dispensada" fill="#059669" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={card}>
              <SecTitle accent="#0891b2">Tabela Completa de Produtos</SecTitle>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:`2px solid ${T.border}` }}>
                      {([["produto","Produto"],["count","Registros"],["solicitada","Qtd Sol."],["dispensada","Qtd Disp."],["total","✅ Total"],["dispensadaMais","⚠️ A Mais"],["naoDispensado","🚫 Não Disp."],["dispensadaMenos","📉 A Menos"]] as [string,string][]).map(([col,label])=>(
                        <th key={col} onClick={()=>col!=="produto"&&toggleSort(col)}
                          style={{ padding:"8px 12px",textAlign:col==="produto"?"left":"right",color:sortCol===col?"#0284c7":T.text2,fontWeight:700,cursor:col!=="produto"?"pointer":"default",whiteSpace:"nowrap",userSelect:"none" }}>
                          {label}{sortCol===col?(sortDir==="asc"?" ↑":" ↓"):""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProducts.map((p,i)=>(
                      <tr key={i} style={{ borderBottom:`1px solid ${T.border2}`,background:i%2===0?T.rowAlt:T.card }}>
                        <td style={{ padding:"8px 12px",color:T.text,maxWidth:280,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }} title={p.produto}>{p.produto}</td>
                        <td style={{ padding:"8px 12px",textAlign:"right",color:T.text2 }}>{p.count}</td>
                        <td style={{ padding:"8px 12px",textAlign:"right",color:"#6366f1",fontWeight:600 }}>{Math.round(p.solicitada)}</td>
                        <td style={{ padding:"8px 12px",textAlign:"right",color:"#059669",fontWeight:600 }}>{Math.round(p.dispensada)}</td>
                        <td style={{ padding:"8px 12px",textAlign:"right",color:"#059669" }}>{p.total}</td>
                        <td style={{ padding:"8px 12px",textAlign:"right",color:p.dispensadaMais>0?"#d97706":T.text3,fontWeight:p.dispensadaMais>0?700:400 }}>{p.dispensadaMais}</td>
                        <td style={{ padding:"8px 12px",textAlign:"right",color:p.naoDispensado>0?"#dc2626":T.text3,fontWeight:p.naoDispensado>0?700:400 }}>{p.naoDispensado}</td>
                        <td style={{ padding:"8px 12px",textAlign:"right",color:p.dispensadaMenos>0?"#7c3aed":T.text3 }}>{p.dispensadaMenos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TEMPO & USUÁRIOS ── */}
        {activeTab === "tempo" && (
          <div data-pdf="tempo">
            <div style={{ ...card,marginBottom:18 }}>
              <SecTitle accent="#0284c7">Volume de Solicitações por Hora do Pedido</SecTitle>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={byHour} margin={{ left:0,right:20 }}>
                  <defs>
                    <linearGradient id="g1v2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                    <linearGradient id="g2v2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#dc2626" stopOpacity={0.12}/><stop offset="95%" stopColor="#dc2626" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                  <XAxis dataKey="hora" tick={{ fill:T.text3,fontSize:12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:T.text3,fontSize:12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tip/>} />
                  <Legend wrapperStyle={{ color:T.text2,fontSize:12 }} />
                  <Area type="monotone" dataKey="count" name="Total" stroke="#6366f1" strokeWidth={2.5} fill="url(#g1v2)" dot={{ fill:"#6366f1",r:3 }} />
                  <Area type="monotone" dataKey="naoDispensado" name="Não Dispensados" stroke="#dc2626" strokeWidth={2} fill="url(#g2v2)" dot={{ fill:"#dc2626",r:3 }} strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="dispensadaMais" name="A Mais" stroke="#d97706" strokeWidth={2} fill="none" dot={{ fill:"#d97706",r:3 }} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:18 }}>
              <div style={card}>
                <SecTitle accent="#6d28d9">Top Usuários Solicitantes</SecTitle>
                {byUser.map((u,i)=>{
                  const pct=byUser[0].count>0?(u.count/byUser[0].count*100):0;
                  const efic=u.count>0?(u.dispensadoTotal/u.count*100).toFixed(0):0;
                  return (
                    <div key={i} style={{ marginBottom:13 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4,alignItems:"center" }}>
                        <span style={{ fontSize:12,color:T.text,fontWeight:600 }}>{u.usuario}</span>
                        <div style={{ display:"flex",gap:6,alignItems:"center" }}>
                          <span style={{ fontSize:11,background:"#d1fae5",color:"#059669",borderRadius:10,padding:"1px 7px",fontWeight:700 }}>{efic}%</span>
                          <span style={{ fontSize:12,color:"#6366f1",fontWeight:700 }}>{u.count}</span>
                        </div>
                      </div>
                      <div style={{ height:6,background:T.border2,borderRadius:4,overflow:"hidden" }}>
                        <div style={{ height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#6366f1,#a78bfa)",borderRadius:4 }} />
                      </div>
                      <div style={{ display:"flex",gap:10,marginTop:3 }}>
                        <span style={{ fontSize:10,color:"#d97706",fontWeight:600 }}>⚠️{u.dispensadaMais}</span>
                        <span style={{ fontSize:10,color:"#dc2626",fontWeight:600 }}>🚫{u.naoDispensado}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={card}>
                <SecTitle accent="#0891b2">Top Movimentadores de Estoque</SecTitle>
                {byMovimentador.map((u,i)=>{
                  const pct=byMovimentador[0].count>0?(u.count/byMovimentador[0].count*100):0;
                  return (
                    <div key={i} style={{ marginBottom:13 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                        <span style={{ fontSize:12,color:T.text,fontWeight:600 }}>{u.usuario}</span>
                        <span style={{ fontSize:12,color:"#0891b2",fontWeight:700 }}>{u.count}</span>
                      </div>
                      <div style={{ height:6,background:T.border2,borderRadius:4,overflow:"hidden" }}>
                        <div style={{ height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#0891b2,#38bdf8)",borderRadius:4 }} />
                      </div>
                      <div style={{ display:"flex",gap:10,marginTop:3 }}>
                        <span style={{ fontSize:10,color:"#d97706",fontWeight:600 }}>⚠️{u.dispensadaMais}</span>
                        <span style={{ fontSize:10,color:"#dc2626",fontWeight:600 }}>🚫{u.naoDispensado}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── CRUZAMENTO POR PRODUTO + SOLICITAÇÃO ── */}
        {activeTab === "cruzamento" && cruzSolic && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

            {/* Callout explicativo */}
            <div style={{ background:"#f5f3ff", border:"1px solid #c4b5fd", borderRadius:14, padding:"16px 20px", display:"flex", gap:14 }}>
              <div style={{ fontSize:24, lineHeight:1 }}>🔀</div>
              <div>
                <div style={{ fontWeight:800, fontSize:14, color:"#4c1d95", marginBottom:4 }}>Cruzamento por Produto × Solicitação</div>
                <div style={{ fontSize:13, color:"#5b21b6", lineHeight:1.6 }}>
                  Agrupa por <b>Código Solicitação + Produto</b> e detecta quando o <b>mesmo produto</b> na
                  mesma solicitação aparece simultaneamente como <b style={{color:"#d97706"}}>dispensado a mais</b> e
                  <b style={{color:"#7c3aed"}}> dispensado a menos</b> (ou não dispensado).
                  Nesses casos os dois registros se anulam — <b>possível falso resultado</b>. O saldo líquido confirma
                  se houve desvio real após a compensação.
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:12 }}>
              <KPICard label="Total de Pares"        value={cruzSolic.pares.length}          icon="🔀" color="#7c3aed" light="#ede9fe" sub="mesmo produto, a mais e a menos" />
              <KPICard label="🟣 Falso Resultado"    value={cruzSolic.falsoResultado.length} icon="🟣" color="#7c3aed" light="#f5f3ff" sub="saldo líquido ≤ 0 — se anulam" />
              <KPICard label="🟡 Desvio Real"        value={cruzSolic.desvioReal.length}     icon="🟡" color="#d97706" light="#fffbeb" sub="saldo líquido > 0 — desvio persiste" />
              <KPICard label="Solicitações c/ Par"   value={cruzSolic.solicComPar}           icon="📋" color="#0284c7" light="#e0f2fe" sub="solicitações afetadas" />
              <KPICard label="Só Dispensado a Mais"  value={cruzSolic.soAMais.length}        icon="🔺" color="#f59e0b" light="#fef3c7" sub="sem par compensatório" />
              <KPICard label="Só Déficit/Não Disp."  value={cruzSolic.soAMenos.length}       icon="🔻" color="#dc2626" light="#fee2e2" sub="sem par compensatório" />
            </div>

            {/* Filtros */}
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
              <div style={{ display:"flex", gap:4, background:"#f1f5f9", padding:4, borderRadius:10, flexWrap:"wrap" }}>
                {([
                  { id:"pares",          label:`🔀 Todos os pares (${cruzSolic.pares.length})`,           activeColor:"#7c3aed" },
                  { id:"falsoResultado", label:`🟣 Falso resultado (${cruzSolic.falsoResultado.length})`, activeColor:"#7c3aed" },
                  { id:"desvioReal",     label:`🟡 Desvio real (${cruzSolic.desvioReal.length})`,         activeColor:"#d97706" },
                  { id:"soAMais",        label:`🔺 Só a mais (${cruzSolic.soAMais.length})`,              activeColor:"#f59e0b" },
                  { id:"soAMenos",       label:`🔻 Só déficit (${cruzSolic.soAMenos.length})`,            activeColor:"#dc2626" },
                ] as const).map(f => (
                  <button key={f.id} onClick={() => setCruzFiltro(f.id)}
                    style={{
                      background: cruzFiltro === f.id ? "#fff" : "transparent",
                      border: cruzFiltro === f.id ? `1px solid ${f.activeColor}30` : "none",
                      borderRadius:7, padding:"6px 12px", fontSize:12, fontWeight:700, cursor:"pointer",
                      color: cruzFiltro === f.id ? f.activeColor : "#64748b",
                      boxShadow: cruzFiltro === f.id ? "0 1px 4px #00000015" : "none"
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
              <input value={cruzSearch} onChange={e => setCruzSearch(e.target.value)}
                placeholder="🔍  Solicitação, atendimento, produto, usuário..."
                style={{ flex:1, minWidth:240, background:"#f1f5f9", border:`1px solid ${T.border}`, borderRadius:10, padding:"8px 13px", fontSize:13, color:T.text, outline:"none" }} />
              <div style={{ fontSize:12, color:T.text3, whiteSpace:"nowrap" }}>{cruzRows.length} pares</div>
            </div>

            {/* Tabela principal — um par por linha */}
            <div style={{ background:"#fff", border:`1px solid ${T.border}`, borderRadius:14, overflow:"hidden" }}>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ background:"#1e293b" }}>
                      {[
                        { h:"Solicitação",      c:"#94a3b8" },
                        { h:"Atendimento",      c:"#94a3b8" },
                        { h:"Usuário",          c:"#94a3b8" },
                        { h:"Produto",          c:"#fff"    },
                        { h:"Qtd Sol.",         c:"#94a3b8" },
                        { h:"Qtd Disp. A Mais", c:"#fcd34d" },
                        { h:"Qtd Disp. A Menos",c:"#c4b5fd" },
                        { h:"Saldo A Mais",     c:"#fcd34d" },
                        { h:"Saldo A Menos",    c:"#c4b5fd" },
                        { h:"Saldo Líquido",    c:"#fff"    },
                        { h:"Avaliação",        c:"#94a3b8" },
                      ].map(({ h, c }) => (
                        <th key={h} style={{ padding:"10px 12px", textAlign:"left", color:c, fontWeight:700, fontSize:11, whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cruzRows.slice(0, 300).map((g, i) => {
                      const net = g.netSaldo;
                      const isPar    = ["pares","falsoResultado","desvioReal"].includes(cruzFiltro);
                      const isFalso  = isPar && net <= 0;
                      const isDesvio = isPar && net > 0;
                      const netColor = net === 0 ? "#059669" : net > 0 ? "#d97706" : "#7c3aed";
                      const netLabel = net === 0 ? "= 0" : net > 0 ? `+${net.toFixed(0)}` : `${net.toFixed(0)}`;
                      const borderColor = isFalso ? "#7c3aed" : isDesvio ? "#d97706" : cruzFiltro === "soAMais" ? "#f59e0b" : "#dc2626";
                      return (
                        <tr key={i} style={{ borderBottom:`1px solid ${T.border2}`, background: i%2===0 ? T.rowAlt : "#fff", borderLeft:`3px solid ${borderColor}` }}>
                          <td style={{ padding:"8px 12px", color:"#6366f1", fontWeight:700, whiteSpace:"nowrap" }}>{g.solicitacao}</td>
                          <td style={{ padding:"8px 12px", color:"#0284c7", fontWeight:600, whiteSpace:"nowrap" }}>{g.atendimento||"—"}</td>
                          <td style={{ padding:"8px 12px", color:T.text2, maxWidth:130, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={g.usuario}>{g.usuario||"—"}</td>
                          <td style={{ padding:"8px 12px", color:T.text, maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:600 }} title={g.produto}>{g.produto}</td>
                          <td style={{ padding:"8px 12px", textAlign:"center", color:T.text2, fontWeight:600 }}>{g.qtdSol||"—"}</td>
                          <td style={{ padding:"8px 12px", textAlign:"center" }}>
                            <span style={{ background:"#fef3c7", color:"#d97706", borderRadius:20, padding:"2px 10px", fontWeight:700 }}>{g.qtdDispMais > 0 ? `+${g.qtdDispMais}` : g.rowAMais.length > 0 ? `${g.rowAMais.length} reg.` : "—"}</span>
                          </td>
                          <td style={{ padding:"8px 12px", textAlign:"center" }}>
                            {(g.rowAMenos.length > 0 || g.rowNaoDisp.length > 0)
                              ? <span style={{ background:"#ede9fe", color:"#7c3aed", borderRadius:20, padding:"2px 10px", fontWeight:700 }}>{g.qtdDispMenos > 0 ? `${g.qtdDispMenos}` : `${g.rowAMenos.length + g.rowNaoDisp.length} reg.`}</span>
                              : <span style={{ color:T.text3 }}>—</span>}
                          </td>
                          <td style={{ padding:"8px 12px", textAlign:"right", color:"#d97706", fontWeight:700 }}>{g.saldoMais > 0 ? `+${g.saldoMais.toFixed(0)}` : "—"}</td>
                          <td style={{ padding:"8px 12px", textAlign:"right", color:"#7c3aed", fontWeight:700 }}>{g.saldoMenos > 0 ? `-${g.saldoMenos.toFixed(0)}` : "—"}</td>
                          <td style={{ padding:"8px 12px", textAlign:"right" }}>
                            <span style={{ background: net===0?"#d1fae5":net>0?"#fef3c7":"#ede9fe", color:netColor, borderRadius:6, padding:"3px 10px", fontWeight:800, fontSize:12 }}>{netLabel}</span>
                          </td>
                          <td style={{ padding:"8px 12px", whiteSpace:"nowrap" }}>
                            {isFalso  && <span style={{ background:"#ede9fe", color:"#7c3aed", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700 }}>🟣 Falso resultado</span>}
                            {isDesvio && <span style={{ background:"#fef3c7", color:"#d97706", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700 }}>🟡 Desvio real</span>}
                            {cruzFiltro === "soAMais"  && <span style={{ background:"#fef3c7", color:"#f59e0b", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700 }}>🔺 Só a mais</span>}
                            {cruzFiltro === "soAMenos" && <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700 }}>🔻 Só déficit</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {cruzRows.length === 0 && (
                      <tr><td colSpan={11} style={{ padding:32, textAlign:"center", color:T.text3 }}>Nenhum par encontrado com os filtros atuais.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {cruzRows.length > 300 && (
                <div style={{ padding:"10px 16px", borderTop:`1px solid ${T.border}`, background:T.rowAlt, fontSize:12, color:T.text3, textAlign:"center" }}>
                  Exibindo 300 de {cruzRows.length} — use a busca para refinar.
                </div>
              )}
            </div>

            {/* Detalhe dos pares — mostra as linhas originais de cada par */}
            {cruzFiltro === "pares" && cruzSolic.pares.length > 0 && (
              <div style={{ ...card }}>
                <SecTitle accent="#7c3aed">Detalhe dos pares — linhas originais (top 10 por maior desvio absoluto)</SecTitle>
                {cruzSolic.pares
                  .sort((a, b) => Math.abs(b.netSaldo) - Math.abs(a.netSaldo))
                  .slice(0, 10)
                  .map((g, gi) => {
                    const allOriginal = [
                      ...g.rowAMais.map((r: any) => ({ ...r, _tipo: "mais" })),
                      ...g.rowAMenos.map((r: any) => ({ ...r, _tipo: "menos" })),
                      ...g.rowNaoDisp.map((r: any) => ({ ...r, _tipo: "nao" })),
                    ];
                    return (
                      <div key={gi} style={{ marginBottom:16, border:`1px solid ${T.border}`, borderRadius:10, overflow:"hidden" }}>
                        <div style={{ background:"#f5f3ff", padding:"8px 14px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                          <span style={{ fontWeight:800, fontSize:13, color:"#4c1d95" }}>Solic. {g.solicitacao}</span>
                          <span style={{ color:T.text3, fontSize:12 }}>·</span>
                          <span style={{ fontSize:12, color:"#0284c7", fontWeight:600 }}>Atend. {g.atendimento||"—"}</span>
                          <span style={{ fontSize:12, color:T.text2, fontWeight:500, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={g.produto}>📦 {g.produto}</span>
                          <span style={{ background:"#fef3c7", color:"#d97706", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700 }}>+{g.saldoMais.toFixed(0)} un. a mais</span>
                          <span style={{ background:"#ede9fe", color:"#7c3aed", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700 }}>-{g.saldoMenos.toFixed(0)} un. a menos</span>
                          <span style={{ background: g.netSaldo===0?"#d1fae5":g.netSaldo>0?"#fef3c7":"#ede9fe", color: g.netSaldo===0?"#059669":g.netSaldo>0?"#d97706":"#7c3aed", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:800 }}>
                            Net: {g.netSaldo===0?"0":g.netSaldo>0?"+"+g.netSaldo.toFixed(0):g.netSaldo.toFixed(0)}
                          </span>
                        </div>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                          <thead>
                            <tr style={{ background:"#f8fafc" }}>
                              {["Produto","Qtd Sol.","Qtd Disp.","Saldo","Status"].map(h => (
                                <th key={h} style={{ padding:"6px 12px", textAlign:"left", color:T.text3, fontWeight:700, fontSize:11 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {allOriginal.map((r: any, ri: number) => {
                              const cfg = scfg(r.Status);
                              const saldo = parseFloat(r.Saldo)||0;
                              return (
                                <tr key={ri} style={{ borderBottom:`1px solid ${T.border2}`, background: r._tipo==="mais"?"#fffbeb":r._tipo==="nao"?"#fef2f2":"#faf5ff", borderLeft:`3px solid ${r._tipo==="mais"?"#f59e0b":"#7c3aed"}` }}>
                                  <td style={{ padding:"6px 12px", color:T.text, maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={r.Produto}>{r.Produto}</td>
                                  <td style={{ padding:"6px 12px", textAlign:"right", color:"#6366f1", fontWeight:700 }}>{r["Qtd Solicitada"]||"—"}</td>
                                  <td style={{ padding:"6px 12px", textAlign:"right", color:"#059669", fontWeight:700 }}>{r["Qtd Dispensada"]||"—"}</td>
                                  <td style={{ padding:"6px 12px", textAlign:"right", fontWeight:700, color: saldo>0?"#d97706":saldo<0?"#7c3aed":"#059669" }}>{saldo>0?"+"+saldo:saldo===0?"=":saldo}</td>
                                  <td style={{ padding:"6px 12px" }}><span style={{ background:cfg.light, color:cfg.color, borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700, border:`1px solid ${cfg.border}` }}>{r.Status}</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* ── DETALHES ── */}
        {activeTab === "detalhes" && (
          <div data-pdf="tabela">
            <div style={{ display:"flex",gap:12,marginBottom:16,flexWrap:"wrap" }}>
              <input value={searchProd} onChange={e=>{setSearchProd(e.target.value);setTablePage(0);}}
                placeholder="🔍  Buscar por produto, solicitante, código..."
                style={{ flex:1,minWidth:280,background:T.input,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",color:T.text,fontSize:13,outline:"none" }} />
              <select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setTablePage(0);}}
                style={{ background:T.input,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",color:T.text,fontSize:13,outline:"none",cursor:"pointer" }}>
                <option value="todos">Todos os status</option>
                {Object.keys(STATUS_CONFIG).filter(s=>s!=="Sem correspondência no 7400").map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <div style={{ background:T.input,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",color:T.text2,fontSize:13 }}>
                {tableRows.length.toLocaleString("pt-BR")} resultados
              </div>
            </div>
            <div style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px #0000000a" }}>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
                  <thead>
                    <tr style={{ background:T.rowAlt,borderBottom:`2px solid ${T.border}` }}>
                      {["Cód. Sol.","Solicitante","Data Pedido","Hora","Produto","Atendimento","Qtd Sol.","Qtd Disp.","Saldo","Status"].map(h=>(
                        <th key={h} style={{ padding:"10px 12px",textAlign:"left",color:T.text2,fontWeight:700,whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((r: any,i: number)=>{
                      const saldo=parseFloat(r.Saldo)||0;
                      return (
                        <tr key={i} style={{ borderBottom:`1px solid ${T.border2}`,background:i%2===0?T.rowAlt:T.card }}>
                          <td style={{ padding:"8px 12px",color:"#6366f1",fontWeight:600 }}>{r["Código Solicitação"]}</td>
                          <td style={{ padding:"8px 12px",color:T.text2,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }} title={r["Usuário Solicitação"]}>{r["Usuário Solicitação"]}</td>
                          <td style={{ padding:"8px 12px",color:T.text3,whiteSpace:"nowrap" }}>{r["Data Pedido"]}</td>
                          <td style={{ padding:"8px 12px",color:T.text3,whiteSpace:"nowrap" }}>{r["Hora Pedido"]?.slice(0,5)}</td>
                          <td style={{ padding:"8px 12px",color:T.text,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }} title={r.Produto}>{r.Produto}</td>
                          <td style={{ padding:"8px 12px",color:T.text3 }}>{r.Atendimento}</td>
                          <td style={{ padding:"8px 12px",textAlign:"right",color:"#6366f1",fontWeight:600 }}>{r["Qtd Solicitada"]}</td>
                          <td style={{ padding:"8px 12px",textAlign:"right",color:"#059669",fontWeight:600 }}>{r["Qtd Dispensada"]}</td>
                          <td style={{ padding:"8px 12px",textAlign:"right",color:saldo<0?"#dc2626":saldo>0?"#d97706":T.text3,fontWeight:600 }}>{r.Saldo}</td>
                          <td style={{ padding:"8px 12px" }}><StatusBadge status={r.Status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px",borderTop:`1px solid ${T.border}`,background:T.rowAlt }}>
                <span style={{ color:T.text2,fontSize:12 }}>Página {tablePage+1} de {totalTablePages} · {tableRows.length.toLocaleString("pt-BR")} registros</span>
                <div style={{ display:"flex",gap:6 }}>
                  {([["«",()=>setTablePage(0),tablePage===0],["‹",()=>setTablePage((p: number)=>Math.max(0,p-1)),tablePage===0],
                    ["›",()=>setTablePage((p: number)=>Math.min(totalTablePages-1,p+1)),tablePage>=totalTablePages-1],
                    ["»",()=>setTablePage(totalTablePages-1),tablePage>=totalTablePages-1]
                  ] as [string,()=>void,boolean][]).map(([l,a,d],i)=><PBtn key={i} onClick={a} disabled={d}>{l}</PBtn>)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────
export function AnaliseDispensacaoV2() {
  const [data, setData] = useState<any>(null);
  if (!data) return <UploadScreen onData={setData} />;
  return <Dashboard data={data} onReset={() => setData(null)} />;
}
