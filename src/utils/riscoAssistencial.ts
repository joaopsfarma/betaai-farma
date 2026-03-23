// ─── RISCO ASSISTENCIAL ───────────────────────────────────────────────────────

export type RiscoLevel = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO';
export interface RiscoInfo { label: string; level: RiscoLevel; bg: string; text: string; impacto: string; ordem: number }

export function getRiscoAssistencial(nome: string): RiscoInfo {
  const n = nome.toUpperCase();
  const has = (k: string) => n.includes(k);

  // ── CRÍTICO ── risco imediato de vida
  if (has('VANCOMICIN') || has('MEROPENEM') || has('TAZOBACT') || has('CEFEPIM') || has('IMIPENEM') || has('POLIMIXIN') || has('AMICACIN') || has('GENTAMICIN') || has('CEFTRIAX') || has('CEFTAZID'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Falha terapêutica em sepse/infecção grave — risco de óbito', ordem: 4 };
  if (has('CIRCUITO') && (has('RESPIRAT') || has('ANESTESIA') || has('VENTILA')))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Impossibilidade de ventilação mecânica/anestesia — risco de óbito por falência respiratória', ordem: 4 };
  if (has('CANULA') && (has('TRAQUEOST') || has('TRAQUEO')))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Perda de via aérea em paciente traqueostomizado — risco de óbito por asfixia', ordem: 4 };
  if (has('NORADRENALI') || has('DOPAMINA') || has('DOBUTAMIN') || has('ADRENALI') || has('VASOPRES') || has('EPINEFRINA'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Choque refratário sem vasopressor — parada cardíaca iminente', ordem: 4 };
  if (has('HEPARIN') || has('HEPARINA'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Tromboembolismo pulmonar / coagulopatia — risco de óbito', ordem: 4 };
  if (has('AMIODARONA') || has('NITROPRUSSI') || has('ADENOSINA'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Arritmia grave / crise hipertensiva sem controle', ordem: 4 };
  if (has('MORFINA') || has('FENTANIL') || has('SUFENTANIL') || has('REMIFENTANIL') || has('FENTANEST') || has('RELYON'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Dor aguda sem controle / depressão respiratória em UTI', ordem: 4 };
  if (has('MIDAZOLAM') || has('PROPOFOL') || has('CETAMINA') || has('DEXMEDETOM'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Sedação inadequada em UTI ou cirurgia — agitação e trauma', ordem: 4 };
  if (has('INSULINA'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Cetoacidose diabética / coma hiperosmolar — risco de óbito', ordem: 4 };

  if (has('ALBUMINA'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Hipoalbuminemia crítica — edema, infecção e falência orgânica', ordem: 4 };
  if (has('IMUNOGLOBULIN'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Imunodeficiência grave sem cobertura — infecções oportunistas', ordem: 4 };
  if (has('ERITROPOETIN'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Anemia grave em paciente dialítico — dependência transfusional', ordem: 4 };
  if (has('PLASMA') || has('HEMÁCIAS') || has('PLAQUETA') || has('CRIOPRECIP'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Choque hemorrágico / coagulopatia grave — risco de óbito', ordem: 4 };
  if (has('QUIMIO') || has('ANTINEOPLÁS') || has('CISPLAT') || has('CARBOPLAT') || has('METOTREXAT') || has('VINCRIST') || has('DOXORRUB') || has('ETOPOSID') || has('PACLITAX') || has('RITUXIMAB'))
    return { label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto: 'Interrupção de protocolo oncológico — progressão tumoral', ordem: 4 };

  // ── ALTO ── risco clínico significativo
  if (has('AZITROMICIN') || has('AMOXICILI') || has('CIPROFLOX') || has('CLINDAMIC') || has('FLUCONAZ') || has('METRONIDAZ') || has('SULFAMETOX') || has('NITROFURANT') || has('SULBACTAM') || has('AMPICILIN'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Falha no tratamento de infecção bacteriana/fúngica — risco de complicações', ordem: 3 };
  if (has('ACICLOVIR'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Encefalite herpética / herpes grave sem antiviral — sequelas neurológicas', ordem: 3 };
  if (has('ENOXAPARIN') || has('WARFARIN') || has('DABIGATR') || has('RIVAROX') || has('APIXAB') || has('CLEXANE') || has('FONDAPAR'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Trombose venosa profunda / TEP — AVC isquêmico em pacientes anticoagulados', ordem: 3 };
  if (has('DIETA ENTERAL') || has('ENTERAL') || has('SURVIMED') || has('NUTRISON') || has('FRESUBIN') || has('ISOSOURCE'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Desnutrição hospitalar — piora clínica, infecções e maior mortalidade', ordem: 3 };
  if (has('LEVODOPA') || has('BENSERAZIDA') || has('PRAMIPEX') || has('PROLOPA'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Rigidez, crise e hospitalização prolongada em paciente com Parkinson', ordem: 3 };
  if (has('CODEINA') || has('TRAMADOL') || has('DULOXETIN') || has('PREGABALINA') || has('GABAPENTIN') || has('CETOROLACO') || has('TORAGESIC') || has('CETOROLAC'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Dor aguda/crônica sem controle — piora funcional e qualidade de vida', ordem: 3 };
  if (has('ONDANSETR') || has('PALONOSETR') || has('ANSENTRON') || has('METOCLOPRA'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Náuseas/vômitos sem controle — desidratação, aspiração e interrupção de quimio', ordem: 3 };
  if (has('DEXAMETASON') || has('PREDNISOLON') || has('METILPREDNISOLON') || has('HIDROCORTISON'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Crise adrenal / resposta inflamatória descontrolada — choque', ordem: 3 };
  if (has('OMEPRAZOL') || has('PANTOPRAZOL') || has('RANITIDINA') || has('LANSOPRAZOL'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Hemorragia digestiva alta em paciente de risco / úlcera de estresse em UTI', ordem: 3 };
  if (has('PROCTYL') || has('POLICRESULENO') || has('XYLOPROCT'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Dor e desconforto anorretal sem tratamento — piora clínica em pós-operatório proctológico', ordem: 3 };
  if (has('FUROSEMIDA') || has('CAPTOPRIL') || has('ENALAPRIL') || has('METOPROLOL') || has('ATENOLOL') || has('LOSARTAN') || has('AMLODIP') || has('ROSUVASTAT') || has('ATORVASTAT') || has('SINVASTAT'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Crise hipertensiva / descompensação cardíaca / risco cardiovascular elevado sem controle lipídico', ordem: 3 };
  if (has('SORO FISIOL') || has('SOLUÇÃO FISIOL') || has('RINGER') || has('GLICOSE') || has('SORO GLICO'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Impossibilidade de hidratação IV e diluição de medicamentos críticos', ordem: 3 };
  if (has('SONDA') || has('CATETER') || has('DRENO'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Impossibilidade de procedimento invasivo — risco de infecção e complicação', ordem: 3 };
  if (has('BISTURI') || has('PLACA DE BISTURI') || has('LAMINA DE BISTURI') || has('CABO DE BISTURI'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Impossibilidade de procedimento cirúrgico — atraso em cirurgias e risco ao paciente', ordem: 3 };
  if (has('SERINGA') || has('AGULHA'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Interrupção da administração de medicamentos injetáveis', ordem: 3 };
  if (has('CURATIVO') || has('ATADURA') || has('FILME TRANSPAR') || has('TEGADERM'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Ferida exposta sem cobertura — infecção e retardo da cicatrização', ordem: 3 };
  if (has('FLUOXETIN') || has('ESCITALOPRAM') || has('LEXAPRO') || has('SERTRALINA') || has('CLONAZEP') || has('HALOPERIDOL') || has('QUETIAPINA') || has('RISPERIDON'))
    return { label: 'Alto', level: 'ALTO', bg: '#fff7ed', text: '#ea580c', impacto: 'Descompensação psiquiátrica / ansiedade grave — risco para si e outros', ordem: 3 };

  // ── MÉDIO ── risco de suporte / operacional
  if (has('FRALDA'))
    return { label: 'Médio', level: 'MEDIO', bg: '#fefce8', text: '#d97706', impacto: 'Lesão por pressão e dermatite — aumento de internação e custos', ordem: 2 };
  if (has('MASCARA') || has('LUVA') || has('AVENTAL') || has('CAPOTE') || has('PROPÉ') || has('TOUCA'))
    return { label: 'Médio', level: 'MEDIO', bg: '#fefce8', text: '#d97706', impacto: 'Risco de infecção cruzada e IRAS — comprometimento da biossegurança', ordem: 2 };
  if (has('ELETRODO') || has('OXIMETRO') || has('OXÍMETRO') || has('GLICOSIMETRO') || has('TERMÔMETRO') || has('ESFIGMO'))
    return { label: 'Médio', level: 'MEDIO', bg: '#fefce8', text: '#d97706', impacto: 'Comprometimento da monitorização do paciente', ordem: 2 };
  if (has('EQUIPO') || has('EXTENSOR') || has('NEBULIZ') || has('ESPACADOR') || has('AGACHAMBER'))
    return { label: 'Médio', level: 'MEDIO', bg: '#fefce8', text: '#d97706', impacto: 'Atraso na administração de medicamentos / terapia inalatória', ordem: 2 };
  if (has('PROBIOTICO') || has('ENTEROGERMINA') || has('FLORATIL'))
    return { label: 'Médio', level: 'MEDIO', bg: '#fefce8', text: '#d97706', impacto: 'Comprometimento da recomposição de flora intestinal — risco de diarreia associada a antibióticos', ordem: 2 };
  if (has('GAZE') || has('COMPRESSA') || has('BANDAGEM') || has('ESPARADRAPO') || has('MICROPORE'))
    return { label: 'Médio', level: 'MEDIO', bg: '#fefce8', text: '#d97706', impacto: 'Comprometimento de curativos e procedimentos menores', ordem: 2 };
  if (has('SENSOR DESCART') || has('SENSOR'))
    return { label: 'Médio', level: 'MEDIO', bg: '#fefce8', text: '#d97706', impacto: 'Comprometimento da monitorização contínua', ordem: 2 };
  if (has('FIO SUTURA') || has('SUTURA'))
    return { label: 'Médio', level: 'MEDIO', bg: '#fefce8', text: '#d97706', impacto: 'Impossibilidade de sutura cirúrgica — risco de deiscência', ordem: 2 };
  if (has('ESPESSANTE') || has('THICKEN'))
    return { label: 'Médio', level: 'MEDIO', bg: '#fefce8', text: '#d97706', impacto: 'Risco de aspiração em pacientes disfágicos', ordem: 2 };
  if (has('BOBINA') || has('SACO PLAST') || has('SACO LIXO') || has('LACRE') || has('HAMPER'))
    return { label: 'Médio', level: 'MEDIO', bg: '#fefce8', text: '#d97706', impacto: 'Comprometimento da gestão de resíduos hospitalares', ordem: 2 };

  // ── BAIXO ── impacto operacional/administrativo
  return { label: 'Baixo', level: 'BAIXO', bg: '#f8fafc', text: '#64748b', impacto: 'Impacto operacional/administrativo — sem risco direto ao paciente', ordem: 1 };
}
