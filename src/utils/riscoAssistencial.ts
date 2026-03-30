// ─── RISCO ASSISTENCIAL ───────────────────────────────────────────────────────

export type RiscoLevel = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO';
export interface RiscoInfo { label: string; level: RiscoLevel; bg: string; text: string; impacto: string; ordem: number }

const CRITICO = (impacto: string): RiscoInfo => ({ label: 'Crítico', level: 'CRITICO', bg: '#fef2f2', text: '#dc2626', impacto, ordem: 4 });
const ALTO    = (impacto: string): RiscoInfo => ({ label: 'Alto',    level: 'ALTO',    bg: '#fff7ed', text: '#ea580c', impacto, ordem: 3 });
const MEDIO   = (impacto: string): RiscoInfo => ({ label: 'Médio',   level: 'MEDIO',   bg: '#fefce8', text: '#d97706', impacto, ordem: 2 });
const BAIXO   = (): RiscoInfo => ({ label: 'Baixo', level: 'BAIXO', bg: '#f8fafc', text: '#64748b', impacto: 'Impacto operacional/administrativo — sem risco direto ao paciente', ordem: 1 });

export function getRiscoAssistencial(nome: string): RiscoInfo {
  const n = nome.toUpperCase();
  const has = (k: string) => n.includes(k);
  const matchAny = (arr: string[]) => arr.some(has);

  // ══════════════════════════════════════════════════════════════════════════
  // ██  CRÍTICO  — risco imediato de vida / suporte orgânico invasivo
  // ══════════════════════════════════════════════════════════════════════════

  // Antimicrobianos de Amplo Espectro / Reserva Terapêutica
  const amCritico = ['VANCOMICIN', 'MEROPENEM', 'TAZOBACT', 'CEFEPIM', 'IMIPENEM', 'POLIMIXIN', 'AMICACIN', 'GENTAMICIN', 'CEFTRIAX', 'CEFTAZID', 'ERTAPENEM', 'NVANZ', 'DAPTOMICIN', 'EXFUNO', 'LINEZOLID', 'TIGECICLINA', 'CEFTAROLINA', 'COLISTINA', 'ANFOTERICINA', 'CASPOFUNGIN', 'MICAFUNGINA', 'VORICONAZ', 'AZTREONAM'];
  if (matchAny(amCritico)) return CRITICO('Falha terapêutica em sepse/infecção grave — risco de choque e óbito');

  // Vasopressores, Inotrópicos e Ressuscitação
  const vasoCritico = ['NORADRENALI', 'DOPAMINA', 'DOBUTAMIN', 'ADRENALI', 'VASOPRES', 'EPINEFRINA', 'EFEDRINA', 'UNIFEDRINE', 'MILRINON', 'LEVOSIMENDAN', 'METARAMINOL', 'ARAMIN'];
  if (matchAny(vasoCritico)) return CRITICO('Choque refratário sem suporte hemodinâmico — parada cardíaca iminente');

  // Antiarrítmicos e Vasodilatadores Potentes IV
  const arrCritico = ['AMIODARONA', 'NITROPRUSSI', 'NIPRIDE', 'ADENOSINA', 'ATROPINA', 'ESMOLOL', 'BREVIBLOC', 'PROPAFENONA', 'LIDOCAINA EV', 'LIDOCAÍNA EV'];
  if (matchAny(arrCritico)) return CRITICO('Arritmia grave / crise hipertensiva aguda não controlada');

  // Sedação Profunda e Analgesia Opióide em UTI/Centro Cirúrgico
  const sedCritico = ['MORFINA', 'FENTANIL', 'SUFENTANIL', 'REMIFENTANIL', 'FENTANEST', 'RELYON', 'MIDAZOLAM', 'PROPOFOL', 'CETAMINA', 'KETAMINA', 'DEXMEDETOM', 'PRECEDEX', 'TIOPENTAL', 'ETOMIDATO', 'DORMONID', 'METADONA', 'MYTEDON', 'SEVOFLURANO', 'SEVONESS'];
  if (matchAny(sedCritico)) return CRITICO('Depressão respiratória descontrolada / sedação inadequada em via aérea avançada');

  // Bloqueadores Neuromusculares e Reversão
  const bnmCritico = ['SUGAMADEX', 'BRYONY', 'ROCURONIO', 'ROCURON', 'VECURONIO', 'ATRACURIO', 'CISATRACURIO', 'SUCCINILCOLINA', 'NIMBEX', 'NEOSTIGMINA', 'PROSTIGMINE'];
  if (matchAny(bnmCritico)) return CRITICO('Bloqueio neuromuscular instável ou falha na reversão pós-anestésica — apneia prolongada');

  // Insulinas (Risco de Hipoglicemia Severa ou CAD)
  const insCritico = ['INSULINA', 'LANTUS', 'TRESIBA', 'NOVORAPID', 'HUMALOG', 'APIDRA', 'TOUJEO', 'LEVEMIR', 'GLARGINA', 'LISPRO'];
  if (matchAny(insCritico)) return CRITICO('Descompensação diabética crônica (cetoacidose) ou choque hipoglicêmico');

  // Eletrólitos Concentrados (MAV - Medicamentos de Alta Vigilância)
  const eletrCritico = ['CLORETO DE POTASSIO', 'CLORETO POTASSIO', 'KCL', 'GLUCONATO CALCIO', 'GLUCONATO DE CALCIO', 'BICARBONATO SODIO', 'BICARBONATO DE SODIO', 'FOSFATO POTASSIO', 'SULFATO MAGNESIO', 'SULFATO DE MAGNESIO', 'MAGNESIO 50%', 'POTASSIO 19', 'NACL 20%'];
  if (matchAny(eletrCritico)) return CRITICO('Distúrbio eletrolítico crítico com instabilidade cardíaca iminente');

  // Hemoderivados e Volume de Resgate
  const hemodCritico = ['ALBUMINA', 'IMUNOGLOBULIN', 'ERITROPOETIN', 'ALFAEPOETIN', 'EPREX', 'PLASMA', 'HEMÁCIAS', 'PLAQUETA', 'CRIOPRECIP', 'FILGRASTIM', 'FIPRIMA'];
  if (matchAny(hemodCritico)) return CRITICO('Choque hipovolêmico grave / falência imunológica primária ou hematopoiética');

  // Anticoagulantes Críticos e Trombolíticos
  const coagCritico = ['HEPARIN', 'HEPARINA', 'UROQUINASE', 'AUROLOCK', 'TAUROLIDINA', 'ALTEPLASE', 'ACTILYSE', 'TENECTEPLASE', 'STREPTOQUINASE'];
  if (matchAny(coagCritico)) return CRITICO('Hemorragia sistêmica não controlada ou isquemia aguda por trombose');

  // Quimioterápicos / Imunomoduladores Oncológicos
  const quimioCritico = ['QUIMIO', 'ANTINEOPLÁS', 'CISPLAT', 'CARBOPLAT', 'METOTREXAT', 'VINCRIST', 'DOXORRUB', 'ETOPOSID', 'PACLITAX', 'RITUXIMAB', 'IPILIMUMAB', 'YERVOY', 'PERTUZUMAB', 'TRASTUZUMAB', 'PHESGO', 'FOLINATO', 'FAULDLEUCO', 'ONCOKIT', 'CICLOFOSFAMIDA', 'FLUOROURACIL', 'PEMBROLIZUMAB'];
  if (matchAny(quimioCritico)) return CRITICO('Atraso incompatível com protocolo oncológico rigoroso — progressão celular');

  // Antídotos Específicos
  const antidCritico = ['AZUL METILENO', 'ZUL METILENO', 'FLUMAZENIL', 'LANEXAT', 'NALOXONA', 'NARCAN', 'CARVAO ATIVADO', 'SORO ANTIOFIDICO', 'ANTIARACNIDEO'];
  if (matchAny(antidCritico)) return CRITICO('Intoxicação severa sem antagonista/antídoto administrado a tempo');

  // Vias Aéreas, Ventilação e Acesso Venoso Central
  const vaCritico = ['CIRCUITO RESPIRAT', 'CIRCUITO VENTILA', 'CIRCUITO ANESTESIA', 'CANULA TRAQUEOST', 'TUBO ENDOTRAQUEAL', 'VALVULA TRAQUEOSTOMIA', 'ALVULA TRAQUEOSTOMIA', 'CATETER VENOSO CENTRAL', 'CATETER PICC', 'LARINGOSCOPIO', 'LAMINA DE LARINGOSCOPIO'];
  if (matchAny(vaCritico)) return CRITICO('Acidente em via aérea avançada / impossibilidade de suporte ventilatório ou acesso venoso vital');

  // Terapia Renal Substitutiva
  const trsCritico = ['HEMOLENTA', 'HEMODIAL', 'CAPILAR DIALISE', 'FILTRO DIALISE', 'LINHA ARTERIAL E VENOSA HD', 'TRICIT', 'CITRATO SODIO'];
  if (matchAny(trsCritico)) return CRITICO('Impossibilidade técnica de realizar Terapia Renal Substitutiva em paciente urêmico');

  // Hipertensão Intracraniana
  const neuroCritico = ['MANITOL'];
  if (matchAny(neuroCritico)) return CRITICO('Hipertensão intracraniana não drenada — risco iminente de herniação cerebral');

  // Opióide contínuo (Adesivo de Buprenorfina)
  if (has('BUPRENORFINA') || has('RESTIVA'))
    return CRITICO('Interrupção da analgesia por opióide forte, desencadeando crise de dor severa e abstinência');

  // Aventais cirúrgicos estéreis
  if (has('AVENTAL CIRUR') || has('AVENTAL CIRÚR'))
    return CRITICO('Interrupção obrigatória das cirurgias agendadas da UTI e CC por quebra de barreira estéril');

  // ══════════════════════════════════════════════════════════════════════════
  // ██  ALTO  — risco clínico significativo / interrupção de cuidado avançado
  // ══════════════════════════════════════════════════════════════════════════

  // Antimicrobianos Intermediários ou Orais/Tópicos Sistêmicos
  const amAlto = ['AZITROMICIN', 'AMOXICILI', 'CIPROFLOX', 'CLINDAMIC', 'FLUCONAZ', 'METRONIDAZ', 'SULFAMETOX', 'NITROFURANT', 'SULBACTAM', 'AMPICILIN', 'CLARITROMICIN', 'KLARICID', 'NORFLOXACIN', 'CEFOXITINA', 'KEFOX', 'DOXICICLINA', 'CEFALEXINA', 'CEFAZOLINA', 'CEFALOTINA', 'PENICILINA', 'BENZATACIL', 'ACICLOVIR', 'OSELTAMIVIR', 'TAMIFLU'];
  if (matchAny(amAlto)) return ALTO('Piora de quadro infeccioso ou infecção cirúrgica profilática');

  // Anticoagulantes Orais, Profilaxia de TEV e Antiplaquetários
  const coagAlto = ['ENOXAPARIN', 'WARFARIN', 'DABIGATR', 'RIVAROX', 'APIXAB', 'CLEXANE', 'FONDAPAR', 'VOLARE', 'EMBO', 'CLOPIDOGREL', 'AAS', 'ACIDO ACETILSALICILICO', 'ÁCIDO ACETILSALICÍLICO', 'CILOSTAZOL', 'CEBRALAT', 'TICAGRELOR', 'PRASUGREL'];
  if (matchAny(coagAlto)) return ALTO('Trombose venosa profunda incipiente / falência de stent ou TEP silencioso');

  // Antifibrinolíticos
  const fibriAlto = ['TRANEXAMI', 'ACIDO TRANEXAMI', 'TRANSAMIN', 'EPSILON'];
  if (matchAny(fibriAlto)) return ALTO('Controle sangramento perioperatório ou uterino debilitado');

  // Corticosteróides e Supressão Adrenal Sistêmica
  const cortAlto = ['DEXAMETASON', 'PREDNISOLON', 'METILPREDNISOLON', 'HIDROCORTISON', 'PREDNISONA', 'CRISPRED', 'SOLUMEDROL', 'DECADRON', 'BETAMETASONA', 'DUOFLAM', 'FLUDROCORTISONA'];
  if (matchAny(cortAlto)) return ALTO('Imunossupressão ou crise adrenal descompensada / choque anafilático progressivo');

  // Neurologia/Psiquiatria Crônica (Anticonvulsivantes, Neurolépticos, Antidepressivos de controle rígido)
  const neuroAlto = ['LEVODOPA', 'BENSERAZIDA', 'PRAMIPEX', 'PROLOPA', 'FLUOXETIN', 'ESCITALOPRAM', 'LEXAPRO', 'SERTRALINA', 'CLONAZEP', 'CLOPAM', 'HALOPERIDOL', 'QUETIAPINA', 'RISPERIDON', 'DIAZEPAM', 'COMPAZ', 'TOPIRAMATO', 'LACOSAMIDA', 'VIMPAT', 'CARBAMAZEPIN', 'FENOBARBITAL', 'GARDENAL', 'HIDANTAL', 'FENITOIN', 'ACIDO VALPROICO', 'DEPAKENE', 'OXCARBAZEPINA', 'LITIO', 'CARBOLITIUM', 'DOLANTINA', 'GABAPENTIN', 'PREGABALINA', 'LYRICA', 'ACETAZOLAMIDA', 'DIAMOX', 'ALPRAZOLAM', 'FRONTAL', 'AMITRIPTILINA', 'AMYTRIL', 'DESVENLAFAXINA', 'PRISTIQ', 'DIVALPROATO', 'DEPAKOTE', 'LAMOTRIGINA', 'NEURAL', 'MIRTAZAPINA', 'REMERON', 'NORTRIPTILINA', 'PAMELOR', 'PAROXETINA', 'ROXETIN', 'RIVASTIGMINA', 'EXELON', 'SUMATRIPTANA', 'SUMAX', 'TRAZODONA', 'DONAREN', 'VENLAFAXINA', 'EFEXOR', 'ZOLPIDEM', 'STILNOX', 'MEMANTINA', 'EBIX', 'CLOBAZAM', 'URBANIL', 'LEVETIRACETAM', 'KEPPRA', 'ANTARA', 'CITALOPRAM', 'OLANZAPINA', 'CRISAPINA', 'DONEPEZILA', 'LABREA', 'BUPROPIONA'];
  if (matchAny(neuroAlto)) return ALTO('Surto psicótico, convulsão espontânea ou desmame neurológico / dor de difícil controle');

  // Analgesia Sistêmica Combinada (Opióides de degrau 2) e Antieméticos Refratários
  const dolorAlto = ['CODEINA', 'TRAMADOL', 'TYLEX', 'DULOXETIN', 'CYMBALTA', 'OXYCONTIN', 'OXICODONA'];
  if (matchAny(dolorAlto)) return ALTO('Aumento agudo da escala de dor e agravamento funcional do paciente');
  const antiemetAlto = ['ONDANSETR', 'PALONOSETR', 'ANSENTRON', 'METOCLOPRA', 'BROMOPRIDA', 'FOSAPREPITANT', 'APREPITANT', 'PLASIL', 'VONAU', 'DOMPERIDONA'];
  if (matchAny(antiemetAlto)) return ALTO('Êmese pós-operatória severa / desidratação e risco de aspiração brônquica');

  // Cardiovasculares / Anti-hipertensivos de controle
  const cardioAlto = ['FUROSEMIDA', 'CAPTOPRIL', 'ENALAPRIL', 'METOPROLOL', 'ATENOLOL', 'LOSARTAN', 'AMLODIP', 'ROSUVASTAT', 'ATORVASTAT', 'SINVASTAT', 'BISOPROLOL', 'CONCOR', 'CARVEDILOL', 'NIFEDIPINA', 'ANLODIPINO', 'CLONIDINA', 'ATENSINA', 'DIGOXINA', 'HIDRALAZINA', 'APRESOLINA', 'INDAPAMIDA', 'NATRILIX', 'IVABRADINA', 'PROCORALAN', 'PROPRANOLOL', 'TRIMETAZIDINA', 'VASTAREL', 'VALSARTANA', 'DIOVAN', 'VERAPAMIL', 'DILACORON', 'OLMESARTANA', 'BENICAR', 'RAMIPRIL', 'ESPIRONOLACTONA', 'METILDOPA', 'SOTALOL'];
  if (matchAny(cardioAlto)) return ALTO('Piora de insuficiência cardíaca e risco hipertensivo progressivo nos crônicos');

  // Broncodilatadores Sistêmicos ou Inalatórios Potentes
  const broncoAlto = ['SALBUTAMOL', 'AEROLIN', 'FORMOTEROL', 'SYMBICORT', 'BUDESONID', 'BROMETO DE IPRATROPIO', 'IPRATROPIO', 'ATROVENT', 'BEROTEC', 'FENOTEROL', 'AMINOFILINA', 'MONTELUCASTE', 'SINGULAIR'];
  if (matchAny(broncoAlto)) return ALTO('Declínio agudo da via aérea inferior / exacerbação grave de asma ou DPOC');

  // Proteção Gástrica em UTI e Hepatoprotetores Severos
  const gastroAlto = ['OMEPRAZOL', 'PANTOPRAZOL', 'RANITIDINA', 'LANSOPRAZOL', 'ESOMEPRAZOL', 'ACIDO URSODESOXICOL', 'URSCOL', 'MESALAZINA', 'MESACOL', 'SUCRALFATO', 'SUCRAFILM', 'FAMOTIDINA', 'FAMOX'];
  if (matchAny(gastroAlto)) return ALTO('Sangramento alto não-varicoso ou agravamento de cirrose/colestase instalada');

  // Endocrinológicos / Antidiabéticos Crônicos / Reposição Hormonal Vital
  const endocrinoAlto = ['LINAGLIPTINA', 'TRAYENTA', 'METFORMINA', 'GLIFAGE', 'VILDAGLIPTINA', 'GALVUS', 'EMPAGLIFLOZINA', 'JARDIANCE', 'ARDIANCE', 'FORXIGA', 'DAPAGLIFLOZINA', 'LEVOTIROXINA', 'PURAN', 'SYNTHROID'];
  if (matchAny(endocrinoAlto)) return ALTO('Descompensação sistêmica (ex: Cetoacidose, Coma Mixedematoso) crônica');

  // Imunossupressores Crônicos e Biológicos
  const imunoAlto = ['ENTYVIO', 'VEDOLIZUMAB', 'AZATIOPRINA', 'IMURAN', 'HIDROXICLOROQUINA', 'REUQUINOL', 'CICLOSPORINA', 'TACROLIMO', 'PROGRAF', 'MICOFENOLATO', 'CELLCEPT', 'HUMIRA', 'ADALIMUMABE'];
  if (matchAny(imunoAlto)) return ALTO('Rejeição em transplantados / Agudização de doença imunomediada');

  // Especialidades Cirúrgicas e Materiais de Risco Local
  const instrumentariaAlto = ['PROCTYL', 'POLICRESULENO', 'XYLOPROCT', 'BISTURI', 'LAMINA DE BISTURI', 'CABO DE BISTURI', 'PLACA DE BISTURI', 'CURATIVO', 'ATADURA', 'FILME TRANSPAR', 'TEGADERM', 'PRONTOSAN', 'BETAINA', 'ALGINATO', 'COLAGENO', 'HIDROGEL', 'SUTURA', 'VICRYL', 'FIO ABSORV', 'FIO GUIA', 'CAMPO CIR', 'CAMPO CIRUR', 'CAMPO CIRÚR', 'COLAGENASE', 'KOLLAGENASE', 'ROPIVACAINA', 'ROPI', 'CANETA MARCACAO', 'KIT CIRURGICO'];
  if (matchAny(instrumentariaAlto)) return ALTO('Adiamento de etapa cirúrgica ou agravamento crônico de estomas/UPP extensa');

  const esterilAlto = ['STERIGAGE', 'COMPLY', 'INTEGRADOR QUIMICO', 'INVOLUCRO', 'BOWIE DICK', 'BOWIE-DICK', 'BIOLOGICO', 'AUTO-LEITURA', 'EMBALAGEM PLASTICA ESTERIL', 'CAPA EQUIPAMENTO VIDEOCIRURGIA', 'FILTRO PAPEL RETANGULAR'];
  if (matchAny(esterilAlto)) return ALTO('Perda total da barreira sanitária da CME; cirurgias e CTI impactados por quebra de segurança de infecção cruzada');

  // Contrastes de Imagem
  const imagAlto = ['DOTAREM', 'GADOTERICO', 'OPTIRAY', 'IOEXOL', 'OMNIPAQUE', 'INDOCIANINA VERDE'];
  if (matchAny(imagAlto)) return ALTO('Diagnóstico crítico vascular impedido de ser elucidado a tempo pela imagem (TC/RM)');

  // Urologia Crônica (HPB)
  const uroAlto = ['DUTASTERIDA', 'TANSULOSINA', 'TANDUO', 'DOXAZOSINA', 'FINASTERIDA'];
  if (matchAny(uroAlto)) return ALTO('Risco de retenção urinária aguda não tratada e cateterismo de repetição');

  // Dispositivos Invasivos Severos
  const sondaAlto = ['SONDA', 'CATETER', 'DRENO', 'SCALP', 'SERINGA', 'AGULHA', 'FILTRO HME', 'FILTRO UMIDIFICADOR', 'FILTRO BACT', 'TORNEIRA', 'DISCOFIX', 'FRASCO COLETOR DRENAGEM', 'COLETOR SECRECOES', 'KIT HIGIENE ORAL VENTILA', 'EQUIPO BOMBA', 'EQUIPO SORO MAX INFUSOR'];
  if (matchAny(sondaAlto)) return ALTO('Prejuízo agudo em administração de terapia IV segura ou manipulação do dreno torácico ou via aérea');

  // Nutrição especializada / Enteral
  const nutriAlto = ['DIETA ENTERAL', 'ENTERAL', 'SURVIMED', 'NUTRISON', 'FRESUBIN', 'ISOSOURCE', 'DIASIP', 'RESOURCE FIBER', 'MODULO ALIMENTAR', 'PARENTERAL', 'OLIGOELEMENTOS', 'NEOCATE', 'FORTINI', 'NUTRIDRINK', 'NOVASOURCE'];
  if (matchAny(nutriAlto)) return ALTO('Depleção calórico-proteica acelerada intra-hospitalar, reduzindo resposta sistêmica do paciente acamado');

  // Fluidos Básicos
  const ivAlto = ['SORO FISIOL', 'SOLUÇÃO FISIOL', 'RINGER', 'GLICOSE', 'SORO GLICO', 'CLORETO SODIO'];
  if (matchAny(ivAlto)) return ALTO('Impossibilidade global na central de preparo de manter todos os acessos abertos ou diluir a medicação');

  // Anestésicos Tópicos Prévios a Intubação ou Alívio Imediato
  if (has('LIDOCAINA') || has('XYLESTESIN') || has('EMLA')) return ALTO('Manobras locais extremamente invasivas feitas sem barreira tátil bloqueadora');

  // ══════════════════════════════════════════════════════════════════════════
  // ██  MÉDIO  — risco de suporte / operacional que afeta conforto ou cronograma
  // ══════════════════════════════════════════════════════════════════════════

  // Sintomáticos e Suporte Oral/Geral
  const sintoMedio = ['DIPIRONA', 'PIRONA', 'PARACETAMOL', 'HALEXMINOPHEN', 'IBUPROFENO', 'CETOROLACO', 'TORAGESIC', 'KETOROLAC', 'DICLOFENACO', 'VOLTAREN', 'PROFENID', 'CETOPROFENO', 'HIDROXIZINA', 'HIXIZINE', 'DRAMIN', 'DIMENIDRINATO', 'SIMETICONA', 'LUFTAL', 'LOPERAMIDA', 'IMOSEC', 'ESCOPOLAMINA', 'BUSCOPAN', 'BISACODIL', 'DUCÓLAX', 'LACTULOSE', 'FLEET', 'CLYSTER', 'BETAISTINA', 'LABIRIN', 'CICLOBENZAPRINA', 'MIOSAN', 'COLCHICINA', 'COLCHIS', 'DESLORATADINA', 'DESALEX', 'DEXPANTENOL', 'BEPANTOL', 'FEXOFENADINA', 'MACROGOL', 'MUVINLAX', 'SENNE', 'CASSIA', 'TAMARINDUS', 'NATURETTI', 'TENOXICAM', 'NAPROXENO', 'FLANAX', 'ACIDO POLIACRILICO', 'VIDISIC', 'GLICERIN', 'GLICERINA SUP', 'AVIDE', 'RACECADOTRILA', 'ESCINA', 'HEMATOM', 'ACETILCISTEINA', 'FLUCISTEIN', 'REHIDRAT', 'REIDRAT'];
  if (matchAny(sintoMedio)) return MEDIO('Conforto térmico, analgésico e entérico mitigados — prolonga permanência do paciente pelo simples desconforto');

  // Controle secundário crônico
  const cronicoMedio = ['EZETIMIBA', 'CIPROFIBRATO', 'PLESS', 'TIAMINA', 'BENERVA', 'VIT B1', 'NISTATINA', 'MICONAZOL', 'PROBIOTICO', 'ENTEROGERMINA', 'FLORATIL', 'SACHAROMYCES', 'SACCHAROMYCES', 'ACIDO FOLICO', 'ENDOFOLIN', 'ALOPURINOL', 'ZYLORIC', 'DIOSMINA', 'HESPERIDINA', 'PERIVASC', 'POLIVITAMINICO', 'CERNE', 'REPOFLOR', 'CALCITRIOL', 'SIGMATRIOL', 'VIT D3', 'CARBONATO CALCIO', 'OSCAL', 'PIRIDOXINA'];
  if (matchAny(cronicoMedio)) return MEDIO('Recrudescência em quadros crônicos como esteatose, neuropatia ou desequilíbrio leve da flora');

  // EPI, Materiais de Barreira Simples e Dispositivos Leves
  const epiMedio = ['FRALDA', 'MASCARA', 'LUVA', 'AVENTAL DE PROCEDIMENTO', 'CAPOTE', 'AVENTAL DESCARTAVEL', 'PROPÉ', 'PROPE', 'TOUCA', 'SAPATILHA', 'ELETRODO', 'OXIMETRO', 'OXÍMETRO', 'GLICOSIMETRO', 'TERMÔMETRO', 'TERMOMETRO', 'ESFIGMO', 'EQUIPO DE GRAVIDADE', 'EXTENSOR', 'EXTENSAO', 'NEBULIZ', 'ESPACADOR', 'AGACHAMBER', 'GAZE', 'COMPRESSA', 'BANDAGEM', 'ESPARADRAPO', 'MICROPORE', 'FITA HIPOALERGENICA', 'ALGODAO', 'ALGODÃO', 'SENSOR DESCART', 'SENSOR', 'ESPESSANTE', 'THICKEN', 'TIRA GLICEMIA', 'ACCU CHEK'];
  if (matchAny(epiMedio)) return MEDIO('Riscos cruzados subnotificados no dia a dia da enfermaria por quebras pontuais no controle local ou falta de mobilidade das secreções e fluxos gástricos');

  // Insumos Básicos Laboratoriais e Higiene
  const apoioMedio = ['AGUA DESTILADA', 'ÁGUA DESTILADA', 'ÁGUA PARA INJE', 'AGUA PARA INJE', 'BOBINA', 'SACO PLAST', 'SACO LIXO', 'LACRE', 'HAMPER', 'CLOREXIDINA', 'DEGERMANTE', 'ALCOOL', 'ÁLCOOL', 'FORMOL', 'DESINFETANTE GERMI'];
  if (matchAny(apoioMedio)) return MEDIO('Atrasos na rotina estritamente contábil da montagem de leitos e fluidos — retardo sem piora sistêmica declarada do status basal de vida');

  // ══════════════════════════════════════════════════════════════════════════
  // ██  BAIXO  — impacto operacional/administrativo (administrativos, suportes triviais não classificados)
  // ══════════════════════════════════════════════════════════════════════════
  return BAIXO();
}
