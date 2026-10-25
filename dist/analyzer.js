/** Rumo: critérios educativos locais. A pontuação não mede probabilidades de contratação. */
const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = text => text.match(/[\p{L}\p{N}]+(?:[+#]{1,2})?/gu) || [];
const excerpt = text => text.length > 155 ? `${text.slice(0, 152)}…` : text;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DEGREE = /\b(?:licenciatura|licenciado|licenciada|mestrado|mestre|curso|ensino secundario|ensino profissional|pos.graduacao|doutoramento|bacharelato|certificacao)\b/;
const INSTITUTION = /\b(?:universidade|faculdade|instituto|instituicao|escola|politecnico|academia|iseg|iscte|nova sbe|catolica)\b/;
const DATES = /\b(?:20\d{2}|19\d{2}|em curso|concluido|concluida|atual|presente)\b/;
const EXPERIENCE = /\b(?:projeto|projetos|experiencia|estagio|estagios|voluntariado|voluntario|voluntaria|associacao|associativismo|portfolio|portefolio|investigacao)\b/;
const ACTION = /\b(?:analisar|analisei|analisou|analisamos|analise|analises|desenvolver|desenvolvi|desenvolveu|desenvolvemos|desenvolvimento|criar|criei|criou|criamos|criacao|organizar|organizei|organizou|organizamos|organizacao|coordenar|coordenei|coordenou|coordenamos|coordenacao|apresentar|apresentei|apresentou|apresentamos|apresentacao|comparar|comparei|comparou|comparamos|comparacao|construir|construi|construiu|construimos|construcao|preparar|preparei|preparou|preparamos|preparacao|apoiar|apoiei|apoiou|apoiamos|apoio|implementar|implementei|implementou|implementamos|implementacao|automatizar|automatizei|automatizou|automatizamos|automatizacao|melhorar|melhorei|melhorou|melhoramos|melhoria|reduzir|reduzi|reduziu|reduzimos|reducao|produzir|produzi|produziu|produzimos|producao|elaborar|elaborei|elaborou|elaboramos|elaboracao|recolher|recolhi|recolheu|recolhemos|recolha|tratar|tratamento|limpeza|visualizacao|validacao|gerir|gestao|atendimento|colaborar|colaborei|colaboracao|participar|participei|participacao|investigar|investigacao|programar|programacao|redigir|redacao|ensinar|ensinei|ensino|planear|planeamento|monitorizar|monitorizacao)\b/;
const OUTPUT = /(?:\b\d+(?:[.,]\d+)?\s*(?:participantes|pessoas|alunos|estudantes|respostas|observacoes|registos|empresas|indicadores|paginas|horas|semanas|meses|membros|projetos|ficheiros|questionarios|entrevistas|euros|clientes|utilizadores|tabelas|fontes)\b)|(?:\b\d+(?:[.,]\d+)?\s*%)|(?:\b(?:relatorio|apresentacao|dashboard|painel|inquerito|base de dados|prototipo|orcamento|estudo comparativo|modelo econometrico|guia|manual|folheto|video|website|site|cartaz|artigo|ensaio)\b)/;
const SKILL = /\b(?:excel|python|sql|stata|spss|eviews|tableau|power bi|powerpoint|javascript|html|css|figma|git|comunicacao|estatistica|econometria|contabilidade|programacao|analise de dados|trabalho em equipa|gestao de projetos|modelacao|investigacao|redacao|atendimento|ingles|frances|espanhol)\b/;
const PROFILE_CONTEXT = /\b(?:estudante|profissional|interesse|interessado|interessada|procuro|objetivo|especializacao|especializado|especializada|economia|licenciado|licenciada|mestrando|mestranda|experiencia|pretendo)\b/;
const HEADINGS = [
  ['profile', /^(?:perfil|sobre mim|resumo|objetivo|apresentacao)(?:\s+(?:pessoal|profissional))?$/],
  ['contact', /^(?:contacto|contactos|dados pessoais)$/],
  ['education', /^(?:formacao|educacao|habilitacoes)(?:\s+(?:academica|academicas|e formacao|complementar|literarias))?$/],
  ['experience', /^(?:experiencia|experiencias|percurso)(?:\s+(?:profissional|profissionais|relevante|e projetos))?$/],
  ['projects', /^(?:projeto|projetos)(?:\s+(?:academicos|academico|pessoais|selecionados))?$/],
  ['volunteering', /^(?:voluntariado|associativismo|atividades extracurriculares)$/],
  ['skills', /^(?:competencias|conhecimentos|ferramentas|aptidoes|tecnologias)(?:\s+(?:tecnicas|tecnicos|digitais|pessoais))?$/],
  ['languages', /^(?:idiomas|linguas)$/],
  ['certificates', /^(?:certificacoes|certificados)$/],
  ['extra', /^(?:informacoes adicionais|outras informacoes|interesses|publicacoes|referencias|premios)$/],
];

function sectionsOf(text) {
  const sections = [{ kind: 'intro', lines: [] }];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[•*#-]\s*/, '');
    if (!line) continue;
    const colon = line.indexOf(':');
    const title = normalize(colon < 0 ? line : line.slice(0, colon)).replace(/[—-]\s*$/, '').trim();
    const heading = HEADINGS.find(([, pattern]) => pattern.test(title));
    if (heading) sections.push({ kind: heading[0], lines: colon < 0 || !line.slice(colon + 1).trim() ? [] : [line.slice(colon + 1).trim()] });
    else sections.at(-1).lines.push(line);
  }
  return sections.map(section => ({ ...section, text: section.lines.join(' '), normalized: normalize(section.lines.join(' ')) }));
}

const STOPWORDS = new Set(normalize(`
  para pela pelo pelas pelos como mais menos muito muita muitos muitas esta este estas estes
  essa esse essas esses isto isso aquilo uma umas uns dos das aos nas nos num numa nuns numas
  com sem sob sobre entre desde ate que quem qual quais quando onde porque por pois ser estar
  sao seja sejam sera serao somos estamos ter tem tenha tenham temos tens foram fosse
  fazer faz fazemos feito toda todo todos todas cada outro outra outros outras seu sua seus suas
  meu minha meus minhas nosso nossa nossos nossas vosso vossa e ou de a o as os em do da
  no na ao um se eu tu ele ela eles elas nos vos lhe lhes nem mas nao sim tambem ainda ja bem
  vaga vagas emprego empregos trabalho trabalhos equipa equipas empresa empresas pessoa pessoas
  candidato candidata candidatos candidatas perfil perfis profissional profissionais funcao funcoes
  oportunidade oportunidades oferta ofertas requisitos requisito procuramos procura procurado
  procurada queremos buscamos pretende pretendemos necessita necessario necessaria necessarios
  necessarias obrigatorio obrigatoria preferencial preferencialmente valorizado valorizada
  valorizamos preferencia capacidade capacidades competencia competencias conhecimento
  conhecimentos experiencia experiencias formacao academica superior area areas nivel niveis
  mediante respetivo respetiva nomeadamente designadamente incluindo exemplo
  excelente excelentes forte fortes bom boa bons boas elevado elevada solido solida demonstrada
  relevante relevantes minimo minima anos ano meses mes local horario contrato tempo completo
  integral parcial remuneracao salario beneficios vencimento disponibilidade entrada imediata
  integrar integracao ambiente dinamico dinamica motivacao motivado motivada desafio desafios
  responsabilidades responsabilidade atividades atividade tarefas tarefa apoio apoiar realizar
  desenvolver desenvolvimento assegurar garantir gerir participar executar coordenar colaborar
  trabalhar preparar elaborar contactar candidatura candidaturas envie enviar curriculo curriculum
  vitae portugues portuguesa portugal lisboa porto presencial hibrido remota remoto igualdade
  inclusao diversidade valorizacao generos genero idade nacionalidade
`).split(/\s+/).filter(Boolean));
const SHORT_TERMS = new Set(['sql', 'git', 'crm', 'sap', 'api', 'aws', 'php', 'css', 'c++', 'c#']);
function keywordOverlap(cvText, jobText) {
  const present = new Set(words(normalize(cvText)));
  const selected = new Map();
  for (const raw of words(jobText)) {
    const term = normalize(raw);
    if (!/^[a-z]/.test(term) || (term.length < 4 && !SHORT_TERMS.has(term)) || STOPWORDS.has(term)) continue;
    if (!selected.has(term)) selected.set(term, { label: raw.toLowerCase(), count: 0 });
    selected.get(term).count++;
  }
  const terms = [...selected.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 12);
  return {
    matched: terms.filter(([term]) => present.has(term)).map(([, item]) => item.label),
    missing: terms.filter(([term]) => !present.has(term)).map(([, item]) => item.label),
  };
}

const finite = (value, min = 0, max = Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = value => Number.isInteger(value) && value > 0;
const ratio = value => finite(value, 0, 1);
const GENERIC = new Set('sou pessoa dinamico dinamica responsavel responsabilidade motivado motivada excelente bom boa capacidade capacidades competencias conhecimentos profissional profissionais perfil'.split(' '));
const meaningful = text => words(normalize(text)).filter(word => word.length > 2 && !STOPWORDS.has(word) && !GENERIC.has(word));
const sentencesOf = text => text.split(/[.!?;](?:\s|$)/).map(value => value.trim()).filter(Boolean);
const preview = text => text ? '“' + excerpt(text.trim()) + '”' : 'Não identificado automaticamente.';
const pct = value => Math.round(value * 100) + '%';
const direction = /\b(?:interesse|interessado|interessada|procuro|pretendo|objetivo|ambiciono|candidatura|estagio|aplicar|contribuir|especializa|orientado|orientada|dedicado|dedicada)\b/;
const PORTFOLIO = /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/|github\.com\/|[a-z0-9-]+\.(?:pt|com|dev|me)\/)[^\s]+/i;
const PHONE = /\b(?:telefone|telemovel|tel|contacto)\s*:?\s*(?:\+351[\s.-]*)?(?:\d[\s.-]*){9}(?!\d)/i;

function writingChecks(issues, ready) {
  const spelling = new Map();
  const punctuation = new Map();
  for (const issue of issues) {
    if (!['spelling', 'punctuation'].includes(issue.kind)) continue;
    const target = issue.kind === 'punctuation' ? punctuation : spelling;
    const key = issue.kind === 'punctuation' ? String(issue.id ?? issue.offset ?? target.size) : normalize(String(issue.word ?? issue.id ?? target.size));
    const previous = target.get(key);
    // A repeated occurrence must not replace an actionable suggestion with an
    // empty alert. Keep the first context and combine available corrections.
    target.set(key, previous ? {
      ...issue, ...previous,
      message: previous.message || issue.message,
      suggestions: [...new Set([...(Array.isArray(previous.suggestions) ? previous.suggestions : []), ...(Array.isArray(issue.suggestions) ? issue.suggestions : [])])],
    } : issue);
  }
  const make = (id, label, items, maxPoints) => {
    const count = items.size;
    const first = items.values().next().value;
    const suggestion = Array.isArray(first?.suggestions) ? first.suggestions.find(item => typeof item === 'string') : null;
    return {
      id, group: 'writing', label, maxPoints, points: ready ? Math.max(0, maxPoints - count) : 0,
      evidence: ready ? count + ' alerta(s) distinto(s). ' + maxPoints + ' pontos sem alertas; menos 1 por alerta, até ao mínimo de 0. O verificador é limitado e não avalia toda a gramática.' : 'Verificação indisponível ou ainda por concluir: 0 pontos, sem presumir que o texto está correto.',
      suggestion: !ready ? 'Volta a analisar quando o dicionário estiver disponível. A leitura humana continua necessária, mas não atribui pontos automáticos.' : count ? 'Revê os alertas no contexto e corrige apenas os erros reais. Confirma termos técnicos ou nomes próprios corretamente escritos; volta a analisar depois das alterações.' : 'Faz uma leitura final para detetar problemas que as regras não conseguem reconhecer.',
      example: first ? String(first.message || 'Confirma o alerta.') + (first.word ? ' Termo: “' + first.word + '”.' : '') + (suggestion ? ' Sugestão a confirmar: “' + suggestion + '”.' : '') : 'Revê a escrita no contexto: uma palavra aceite pelo dicionário pode continuar inadequada à frase.',
    };
  };
  return [make('spelling', 'Ortografia', spelling, 7), make('punctuation', 'Pontuação e repetições próximas', punctuation, 3)];
}

function layoutChecks(meta) {
  const data = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
  const hasPdf = meta && typeof meta === 'object' && !Array.isArray(meta);
  const sizeKnown = finite(data.bodyFontSize, 0.1);
  const smallKnown = ratio(data.smallTextRatio);
  const marginKnown = finite(data.minMarginPt, 0);
  const spacingKnown = ratio(data.tightLineRatio);
  const densityKnown = ratio(data.textDensity);
  const pagesKnown = integer(data.pageCount);
  const familyKnown = integer(data.fontFamilyCount);
  const unknown = hasPdf ? 'Medida não identificada com confiança no PDF.' : 'Texto sem medidas de PDF.';
  const guidance = hasPdf ? 'Ajusta o documento original ou aplica o modelo de CV e volta a analisar o PDF produzido.' : 'Aplica o modelo de CV e analisa o PDF gerado para medir a apresentação. O texto colado não permite atribuir estes pontos.';
  const base = (id, label, points, maxPoints, evidence, threshold) => ({
    id, group: 'layout', label, points, maxPoints,
    evidence: evidence + ' Referência deste projeto: ' + threshold + ' São medidas aproximadas; não avaliam a estética nem garantem ausência de sobreposições.',
    suggestion: guidance,
    example: threshold,
  });
  return [
    base('font', 'Tamanho da letra', (sizeKnown ? data.bodyFontSize >= 10 ? 2 : data.bodyFontSize >= 9 ? 1 : 0 : 0) + (smallKnown ? data.smallTextRatio <= 0.15 ? 2 : data.smallTextRatio <= 0.30 ? 1 : 0 : 0), 4,
      (sizeKnown ? 'Corpo estimado: ' + data.bodyFontSize.toFixed(1) + ' pt.' : unknown) + ' ' + (smallKnown ? 'Texto abaixo de 10 pt: ' + pct(data.smallTextRatio) + '.' : 'Proporção de texto pequeno desconhecida.'),
      'Corpo ≥10 pt: 2 pontos; 9–<10 pt: 1. Texto pequeno ≤15%: 2 pontos; >15–30%: 1. Medidas desconhecidas: 0.'),
    base('margins', 'Distância às margens', marginKnown ? data.minMarginPt >= 28.35 ? 3 : data.minMarginPt >= 18 ? 2 : data.minMarginPt >= 9 ? 1 : 0 : 0, 3,
      marginKnown ? 'Menor distância estimada à borda: ' + data.minMarginPt.toFixed(1) + ' pt.' : unknown,
      'Margem mínima ≥28,35 pt (cerca de 10 mm): 3 pontos; ≥18 pt: 2; ≥9 pt: 1; abaixo disso: 0.'),
    base('spacing', 'Espaçamento entre linhas', spacingKnown ? data.tightLineRatio <= 0.05 ? 3 : data.tightLineRatio <= 0.15 ? 2 : data.tightLineRatio <= 0.30 ? 1 : 0 : 0, 3,
      spacingKnown ? 'Pares de linhas próximos: ' + pct(data.tightLineRatio) + '.' : unknown,
      'Linhas próximas ≤5%: 3 pontos; >5–15%: 2; >15–30%: 1. A proximidade usa a distância entre linhas comparáveis.'),
    base('density', 'Distribuição do texto na página', densityKnown ? data.textDensity >= 0.05 && data.textDensity <= 0.45 ? 2 : data.textDensity >= 0.01 && data.textDensity <= 0.60 ? 1 : 0 : 0, 2,
      densityKnown ? 'Cobertura geométrica de texto: ' + pct(data.textDensity) + '.' : unknown,
      'Cobertura de 5–45%: 2 pontos; de 1–<5% ou >45–60%: 1. É a área das caixas de texto, sem imagens ou fundos; não mede legibilidade por si só.'),
    base('pages', 'Extensão do documento', pagesKnown ? data.pageCount <= 2 ? 2 : data.pageCount === 3 ? 1 : 0 : 0, 2,
      pagesKnown ? data.pageCount + ' página(s).' : unknown,
      'Uma ou duas páginas: 2 pontos; três: 1. Referência para um primeiro CV; não elimines informação essencial apenas pela pontuação.'),
    base('typography', 'Consistência das famílias tipográficas', familyKnown && data.fontFamilyCount <= 2 ? 1 : 0, 1,
      familyKnown ? data.fontFamilyCount + ' família(s) de letra identificada(s).' : unknown,
      'Uma ou duas famílias identificadas: 1 ponto; mais ou número desconhecido: 0. Negrito e itálico da mesma família não são novas famílias.'),
  ];
}

function structureChecks(sections, wordCount) {
  const populated = sections.filter(section => !['intro', 'contact', 'extra'].includes(section.kind) && meaningful(section.text).length >= 2);
  const sectionKinds = new Set(populated.map(section => ['projects', 'volunteering'].includes(section.kind) ? 'experience' : section.kind === 'certificates' ? 'education' : section.kind));
  const count = sectionKinds.size;
  const units = sections.flatMap(section => section.lines.flatMap(sentencesOf)).filter(unit => words(unit).length >= 6);
  const long = units.filter(unit => words(unit).length > 40).length;
  const longRatio = units.length ? long / units.length : null;
  const readablePoints = longRatio === null ? 0 : longRatio <= 0.10 ? 3 : longRatio <= 0.30 ? 2 : longRatio <= 0.50 ? 1 : 0;
  const lengthPoints = wordCount <= 900 ? 2 : wordCount <= 1300 ? 1 : 0;
  const seen = new Set();
  let repeatedWords = 0, unitWords = 0;
  for (const unit of units) {
    const tokens = words(normalize(unit));
    const key = tokens.join(' ');
    unitWords += tokens.length;
    if (seen.has(key)) repeatedWords += tokens.length;
    seen.add(key);
  }
  const repeatedRatio = unitWords ? repeatedWords / unitWords : null;
  return [
    {
      id: 'sections', group: 'structure', label: 'Secções com informação', maxPoints: 7,
      points: count >= 4 ? 7 : count === 3 ? 5 : count === 2 ? 3 : count === 1 ? 1 : 0,
      evidence: count + ' tipos de secções com conteúdo. Quatro ou mais: 7 pontos; três: 5; duas: 3; uma: 1. Títulos vazios e repetidos não aumentam a pontuação.',
      suggestion: 'Separa a informação por títulos claros, numa linha própria: Perfil, Formação, Projetos ou Experiência e Competências. Não acrescentes conteúdo fictício para preencher secções.',
      example: 'Perfil → Formação académica → Projetos académicos → Competências.',
    },
    {
      id: 'concision', group: 'structure', label: 'Clareza e síntese do texto', maxPoints: 5, points: readablePoints + lengthPoints,
      evidence: wordCount + ' palavras; ' + long + ' de ' + units.length + ' trechos com mais de 40 palavras. Trechos longos ≤10%: 3 pontos; ≤30%: 2; ≤50%: 1. Até 900 palavras: 2 pontos; 901–1300: 1. Não há recompensa por aumentar o volume.',
      suggestion: 'Divide descrições muito longas em frases ou pontos com uma ideia de cada vez. Reduz repetições e informação pouco relevante; a extensão adequada depende do teu percurso.',
      example: 'Uma ação, o contexto e uma entrega numa frase curta; detalhes adicionais numa frase separada.',
    },
    {
      id: 'repetition', group: 'structure', label: 'Informação sem duplicações', maxPoints: 3,
      points: repeatedRatio === null ? 0 : repeatedRatio === 0 ? 3 : repeatedRatio <= 0.10 ? 2 : repeatedRatio <= 0.25 ? 1 : 0,
      evidence: repeatedRatio === null ? 'Não há trechos suficientemente longos para comparar duplicações: 0 pontos.' : pct(repeatedRatio) + ' de palavras em trechos exatamente repetidos. Sem duplicação: 3 pontos; até 10%: 2; até 25%: 1. Não é uma análise do significado.',
      suggestion: 'Retira trechos copiados mais de uma vez e usa cada secção para acrescentar informação diferente. Confirma se uma repetição resultou da extração do PDF.',
      example: 'Descreve a tarefa em Experiência e resume a capacidade em Competências, sem copiar o mesmo parágrafo.',
    },
  ];
}

function contentChecks(sections, text) {
  const select = kinds => sections.filter(section => kinds.includes(section.kind));
  const content = kinds => select(kinds).map(section => section.text).join(' ').trim();
  const intro = select(['intro']).flatMap(section => section.lines);
  const profileText = content(['profile']) || intro.filter(line => !EMAIL.test(line) && !PHONE.test(line) && !PORTFOLIO.test(line)).join(' ');
  const profileContext = words(profileText).length >= 8 && meaningful(profileText).length >= 4;
  const profileDirection = profileContext && direction.test(normalize(profileText));
  const explicitEducation = select(['education', 'certificates']);
  const educationText = explicitEducation.length ? explicitEducation.map(section => section.text).join(' ') : intro.filter(line => DEGREE.test(normalize(line))).join(' ');
  const educationNorm = normalize(educationText);
  const course = words(educationText).length >= 3 && (DEGREE.test(educationNorm) || explicitEducation.length > 0 && meaningful(educationText).length >= 3);
  const institution = course && INSTITUTION.test(educationNorm);
  const educationDates = course && DATES.test(educationNorm);
  const experienceSections = select(['experience', 'projects', 'volunteering']);
  const experienceText = experienceSections.length ? experienceSections.map(section => section.text).join(' ') : intro.filter(line => EXPERIENCE.test(normalize(line))).join(' ');
  const experienceNorm = normalize(experienceText);
  const activity = words(experienceText).length >= 6 && meaningful(experienceText).length >= 3;
  const units = sentencesOf(experienceText);
  const actionUnit = units.find(unit => words(unit).length >= 4 && ACTION.test(normalize(unit)));
  const contribution = activity && Boolean(actionUnit);
  const setting = activity && (DATES.test(experienceNorm) || /\b(?:grupo|equipa|associacao|instituicao|empresa|universidade|faculdade|escola|projeto de|iniciativa|organizacao)\b/.test(experienceNorm));
  const concrete = activity && units.find(unit => words(unit).length >= 4 && ACTION.test(normalize(unit)) && OUTPUT.test(normalize(unit)));
  const task = Boolean(concrete) || activity && units.some(unit => words(unit).length >= 6 && ACTION.test(normalize(unit)) && meaningful(unit).length >= 3);
  const skillsSections = select(['skills']);
  const skillsText = content(['skills']);
  const skillsLines = skillsSections.flatMap(section => section.lines);
  const namedSkill = SKILL.test(normalize(skillsText || experienceText)) || skillsLines.some(line => {
    const colon = line.indexOf(':');
    return colon > 0 && words(line.slice(0, colon)).length <= 5 && meaningful(line.slice(0, colon)).length >= 1 && meaningful(line.slice(colon + 1)).length >= 2;
  });
  const describedSkill = namedSkill && skillsLines.some(line => {
    const colon = line.indexOf(':');
    return colon > 0 && meaningful(line.slice(colon + 1)).length >= 2 || ACTION.test(normalize(line)) && meaningful(line).length >= 4;
  });
  const appliedSkill = describedSkill && skillsLines.some(line => {
    const colon = line.indexOf(':');
    return colon > 0 && meaningful(line.slice(colon + 1)).length >= 3 || ACTION.test(normalize(line)) && words(line).length >= 7;
  });
  const directContact = EMAIL.test(text) || PHONE.test(text);
  const contactPoints = directContact ? 8 : PORTFOLIO.test(text) ? 4 : 0;
  const checks = [
    {
      id: 'contact', label: 'Meio de contacto', points: contactPoints, maxPoints: 8,
      evidence: directContact ? 'Email ou telefone identificado: 8 pontos. Não é necessário incluir ambos.' : contactPoints ? 'Perfil público identificado: 4 pontos. Um meio de contacto direto não foi identificado automaticamente.' : 'Meio de contacto não identificado automaticamente: 0 pontos.',
      suggestion: 'Inclui um email ou telefone de contacto correto. Um link de perfil pode complementar. Fotografia, morada completa e outros dados pessoais não são necessários.',
      example: 'Um email de contacto verdadeiro. Se usares telefone, identifica-o com “Telefone:” ou “Telemóvel:”.',
    },
    {
      id: 'profile', label: 'Perfil e objetivo', points: (profileContext ? 4 : 0) + (profileDirection ? 4 : 0), maxPoints: 8,
      evidence: 'Contexto pessoal/profissional: ' + (profileContext ? '4/4' : '0/4') + '; área de interesse ou objetivo: ' + (profileDirection ? '4/4' : '0/4') + '. ' + preview(profileText),
      suggestion: !profileContext ? 'Escreve um perfil breve que explique o teu percurso e interesse. Uma lista de adjetivos ou apenas o título da secção não identifica o contexto.' : 'Explica que área ou oportunidade te interessa e como pretendes aplicar os teus conhecimentos. Não é preciso usar uma frase padronizada.',
      example: 'Estrutura a adaptar: “Estudante de [curso], com interesse em [área]. Pretendo aplicar [conhecimentos] em [oportunidade].”',
    },
    {
      id: 'education', label: 'Formação identificada', points: (course ? 4 : 0) + (institution ? 3 : 0) + (educationDates ? 3 : 0), maxPoints: 10,
      evidence: 'Curso/percurso: ' + (course ? '4/4' : '0/4') + '; instituição: ' + (institution ? '3/3' : '0/3') + '; datas ou estado atual: ' + (educationDates ? '3/3' : '0/3') + '. ' + preview(educationText),
      suggestion: 'Identifica o curso ou percurso, a instituição e as datas ou o estado atual. Se uma sigla da instituição não foi reconhecida, acrescenta o nome por extenso.',
      example: '“[Curso] — [Universidade, instituto ou escola]. [Ano inicial]–[ano final ou previsto], em curso.”',
    },
    {
      id: 'experience', label: 'Experiência, projetos ou voluntariado', points: (activity ? 4 : 0) + (contribution ? 6 : 0) + (setting ? 4 : 0), maxPoints: 14,
      evidence: 'Atividade descrita: ' + (activity ? '4/4' : '0/4') + '; tarefa/contributo: ' + (contribution ? '6/6' : '0/6') + '; contexto ou período: ' + (setting ? '4/4' : '0/4') + '. ' + preview(experienceText),
      suggestion: 'Descreve uma atividade, o contexto ou período e o que fizeste. Projetos académicos e voluntariado contam; não é necessário ter emprego anterior. Verbos, infinitivos e descrições nominais são aceites.',
      example: '“Projeto académico, [ano]. Análise de [tema], organização de [tarefa] e colaboração com [equipa].”',
    },
    {
      id: 'evidence', label: 'Tarefas e entregas concretas', points: (task ? 4 : 0) + (concrete ? 6 : 0), maxPoints: 10,
      evidence: 'Ação com tarefa: ' + (task ? '4/4' : '0/4') + '; entrega/detalhe concreto: ' + (concrete ? '6/6' : '0/6') + '. ' + preview(concrete || actionUnit || ''),
      suggestion: 'Liga uma tarefa a uma entrega ou resultado real: relatório, apresentação, painel ou outro trabalho. Números são opcionais; não inventes resultados para aumentar a pontuação.',
      example: 'Se corresponder ao teu trabalho: “Apresentei as conclusões num relatório.” ou “Elaboração de um relatório comparativo.”',
    },
    {
      id: 'skills', label: 'Competências com aplicação', points: (namedSkill ? 4 : 0) + (describedSkill ? 3 : 0) + (appliedSkill ? 3 : 0), maxPoints: 10,
      evidence: 'Ferramenta/capacidade: ' + (namedSkill ? '4/4' : '0/4') + '; descrição: ' + (describedSkill ? '3/3' : '0/3') + '; detalhe de aplicação: ' + (appliedSkill ? '3/3' : '0/3') + '. ' + preview(skillsText),
      suggestion: 'Indica a competência e explica o que sabes fazer com ela. O formato “Ferramenta: aplicações concretas” também permite reconhecer ferramentas fora do vocabulário da aplicação.',
      example: 'Adapta ao teu domínio real: “Excel: organização de dados, fórmulas e criação de gráficos.”',
    },
  ];
  return checks.map(check => ({ ...check, group: 'content' }));
}

/** Local rules only. Options.confirmations is deliberately ignored: review checkboxes never add points. */
export function analyzeCV(text, options = {}) {
  if (typeof text !== 'string') throw new Error('Cola o texto do teu CV para começar. São necessárias pelo menos 40 palavras.');
  if (text.length > 30000) throw new Error('O texto é demasiado longo. Usa até 30 000 caracteres para analisar o CV.');
  const tokens = words(text);
  if (tokens.length < 40) throw new Error('Ainda há pouco texto para analisar. Cola pelo menos 40 palavras do teu CV.');
  if (new Set(words(normalize(text)).filter(word => /[a-z]/.test(word))).size < 12) throw new Error('O texto parece incompleto ou muito repetido. Cola as diferentes secções do teu CV para obteres uma análise útil.');
  const config = typeof options === 'string' ? { jobText: options } : options || {};
  if (typeof config !== 'object' || Array.isArray(config)) throw new Error('As opções de análise são inválidas.');
  const jobText = config.jobText ?? '';
  if (typeof jobText !== 'string') throw new Error('A descrição da oportunidade deve ser texto.');
  if (jobText.length > 30000) throw new Error('A descrição da oportunidade é demasiado longa. Usa até 30 000 caracteres.');
  const issues = Array.isArray(config.writingIssues) ? config.writingIssues.filter(issue => issue && typeof issue === 'object') : [];
  const sections = sectionsOf(text);
  const checks = [
    ...contentChecks(sections, text),
    ...structureChecks(sections, tokens.length),
    ...writingChecks(issues, config.writingReady === true),
    ...layoutChecks(config.pdfMeta),
  ].map(check => ({ ...check, source: 'automatic', status: check.points === check.maxPoints ? 'found' : 'review' }));
  const editorFields = { contact: 'contact', profile: 'profile', education: 'education', experience: 'experience', evidence: 'experience', skills: 'skills', sections: 'extra' };
  const improvements = checks.filter(check => check.points < check.maxPoints).map(check => ({
    id: check.id, title: check.label, description: check.suggestion, example: check.example,
    gain: check.maxPoints - check.points, kind: check.group, editorField: editorFields[check.id] || null,
  })).sort((a, b) => b.gain - a.gain);
  const groups = [['content', 'Conteúdo'], ['structure', 'Estrutura'], ['writing', 'Escrita'], ['layout', 'Apresentação do PDF']].map(([id, label]) => ({
    id, label, points: checks.filter(check => check.group === id).reduce((sum, check) => sum + check.points, 0),
    maxPoints: checks.filter(check => check.group === id).reduce((sum, check) => sum + check.maxPoints, 0),
  }));
  return {
    score: checks.reduce((sum, check) => sum + check.points, 0), maxScore: 100, checks, groups,
    strengths: checks.filter(check => check.status === 'found').map(check => check.label), improvements,
    keywords: keywordOverlap(text, jobText), wordCount: tokens.length,
  };
}

export const exampleCV = 'ESTUDANTE DE ECONOMIA — EXEMPLO FICTÍCIO\n\nContactos\nestudante@rumo.example\n\nPerfil\nEstudante de Economia com interesse em análise de dados e políticas públicas. Procuro aplicar conhecimentos de estatística a problemas concretos e aprender através de projetos e de um primeiro estágio.\n\nFormação académica\nLicenciatura em Economia — instituição fictícia\n2024–2027, em curso. Unidades curriculares: Microeconomia, Macroeconomia, Estatística e Introdução à Econometria.\n\nProjetos académicos\nCusto de vida — projeto de grupo, 2026\nAnalisei informação económica e organizei dados recolhidos a partir de fontes públicas. Trabalhei com colegas na comparação de categorias de despesa e na discussão das diferenças observadas. A minha responsabilidade foi verificar a consistência das tabelas e organizar as tarefas do grupo.\n\nCompetências\nExcel\n\nIdiomas\nPortuguês: língua materna. Inglês: nível intermédio, autoavaliação.\n\nTodos os dados e atividades deste exemplo são fictícios.';
