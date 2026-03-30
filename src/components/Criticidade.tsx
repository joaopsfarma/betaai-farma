import React, { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPDFHeader, drawPDFFooters, drawKPICards, PDF_COLORS } from '../utils/pdfExport';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Search,
  Package,
  Database,
  Clock,
  FileUp,
  FileDown,
  Layers,
  Target,
  LayoutGrid,
  Bed,
  Stethoscope,
} from 'lucide-react';

// --- DATABASE DE PROTOCOLOS UTI ---
const databaseUTI = [
  { id: "215", desc: "ACTILYSE 50MG-50ML FR/AMP IV-ALTEPLASE", max: 6, min: 3, cat: "Protocolo de AVC", active: "ALTEPLASE" },
  { id: "3464", desc: "AGRASTAT 0,25MG/ML-50ML FR/AMP EV-TIROFIBANA", max: 2, min: 1, cat: "Protocolo de Dor Torácica", active: "TIROFIBANA" },
  { id: "59", desc: "AAS 100MG COMP-ACIDO ACETILSALICILICO", max: 20, min: 6, cat: "Protocolo de Dor Torácica", active: "ACETILSALICILICO" },
  { id: "907", desc: "CLOPIDOGREL 75MG COMP REV EMS", max: 20, min: 6, cat: "Protocolo de Dor Torácica", active: "CLOPIDOGREL" },
  { id: "20907", desc: "CLOPIDOGREL 75MG COMP REV", max: 20, min: 6, cat: "Protocolo de Dor Torácica", active: "CLOPIDOGREL" },
  { id: "3433", desc: "BRILINTA 90MG COMP REV-TICAGRELOR", max: 20, min: 6, cat: "Protocolo de Dor Torácica", active: "TICAGRELOR" },
  { id: "203433", desc: "BRILINTA 90MG COMP REV", max: 20, min: 6, cat: "Protocolo de Dor Torácica", active: "TICAGRELOR" },
  { id: "29383", desc: "ISORDIL 5MG COMP", max: 20, min: 6, cat: "Protocolo de Dor Torácica", active: "ISOSSORBIDA" },
  { id: "2594", desc: "NITROPRUS 50MG FR/AMP IV-NITROPRUSSETO", max: 10, min: 5, cat: "Drogas Vasoativas", active: "NITROPRUSSETO" },
  { id: "29013", desc: "AMIODARONA 50MG/ML-3ML AMP IV HIPOLABOR", max: 50, min: 20, cat: "Drogas Vasoativas", active: "AMIODARONA" },
  { id: "32058", desc: "ENCRISE 20UI/ML-1ML AMP IM/IV/SC-VASOPRESSINA", max: 30, min: 10, cat: "Drogas Vasoativas", active: "VASOPRESSINA" },
  { id: "38493", desc: "BETACRIS 1MG/ML-5ML AMP IV-METOPROLOL TART", max: 10, min: 4, cat: "Drogas Vasoativas", active: "METOPROLOL" },
  { id: "104301", desc: "TRIDIL 5MG/ML-5ML AMP IV-NITROGLICERINA", max: 20, min: 8, cat: "Drogas Vasoativas", active: "NITROGLICERINA" },
  { id: "208627", desc: "DOBUTAMINA 12,5 MG/ML 20ML AMP EV HYPOFARMA", max: 20, min: 8, cat: "Drogas Vasoativas", active: "DOBUTAMINA" },
  { id: "104386", desc: "DOBUTAMINA 12,5MG/ML-20ML AMP IV TEUTO", max: 20, min: 8, cat: "Drogas Vasoativas", active: "DOBUTAMINA" },
  { id: "1303", desc: "DOPACRIS 5MG/ML-10ML", max: 20, min: 8, cat: "Drogas Vasoativas", active: "DOPAMINA" },
  { id: "47349", desc: "NOREPINEFRINA 2MG/ML 4ML AMP EV HYPOFARMA", max: 200, min: 80, cat: "Drogas Vasoativas", active: "NOREPINEFRINA" },
  { id: "143714", desc: "EPIKABI 2MG/ML-4ML AMP IV-NOREPINEFRINA", max: 200, min: 80, cat: "Drogas Vasoativas", active: "NOREPINEFRINA" },
  { id: "1371", desc: "HYFREN 1MG/ML-1ML AMP EV", max: 20, min: 8, cat: "Drogas Vasoativas", active: "EPINEFRINA" },
  { id: "94979", desc: "LIPURO 1%-20ML AMP EV PROPOFOL", max: 100, min: 30, cat: "Intubação/Sedação", active: "PROPOFOL" },
  { id: "74517", desc: "LIPURO 1%-50ML FR/AMP EV-PROPOFOL", max: 100, min: 30, cat: "Intubação/Sedação", active: "PROPOFOL" },
  { id: "74210", desc: "LIPURO 1%-100ML FR/AMP EV-PROPOFOL", max: 10, min: 4, cat: "Intubação/Sedação", active: "PROPOFOL" },
  { id: "23820", desc: "CIS 2MG/ML-5ML FR/AMP EV", max: 20, min: 8, cat: "Intubação/Sedação", active: "CISATRACURIO" },
  { id: "31127", desc: "ROCURON 10MG/ML-5ML", max: 50, min: 15, cat: "Intubação/Sedação", active: "ROCURONIO" },
  { id: "1457", desc: "ETOMIDATO 2MG/ML-10ML", max: 20, min: 6, cat: "Intubação/Sedação", active: "ETOMIDATO" },
  { id: "52369", desc: "SUCCITRAT 100MG FR/AMP", max: 5, min: 2, cat: "Intubação/Sedação", active: "SUCCINILCOLINA" },
  { id: "208909", desc: "DEX 100 MCG/ML-2ML FR/AMP EV (DEXMEDETOMIDINA)", max: 100, min: 30, cat: "Analgesia/Sedação", active: "DEXMEDETOMIDINA" },
  { id: "36811", desc: "DORMIRE 5MG/ML-10ML AMP IM/EV-MIDAZOLAM", max: 25, min: 10, cat: "Analgesia/Sedação", active: "MIDAZOLAM" },
  { id: "2420", desc: "DORMIRE 5MG/ML-3ML AMP C/15MG IM/EV-MIDAZOLAM", max: 10, min: 5, cat: "Analgesia/Sedação", active: "MIDAZOLAM" },
  { id: "1182", desc: "UNI-DIAZEPAX 5MG/ML-2ML AMP EV-DIAZEPAM", max: 2, min: 1, cat: "Analgesia/Sedação", active: "DIAZEPAM" },
  { id: "1175", desc: "KETAMIN 50MG/ML-2ML FR/AMP IM/EV ESCETAMINA", max: 30, min: 10, cat: "Analgesia/Sedação", active: "CETAMINA" },
  { id: "0000", desc: "FENTANEST 50MCG/ML 10ML AMP EV/IM FENTANILA", max: 200, min: 60, cat: "Analgesia/Sedação", active: "FENTANILA" },
  { id: "1523", desc: "FENTANEST 50MCG/ML-10ML AMP C/500MCG IM/EV-FENTANILA", max: 200, min: 100, cat: "Analgesia/Sedação", active: "FENTANILA" },
  { id: "1524", desc: "FENTANEST 50MCG/ML 2ML AMP EV/IM FENTANILA", max: 25, min: 10, cat: "Analgesia/Sedação", active: "FENTANILA" },
  { id: "202099", desc: "AEROFRIN 100MCG/DOSE", max: 30, min: 10, cat: "Desconforto Respiratório", active: "SALBUTAMOL" },
  { id: "37098", desc: "SALBUTAMOL 0,5MG/ML-1ML", max: 20, min: 8, cat: "Desconforto Respiratório", active: "SALBUTAMOL" },
  { id: "69628", desc: "PROTAMINA 1.000UI/ML-5ML", max: 10, min: 4, cat: "Controle de Sangramentos", active: "PROTAMINA" },
  { id: "43814", desc: "FITOMENADIONA(VIT K)", max: 10, min: 4, cat: "Controle de Sangramentos", active: "VITAMINA K" },
  { id: "97774", desc: "OCTAPLEX 500UI FR/AMP IV-FATOR II/VII/IX/X", max: 5, min: 2, cat: "Controle de Sangramentos", active: "PROTROMBINICO" },
  { id: "199068", desc: "NOVOLIN R 100UI/ML-10ML", max: 2, min: 1, cat: "Controle Glicêmico", active: "INSULINA" },
  { id: "89457", desc: "KIT HEMOFILTRO/DIALISADOR C/HEPARINA OXIRIS", max: 2, min: 1, cat: "Materiais Alto Custo", active: "KIT HEMOFILTRO" },
  { id: "33893", desc: "CIRCUITO RESPIRATORIO P/ ALTO FLUXO ADULTO", max: 3, min: 1, cat: "Materiais Alto Custo", active: "CIRCUITO OPTIFLOW" },
  { id: "33896", desc: "CIRCUITO RESPIRATORIO ALTO FLUXO JR", max: 3, min: 1, cat: "Materiais Alto Custo", active: "CIRCUITO OPTIFLOW" },
  { id: "82693", desc: "CATETER VENOSO POWERPICC 3CG 5FR 55CM", max: 4, min: 2, cat: "Materiais Alto Custo", active: "POWERPICC" },
  { id: "175328", desc: "CATETER VENOSO CENTRAL VYGON 4,5FR", max: 1, min: 1, cat: "Materiais Alto Custo", active: "CVC VYGON" },
  { id: "8390", desc: "CATETER VENOSO CENTRAL VYGON 3FR", max: 1, min: 1, cat: "Materiais Alto Custo", active: "CVC VYGON" },
  { id: "50267", desc: "CANULA NASAL OPTIFLOW G", max: 2, min: 1, cat: "Materiais Alto Custo", active: "CANULA OPTIFLOW" },
  { id: "40134", desc: "CANULA NASAL OPTIFLOW M", max: 1, min: 1, cat: "Materiais Alto Custo", active: "CANULA OPTIFLOW" },
  { id: "201716", desc: "CANULA NASAL OPTIFLOW JR 2 M", max: 5, min: 2, cat: "Materiais Alto Custo", active: "CANULA OPTIFLOW" },
  { id: "54031", desc: "CANULA NASAL INFANTIL OPTIFLOW JR 2", max: 5, min: 2, cat: "Materiais Alto Custo", active: "CANULA OPTIFLOW" },
  { id: "9272", desc: "SENSOR FLOTRAC 152CM-MHD6", max: 5, min: 2, cat: "Materiais Críticos", active: "SENSOR FLOTRAC" },
  { id: "29574", desc: "TRANSDUTOR PRESSAO DESCARTAVEL", max: 20, min: 8, cat: "Materiais Críticos", active: "TRANSDUTOR PRESSAO" },
  { id: "8373", desc: "CATETER VENOSO CENTRAL CERTOFIX 16G", max: 4, min: 2, cat: "Materiais Críticos", active: "CVC CERTOFIX" },
  { id: "190034", desc: "CAT VENOSO CENTRAL ARROWG 7FR", max: 10, min: 4, cat: "Materiais Críticos", active: "CVC ARROW" },
  { id: "173022", desc: "BOLSA DESCARTAVEL THERMAX-955516", max: 10, min: 4, cat: "Materiais Críticos", active: "BOLSA THERMAX" },
  { id: "111653", desc: "BOLSA DRENAGEM HEMODIALISE BAXTER 5L", max: 10, min: 4, cat: "Materiais Críticos", active: "BOLSA HEMODIALISE" },
  { id: "208604", desc: "CONJUNTO CATETERIZACAO ARTERIAL 20GA", max: 20, min: 8, cat: "Materiais Críticos", active: "KIT ARTERIAL" },
  { id: "151133", desc: "SENSOR MONITORIZACAO ADULTO CONOX", max: 20, min: 8, cat: "Materiais Críticos", active: "SENSOR CONOX" },
  { id: "113019", desc: "EQUIPO HEMODIALISE LINHA CALCIO", max: 5, min: 2, cat: "Materiais Críticos", active: "EQUIPO HEMODIALISE" },
  { id: "188851", desc: "SONDA NASOENTERAL ENFIT FREKA TUBE", max: 10, min: 4, cat: "Materiais Críticos", active: "SONDA NASOENTERAL" },
  { id: "8803", desc: "FIXADOR TUBO ENDOTRAQUEAL HOLLISTER", max: 20, min: 8, cat: "Materiais Críticos", active: "FIXADOR TUBO" },
  // Antídotos / Reversão
  { id: "12427", desc: "NARCAN 0,4MG/ML-1ML AMP IM/EV-NALOXONA", max: 10, min: 5, cat: "Antídotos/Reversão", active: "NALOXONA" },
  { id: "1594", desc: "FLUMAZIL 0,1MG/ML-5ML AMP EV-FLUMAZENIL", max: 4, min: 2, cat: "Antídotos/Reversão", active: "FLUMAZENIL" },
  // Anticonvulsivantes
  { id: "202157", desc: "ANTARA IV 100MG/ML-5ML FR/AMP EV-LEVETIRACETAM", max: 4, min: 2, cat: "Anticonvulsivantes", active: "LEVETIRACETAM" },
  // Sedação / Delírio
  { id: "110545", desc: "UNI HALOPER 5MG/ML-1ML AMP IM-HALOPERIDOL", max: 2, min: 1, cat: "Sedação/Delírio", active: "HALOPERIDOL" },
  // Suporte Nutricional
  { id: "29396", desc: "GLYCOPHOS 216MG/ML-20ML FR/AMP EV-GLICEROFOSFATO", max: 20, min: 10, cat: "Suporte Nutricional", active: "GLICEROFOSFATO" },
];

// --- DATABASE DE PROTOCOLOS PS ---
const databasePS = [
  { id: "215", desc: "ACTILYSE 50MG-50ML FR/AMP IV-ALTEPLASE", max: 6, min: 3, cat: "PROTOCOLO DE AVC", active: "ALTEPLASE" },
  { id: "3464", desc: "AGRASTAT 0,25MG/ML-50ML FR/AMP EV-TIROFIBANA", max: 2, min: 1, cat: "PROTOCOLO DE DOR TORÁCICA", active: "TIROFIBANA" },
  { id: "59", desc: "AAS 100MG COMP-ACIDO ACETILSALICILICO", max: 20, min: 6, cat: "PROTOCOLO DE DOR TORÁCICA", active: "ACETILSALICILICO" },
  { id: "907", desc: "CLOPIDOGREL 75MG COMP REV", max: 20, min: 6, cat: "PROTOCOLO DE DOR TORÁCICA", active: "CLOPIDOGREL" },
  { id: "3433", desc: "BRILINTA 90MG COMP REV", max: 20, min: 6, cat: "PROTOCOLO DE DOR TORÁCICA", active: "TICAGRELOR" },
  { id: "29383", desc: "ISORDIL 5MG COMP", max: 20, min: 6, cat: "PROTOCOLO DE DOR TORÁCICA", active: "ISOSSORBIDA" },
  { id: "64275", desc: "AMPICILINA/SULBACTAM 1.000/500MG FR/AMP", max: 10, min: 3, cat: "PROTOCOLO DE SEPSE", active: "AMPICILINA/SULBACTAM" },
  { id: "208633", desc: "SULBACTAM/AMPICILINA 1.000/2.000 MG FR/AMP", max: 10, min: 3, cat: "PROTOCOLO DE SEPSE", active: "AMPICILINA/SULBACTAM" },
  { id: "707", desc: "ROCEFIN 1.000MG FR/AMP IM- CEFTRIAXONA", max: 5, min: 2, cat: "PROTOCOLO DE SEPSE", active: "CEFTRIAXONA" },
  { id: "708", desc: "CEFTRIAXONA 1.000MG FR/AMP EV ABL", max: 10, min: 3, cat: "PROTOCOLO DE SEPSE", active: "CEFTRIAXONA" },
  { id: "2297", desc: "MERONEM 1.000MG FR/AMP - MEROPENEM", max: 5, min: 2, cat: "PROTOCOLO DE SEPSE", active: "MEROPENEM" },
  { id: "3606", desc: "VANCOMICINA 500MG FR/AMP", max: 5, min: 2, cat: "PROTOCOLO DE SEPSE", active: "VANCOMICINA" },
  { id: "2144", desc: "LEVOTAC 5MG/ML-100ML BOLSA - LEVOFLOXACINO", max: 2, min: 1, cat: "PROTOCOLO DE SEPSE", active: "LEVOFLOXACINO" },
  { id: "208637", desc: "PIPERACILINA/TAZOBACTAM 4.000/500 MG FR/AMP", max: 10, min: 3, cat: "PROTOCOLO DE SEPSE", active: "PIPERACILINA/TAZOBACTAM" },
  { id: "1385", desc: "INVANZ 1.000MG FR/AMP - ERTAPENEM", max: 5, min: 2, cat: "PROTOCOLO DE SEPSE", active: "ERTAPENEM" },
  { id: "149552", desc: "CLOCEF 1.000MG FR/AMP - CEFEPIMA", max: 3, min: 1, cat: "PROTOCOLO DE SEPSE", active: "CEFEPIMA" },
  { id: "46413", desc: "AZITROMICINA 500MG FR/AMP EV CRISTALIA", max: 10, min: 3, cat: "PROTOCOLO DE SEPSE", active: "AZITROMICINA" },
  { id: "150686", desc: "METRONACK 5MG/ML-100ML FR-METRONIDAZOL", max: 5, min: 2, cat: "PROTOCOLO DE SEPSE", active: "METRONIDAZOL" },
  { id: "54031", desc: "CANULA NASAL INFANTIL OPTIFLOW JR 2 25L/MIN-OJR418", max: 10, min: 3, cat: "MATERIAIS CRÍTICOS", active: "CANULA OPTIFLOW" },
];

// --- UTILITÁRIOS ---
const parseNumberBR = (str: string | undefined): number => {
  if (!str) return 0;
  const cleanStr = String(str).replace(/"/g, '').trim().replace(',', '.');
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : Math.max(0, num);
};

const splitCSVLine = (text: string): string[] => {
  const re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\s\S][^'\\]*)*)'|"([^"\\]*(?:\\[\s\S][^"\\]*)*)"|([^;'",\s\\]*(?:\s+[^;'",\s\\]+)*))\s*(?:[;,]|$)/g;
  const a: string[] = [];
  text.replace(re_value, (_m0, m1, m2, m3) => {
    if (m1 !== undefined) a.push(m1);
    else if (m2 !== undefined) a.push(m2);
    else if (m3 !== undefined) a.push(m3);
    else a.push('');
    return '';
  });
  return a;
};

type SectorTab = 'UTI' | 'PS';

interface DBItem {
  id: string;
  desc: string;
  max: number;
  min: number;
  cat: string;
  active: string;
}

interface EnrichedItem extends DBItem {
  phys: number;
  media: number;
  days: number;
  health: number;
  status: 'CRÍTICO' | 'ATENÇÃO' | 'ADEQUADO';
  colorClass: string;
  barColor: string;
}

interface GroupedItems {
  name: string;
  items: EnrichedItem[];
}

export const Criticidade: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SectorTab>('UTI');
  const [searchTerm, setSearchTerm] = useState('');
  const [importedStock, setImportedStock] = useState<Record<SectorTab, Record<string, number>>>({ UTI: {}, PS: {} });
  const [importedAverage, setImportedAverage] = useState<Record<SectorTab, Record<string, number>>>({ UTI: {}, PS: {} });
  const [viewMode, setViewMode] = useState<'CATEGORY' | 'PRINCIPLE'>('CATEGORY');

  const enrichedItems = useMemo<EnrichedItem[]>(() => {
    const currentStock = importedStock[activeTab] || {};
    const currentAverage = importedAverage[activeTab] || {};
    const currentDatabase: DBItem[] = activeTab === 'UTI' ? databaseUTI : databasePS;

    return currentDatabase.map(item => {
      const phys = currentStock[item.id] ?? 0;
      const media = currentAverage[item.id] ?? 0;
      const days = media > 0 ? phys / media : phys > 0 ? 999 : 0;
      const health = item.max > 0 ? (phys / item.max) * 100 : 0;

      let status: EnrichedItem['status'] = 'ADEQUADO';
      let colorClass = 'text-emerald-700 bg-emerald-50 border-emerald-100';
      let barColor = 'bg-emerald-500';

      if (phys <= item.min || days <= 2) {
        status = 'CRÍTICO';
        colorClass = 'text-rose-700 bg-rose-50 border-rose-100';
        barColor = 'bg-rose-500';
      } else if (phys <= item.min * 1.5 || days <= 5) {
        status = 'ATENÇÃO';
        colorClass = 'text-amber-700 bg-amber-50 border-amber-100';
        barColor = 'bg-amber-500';
      }

      return { ...item, phys, media, days, health, status, colorClass, barColor };
    });
  }, [importedStock, importedAverage, activeTab]);

  const stats = useMemo(() => ({
    total: enrichedItems.length,
    criticos: enrichedItems.filter(i => i.status === 'CRÍTICO').length,
    atencao: enrichedItems.filter(i => i.status === 'ATENÇÃO').length,
    adequados: enrichedItems.filter(i => i.status === 'ADEQUADO').length,
  }), [enrichedItems]);

  const finalGroups = useMemo<GroupedItems[]>(() => {
    const filtered = enrichedItems.filter(i =>
      i.desc.toLowerCase().includes(searchTerm.toLowerCase()) || i.id.includes(searchTerm)
    );

    if (viewMode === 'PRINCIPLE') {
      const groups: Record<string, GroupedItems> = {};
      filtered.forEach(item => {
        if (!groups[item.active]) groups[item.active] = { name: item.active, items: [] };
        groups[item.active].items.push(item);
      });
      return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
    } else {
      const cats: Record<string, GroupedItems> = {};
      filtered.forEach(item => {
        if (!cats[item.cat]) cats[item.cat] = { name: item.cat, items: [] };
        cats[item.cat].items.push(item);
      });
      return Object.values(cats).sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [enrichedItems, searchTerm, viewMode]);

  const handleStockImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const lines = (evt.target?.result as string).split('\n').filter(l => l.trim()).slice(1);
        const map: Record<string, number> = {};
        lines.forEach(l => {
          const c = splitCSVLine(l);
          const id = c[1]?.trim();
          const q = parseNumberBR(c[6]);
          if (id) map[id] = (map[id] || 0) + q;
        });
        setImportedStock(prev => ({ ...prev, [activeTab]: map }));
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const handleMediaImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const lines = (evt.target?.result as string).split('\n').filter(l => l.trim()).slice(1);
        const map: Record<string, number> = {};
        lines.forEach(l => {
          const c = splitCSVLine(l);
          const id = c[0]?.trim();
          const m = parseNumberBR(c[6]);
          if (id) map[id] = m;
        });
        setImportedAverage(prev => ({ ...prev, [activeTab]: map }));
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  // ─── EXPORTAÇÃO PDF DINÂMICA ─────────────────────────────────────────────────
  const handleExportPDF = () => {
    const color = activeTab === 'UTI' ? PDF_COLORS.indigo : PDF_COLORS.emerald;
    const taxaCritica = stats.total > 0 ? Math.round((stats.criticos / stats.total) * 100) : 0;
    const taxaAtencao = stats.total > 0 ? Math.round((stats.atencao / stats.total) * 100) : 0;

    const doc = new jsPDF('landscape' as any);
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // ── Cabeçalho ──────────────────────────────────────────────────────────────
    const subtitle = `Setor: ${activeTab}  |  Agrupamento: ${viewMode === 'CATEGORY' ? 'Categoria' : 'Princípio Ativo'}  |  Busca: "${searchTerm || 'todos'}"`;
    let currentY = drawPDFHeader(doc, `Relatório de Itens Críticos — ${activeTab}`, subtitle, color);

    // ── KPI Cards ──────────────────────────────────────────────────────────────
    currentY = drawKPICards(doc, [
      { label: 'Itens Monitorados', value: stats.total.toString(), color: PDF_COLORS.slate },
      { label: 'Críticos (Repor Já)', value: stats.criticos.toString(), color: PDF_COLORS.red },
      { label: 'Em Atenção', value: stats.atencao.toString(), color: PDF_COLORS.amber },
      { label: 'Adequados', value: stats.adequados.toString(), color: PDF_COLORS.emerald },
      {
        label: 'Taxa Crítica',
        value: `${taxaCritica}%`,
        color: taxaCritica >= 30 ? PDF_COLORS.red : taxaCritica >= 15 ? PDF_COLORS.amber : PDF_COLORS.emerald,
      },
      {
        label: 'Taxa Atenção',
        value: `${taxaAtencao}%`,
        color: taxaAtencao >= 30 ? PDF_COLORS.amber : PDF_COLORS.slate,
      },
    ], currentY);

    currentY += 4;

    // Legenda de cores
    const legendItems = [
      { label: 'CRÍTICO — Repor Já (≤ mín ou ≤ 2 dias)', r: 220, g: 38, b: 38 },
      { label: 'ATENÇÃO — Programar (≤ mín × 1,5 ou ≤ 5 dias)', r: 202, g: 138, b: 4 },
      { label: 'ADEQUADO — Estoque satisfatório', r: 5, g: 150, b: 105 },
    ];
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    let legX = 12;
    legendItems.forEach(leg => {
      doc.setFillColor(leg.r, leg.g, leg.b);
      doc.rect(legX, currentY, 3, 3, 'F');
      doc.setTextColor(71, 85, 105);
      doc.text(leg.label, legX + 4.5, currentY + 2.5);
      legX += 90;
    });
    currentY += 8;

    // ── Tabelas por grupo ──────────────────────────────────────────────────────
    finalGroups.forEach((group) => {
      const groupCrit = group.items.filter(i => i.status === 'CRÍTICO').length;
      const groupAtenc = group.items.filter(i => i.status === 'ATENÇÃO').length;

      // Quebra de página preventiva
      if (currentY + 22 > pageHeight - 20) {
        doc.addPage();
        currentY = 12;
      }

      // Cabeçalho de categoria — fundo colorido com accent
      doc.setFillColor(...color);
      doc.roundedRect(12, currentY, pageWidth - 24, 9, 1.5, 1.5, 'F');

      // Ícone de alerta se houver críticos
      if (groupCrit > 0) {
        const lighterRed: [number, number, number] = [254, 202, 202];
        doc.setFillColor(...lighterRed);
        doc.roundedRect(pageWidth - 60, currentY + 1, 47, 7, 1, 1, 'F');
        doc.setTextColor(185, 28, 28);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.text(`⚠ ${groupCrit} crítico(s)`, pageWidth - 36, currentY + 5.8, { align: 'center' });
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(group.name.toUpperCase(), 16, currentY + 6);

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      const summaryX = groupCrit > 0 ? pageWidth - 64 : pageWidth - 14;
      doc.text(
        `${group.items.length} item(s)  |  ${groupAtenc} em atenção`,
        summaryX,
        currentY + 6,
        { align: 'right' }
      );

      currentY += 11;

      // Linhas da tabela
      const rows = group.items.map(item => {
        const statusLabel = item.status === 'CRÍTICO' ? 'Repor Já' : item.status === 'ATENÇÃO' ? 'Programar' : 'Ok';
        const duracaoLabel = item.days === 999 ? '∞' : item.days === 0 ? '—' : item.days.toFixed(1) + 'd';
        return [
          item.id,
          item.desc,
          item.active,
          item.cat,
          item.phys.toFixed(0),
          item.min.toString(),
          item.max.toString(),
          item.media > 0 ? item.media.toFixed(2) : '—',
          duracaoLabel,
          statusLabel,
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['ID MV', 'Produto', 'Princípio Ativo', 'Categoria', 'Estoque', 'Mín', 'Máx', 'CDM', 'Duração', 'Status']],
        body: rows,
        theme: 'grid',
        margin: { left: 12, right: 12, bottom: 22 },
        styles: {
          fontSize: 7,
          cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
          valign: 'middle',
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 6.5,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 14, halign: 'center', fontStyle: 'bold', textColor: [71, 85, 105] },
          1: { cellWidth: 68, fontStyle: 'bold', textColor: [15, 23, 42] },
          2: { cellWidth: 28, textColor: [71, 85, 105] },
          3: { cellWidth: 34, textColor: [100, 116, 139], fontSize: 6 },
          4: { cellWidth: 14, halign: 'right' },
          5: { cellWidth: 10, halign: 'right', textColor: [100, 116, 139] },
          6: { cellWidth: 10, halign: 'right', textColor: [100, 116, 139] },
          7: { cellWidth: 14, halign: 'right' },
          8: { cellWidth: 16, halign: 'right' },
          9: { cellWidth: 'auto', halign: 'center', fontStyle: 'bold' },
        },
        didParseCell(data) {
          if (data.section === 'body') {
            const rawStatus = (data.row.raw as string[])[9];
            const isCritico = rawStatus === 'Repor Já';
            const isAtencao = rawStatus === 'Programar';

            // Fundo da linha por status
            if (isCritico) {
              data.cell.styles.fillColor = [255, 241, 242];
            } else if (isAtencao) {
              data.cell.styles.fillColor = [255, 251, 235];
            }

            // Coluna Status — cor dinâmica
            if (data.column.index === 9) {
              if (isCritico) {
                data.cell.styles.textColor = [185, 28, 28];
                data.cell.styles.fillColor = [254, 226, 226];
              } else if (isAtencao) {
                data.cell.styles.textColor = [180, 83, 9];
                data.cell.styles.fillColor = [254, 243, 199];
              } else {
                data.cell.styles.textColor = [4, 120, 87];
                data.cell.styles.fillColor = [236, 253, 245];
              }
            }

            // Estoque — vermelho se crítico
            if (data.column.index === 4 && isCritico) {
              data.cell.styles.textColor = [185, 28, 28];
              data.cell.styles.fontStyle = 'bold';
            }

            // Duração — vermelho se ≤ 2d
            if (data.column.index === 8) {
              const raw = String(data.cell.raw);
              const val = parseFloat(raw);
              if (!isNaN(val) && val <= 2) {
                data.cell.styles.textColor = [185, 28, 28];
                data.cell.styles.fontStyle = 'bold';
              }
            }

            // CDM — cinza se ausente
            if (data.column.index === 7 && data.cell.raw === '—') {
              data.cell.styles.textColor = [156, 163, 175];
            }
          }
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 5;
    });

    // ── Bloco de resumo final ──────────────────────────────────────────────────
    if (currentY + 28 > pageHeight - 22) {
      doc.addPage();
      currentY = 12;
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(12, currentY, pageWidth - 24, 22, 2, 2, 'FD');

    doc.setFillColor(...color);
    doc.roundedRect(12, currentY, 4, 22, 1, 1, 'F');

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo Geral da Conferência', 20, currentY + 8);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Total de itens monitorados: ${stats.total}  ·  Críticos: ${stats.criticos} (${taxaCritica}%)  ·  Em atenção: ${stats.atencao} (${taxaAtencao}%)  ·  Adequados: ${stats.adequados}`,
      20, currentY + 15
    );

    const conf = Object.values(importedStock[activeTab] || {}).length;
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6.5);
    doc.text(
      conf > 0
        ? `Conferência importada: ${conf} produto(s) com saldo físico`
        : 'Nenhuma conferência importada — exibindo valores de referência zerados.',
      20, currentY + 20
    );

    // ── Rodapé em todas as páginas ─────────────────────────────────────────────
    drawPDFFooters(doc, color);

    const filename = `Itens_Criticos_${activeTab}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
    doc.save(filename);
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="font-sans text-slate-900 bg-[#F8FAFC]">

      {/* Sub-abas UTI / PS */}
      <div className="mb-6 flex justify-center">
        <div className="bg-slate-200/60 p-1.5 rounded-2xl flex gap-2 w-full max-w-md shadow-inner border border-slate-200">
          <button
            onClick={() => setActiveTab('UTI')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs transition-all duration-300 ${
              activeTab === 'UTI'
                ? 'bg-white text-indigo-700 shadow-md ring-1 ring-slate-900/5 scale-105 z-10'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            <Bed className="w-4 h-4" /> ITENS CRÍTICOS UTI
          </button>
          <button
            onClick={() => setActiveTab('PS')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs transition-all duration-300 ${
              activeTab === 'PS'
                ? 'bg-white text-indigo-700 shadow-md ring-1 ring-slate-900/5 scale-105 z-10'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            <Stethoscope className="w-4 h-4" /> ITENS CRÍTICOS PS
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <header className="flex items-center justify-between gap-6 bg-white flex-col md:flex-row mb-8 p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl shadow-xl ${activeTab === 'UTI' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
              <Database className="text-white w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-800 uppercase">
                Itens Críticos <span className={activeTab === 'UTI' ? 'text-indigo-600' : 'text-emerald-600'}>{activeTab}</span>
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Monitoramento Específico do Setor
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-xl shadow-lg hover:bg-slate-900 transition-all text-[11px] font-bold"
            >
              <FileDown className="w-4 h-4" /> Exportar PDF
            </button>
            <label className={`flex items-center gap-2 px-5 py-2.5 text-white rounded-xl shadow-lg cursor-pointer transition-all text-[11px] font-bold ${activeTab === 'UTI' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              <FileUp className="w-4 h-4" /> Importar Consumo ({activeTab})
              <input type="file" accept=".csv" className="hidden" onChange={handleMediaImport} />
            </label>
            <label className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-all text-[11px] font-bold text-slate-600">
              <FileUp className={`w-4 h-4 ${activeTab === 'UTI' ? 'text-indigo-500' : 'text-emerald-500'}`} /> Importar Conferência ({activeTab})
              <input type="file" accept=".csv" className="hidden" onChange={handleStockImport} />
            </label>
          </div>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-4 md:gap-6 mb-10">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <p className="font-black uppercase tracking-widest mb-2 text-[10px] text-slate-400">Itens Monitorados</p>
            <div className="flex items-center gap-3">
              <span className="font-black text-slate-800 text-4xl">{stats.total}</span>
              <Package className="w-6 h-6 text-slate-200" />
            </div>
          </div>
          <div className="bg-rose-500 rounded-[2rem] text-white shadow-xl shadow-rose-100 p-6">
            <p className="font-black uppercase tracking-widest mb-2 text-[10px] text-rose-100">Críticos (Repor Já)</p>
            <div className="flex items-center justify-between">
              <span className="font-black text-4xl">{stats.criticos}</span>
              <AlertTriangle className="w-8 h-8 opacity-50" />
            </div>
          </div>
          <div className="bg-amber-400 rounded-[2rem] text-white shadow-xl shadow-amber-100 p-6">
            <p className="font-black uppercase tracking-widest mb-2 text-[10px] text-amber-50">Em Atenção</p>
            <div className="flex items-center justify-between">
              <span className="font-black text-4xl">{stats.atencao}</span>
              <AlertCircle className="w-8 h-8 opacity-50" />
            </div>
          </div>
        </div>

        {/* Filtros e Pesquisa */}
        <div className="flex flex-col md:flex-row gap-4 mb-10 items-center justify-between">
          <div className="flex bg-slate-200/50 p-1 rounded-2xl w-fit border border-slate-200">
            <button
              onClick={() => setViewMode('CATEGORY')}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black transition-all ${viewMode === 'CATEGORY' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
            >
              <LayoutGrid className="w-4 h-4" /> Categorias
            </button>
            <button
              onClick={() => setViewMode('PRINCIPLE')}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black transition-all ${viewMode === 'PRINCIPLE' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
            >
              <Layers className="w-4 h-4" /> Princípio Ativo
            </button>
          </div>

          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input
              type="text"
              placeholder={`Pesquisar na ${activeTab}...`}
              className="w-full pl-12 pr-6 py-4 bg-white border-0 rounded-2xl text-sm font-medium shadow-sm outline-none focus:ring-4 focus:ring-slate-500/10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Listagem por Grupos */}
        <div className="space-y-12">
          {finalGroups.map(group => (
            <section key={group.name} className="animate-in fade-in slide-in-from-bottom-2 duration-500 break-inside-avoid">
              <div className="flex items-center gap-4 mb-6">
                <h2 className="font-black text-slate-400 uppercase tracking-widest flex items-center gap-3 text-sm">
                  <div className={`w-1.5 h-6 rounded-full ${activeTab === 'UTI' ? 'bg-indigo-500' : 'bg-emerald-500'}`}></div>
                  {group.name}
                </h2>
                <div className="h-px flex-1 bg-slate-200"></div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {group.items.map(item => (
                  <div key={item.id + item.desc} className="bg-white overflow-hidden rounded-[2rem] border border-slate-100 shadow-sm">
                    <div className="flex items-center flex-col md:flex-row p-6 gap-6">

                      {/* Descrição */}
                      <div className="flex-1 min-w-0 w-full">
                        <h3 className="font-black text-slate-800 uppercase leading-tight truncate text-sm">{item.desc}</h3>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="font-mono font-bold text-slate-400 text-[10px]">MV {item.id}</span>
                          <div className="flex items-center gap-1.5 rounded px-2 py-0.5 border border-slate-100 bg-slate-50">
                            <Target className="w-3 h-3 text-slate-400" />
                            <span className="font-black text-slate-500 uppercase tracking-tighter text-[9px]">Mín {item.min} / Máx {item.max}</span>
                          </div>
                        </div>
                      </div>

                      {/* Métricas */}
                      <div className="flex items-center text-center shrink-0 gap-10">
                        <div className="w-16">
                          <p className="font-black text-slate-400 uppercase mb-1 text-[8px]">Estoque</p>
                          <p className={`font-black text-base ${item.phys <= item.min ? 'text-rose-600' : 'text-slate-700'}`}>
                            {item.phys.toFixed(0)}
                          </p>
                        </div>
                        <div className="w-16">
                          <p className="font-black text-slate-400 uppercase mb-1 text-[8px]">Média</p>
                          <p className="font-black text-slate-500 text-sm">{item.media.toFixed(2)}</p>
                        </div>
                        <div className="w-20">
                          <p className="font-black text-slate-400 uppercase mb-1 text-[8px]">Duração</p>
                          <div className={`font-black flex items-center justify-center gap-0.5 text-sm ${item.days <= 2 ? 'text-rose-600' : 'text-slate-800'}`}>
                            {item.days === 999 ? '∞' : Math.floor(item.days)}
                            <span className="font-bold opacity-40 ml-0.5 uppercase tracking-tighter text-[9px]">D</span>
                          </div>
                        </div>
                      </div>

                      {/* Badge de Status */}
                      <div className={`flex items-center justify-center border text-center font-black uppercase tracking-tight gap-2 px-5 py-3 rounded-2xl min-w-[160px] text-[10px] ${item.colorClass}`}>
                        {item.status === 'CRÍTICO' && <AlertTriangle className="w-3.5 h-3.5" />}
                        {item.status === 'ATENÇÃO' && <AlertCircle className="w-3.5 h-3.5" />}
                        {item.status === 'ADEQUADO' && <CheckCircle className="w-3.5 h-3.5" />}
                        {item.status === 'CRÍTICO' ? 'Repor Já' : item.status === 'ATENÇÃO' ? 'Programar' : 'Ok'}
                      </div>
                    </div>

                    {/* Barra de Saúde */}
                    <div className="h-1.5 bg-slate-50 w-full relative">
                      <div
                        className={`h-full transition-all duration-1000 ${item.barColor}`}
                        style={{ width: `${Math.min(item.health, 100)}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-rose-400/40 z-10"
                        style={{ left: `${(item.min / item.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Rodapé */}
        <footer className="mt-16 p-10 bg-slate-900 rounded-[3.5rem] text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-white/5 rounded-[1.5rem] border border-white/10 flex items-center justify-center shadow-inner">
              <Clock className="text-indigo-400 w-8 h-8" />
            </div>
            <div>
              <h4 className="font-black text-base uppercase tracking-widest">Segurança Assistencial</h4>
              <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed mt-1">
                A cor da linha na barra indica o ponto de pedido. A cor{' '}
                <span className="text-rose-400 font-bold">Vermelha</span> indica risco de falta em menos de 48h.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="px-6 py-4 bg-white/5 rounded-3xl border border-white/10 text-center min-w-[120px]">
              <p className="text-[8px] font-black text-rose-500 uppercase mb-1 tracking-widest">Urgência</p>
              <p className="text-sm font-black">≤ 2 dias</p>
            </div>
            <div className="px-6 py-4 bg-white/5 rounded-3xl border border-white/10 text-center min-w-[120px]">
              <p className="text-[8px] font-black text-amber-500 uppercase mb-1 tracking-widest">Atenção</p>
              <p className="text-sm font-black">3 a 5 dias</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
