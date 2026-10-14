/** Rumo: critérios educativos locais. A pontuação não mede probabilidades de contratação. */
const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = text => text.match(/[\p{L}\p{N}]+(?:[+#]{1,2})?/gu) || [];
const excerpt = text => text.length > 155 ? `${text.slice(0, 152)}…` : text;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DEGREE = /\b(?:licenciatura|licenciado|licenciada|mestrado|mestre|curso|ensino secundario|ensino profissional|pos.graduacao|doutoramento|bacharelato|certificacao)\b/;
const EDUCATION_CONTEXT = /\b(?:universidade|faculdade|instituto|instituicao|escola|politecnico|academia|em curso|concluido|concluida|20\d{2}|19\d{2})\b/;
const EXPERIENCE = /\b(?:projeto|projetos|experiencia|estagio|estagios|voluntariado|voluntario|voluntaria|associacao|associativismo|portfolio|portefolio|investigacao)\b/;
const ACTION = /\b(?:analisei|analisou|analisamos|desenvolvi|desenvolveu|desenvolvemos|criei|criou|criamos|organizei|organizou|organizamos|coordenei|coordenou|coordenamos|apresentei|apresentou|apresentamos|comparei|comparou|comparamos|construi|construiu|construimos|preparei|preparou|preparamos|apoiei|apoiou|apoiamos|implementei|implementou|implementamos|automatizei|automatizou|automatizamos|melhorei|melhorou|melhoramos|reduzi|reduziu|reduzimos|produzi|produziu|produzimos|elaborei|elaborou|elaboramos|recolhi|recolheu|recolhemos|analise|desenvolvimento|criacao|organizacao|coordenacao|implementacao|elaboracao|producao)\b/;
const OUTPUT = /(?:\b\d+(?:[.,]\d+)?\s*(?:participantes|pessoas|alunos|estudantes|respostas|observacoes|registos|empresas|indicadores|paginas|horas|semanas|meses|membros|projetos|ficheiros|questionarios|entrevistas|euros|clientes|utilizadores|tabelas|fontes)\b)|(?:\b\d+(?:[.,]\d+)?\s*%)|(?:\b(?:relatorio|apresentacao|dashboard|painel|inquerito|base de dados|prototipo|orcamento|estudo comparativo|modelo econometrico|guia|manual|folheto|video|website|site|cartaz|artigo|ensaio)\b)/;
const SKILL = /\b(?:excel|python|sql|stata|spss|eviews|tableau|power bi|powerpoint|javascript|html|css|figma|git|comunicacao|estatistica|econometria|contabilidade|programacao|analise de dados|trabalho em equipa|gestao de projetos|modelacao|investigacao|redacao|atendimento|ingles|frances|espanhol)\b/;
const PROFILE_CONTEXT = /\b(?:estudante|profissional|interesse|interessado|interessada|procuro|objetivo|especializacao|especializado|especializada|economia|licenciado|licenciada|mestrando|mestranda|experiencia|pretendo)\b/;
const HEADINGS = [
  ['profile', /^(?:perfil|sobre mim|resumo|objetivo)(?:\s+(?:pessoal|profissional))?$/],
  ['contact', /^(?:contacto|contactos|dados pessoais)$/],
  ['education', /^(?:formacao|educacao)(?:\s+(?:academica|e formacao|complementar))?$/],
  ['experience', /^(?:experiencia|experiencias)(?:\s+(?:profissional|profissionais|relevante))?$/],
  ['projects', /^(?:projeto|projetos)(?:\s+(?:academicos|academico|pessoais|selecionados))?$/],
  ['volunteering', /^(?:voluntariado|associativismo|atividades extracurriculares)$/],
  ['skills', /^(?:competencias|conhecimentos|ferramentas|aptidoes|tecnologias)(?:\s+(?:tecnicas|tecnicos|digitais|pessoais))?$/],
  ['languages', /^(?:idiomas|linguas)$/],
  ['certificates', /^(?:certificacoes|certificados)$/],
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

function writingCheck(issues, ready, confirmations) {
  const punctuationIssues = issues.filter(issue => issue.kind === 'punctuation');
  const spellingIssues = issues.filter(issue => issue.kind !== 'punctuation');
  const spellingManual = confirmations.spellingReviewed === true;
  const grammarManual = confirmations.grammarReviewed === true;
  const spellingPoints = spellingManual || (ready && spellingIssues.length === 0) ? 9 : 0;
  const punctuationPoints = punctuationIssues.length ? 0 : ready || grammarManual ? 3 : 0;
  const grammarPoints = grammarManual ? 3 : 0;
  const spellingEvidence = spellingManual ? 'revisão confirmada por ti' : !ready ? 'verificação automática indisponível ou ainda por concluir' : spellingIssues.length ? `${spellingIssues.length} alerta(s) a confirmar` : 'sem alertas no dicionário disponível';
  const grammarEvidence = grammarManual ? 'revisão confirmada por ti' : 'revisão manual por confirmar';
  const steps = [];
  if (!spellingPoints) steps.push(!ready ? 'Aguarda a verificação ortográfica ou revê a ortografia e confirma a revisão manual.' : 'Revê os alertas de ortografia. Corrige os erros reais; nomes próprios e termos técnicos podem exigir confirmação manual.');
  if (!punctuationPoints) steps.push(punctuationIssues.length ? 'Corrige os alertas de pontuação identificados e volta a analisar.' : 'Revê a pontuação e confirma a revisão manual, ou aguarda a verificação automática.');
  if (!grammarPoints) steps.push('Lê as frases, confirma a concordância e os tempos verbais e assinala a revisão de gramática.');
  const firstIssue = [...spellingIssues, ...punctuationIssues][0];
  const firstSuggestion = Array.isArray(firstIssue?.suggestions) ? firstIssue.suggestions.find(value => typeof value === 'string') : null;
  const example = firstIssue ? `${typeof firstIssue.message === 'string' ? firstIssue.message : 'Confirma este alerta.'}${firstIssue.word ? ` Termo: “${firstIssue.word}”.` : ''}${firstSuggestion ? ` Sugestão a confirmar: “${firstSuggestion}”.` : ''}` : 'Confirma se sujeito e verbo concordam e se as descrições de experiências passadas usam tempos verbais consistentes.';
  return {
    id: 'writing', label: 'Ortografia, pontuação e gramática', points: spellingPoints + punctuationPoints + grammarPoints, maxPoints: 15,
    evidence: `Ortografia: ${spellingPoints}/9 (${spellingEvidence}). Pontuação: ${punctuationPoints}/3 (${punctuationIssues.length ? `${punctuationIssues.length} alerta(s)` : ready ? 'sem alertas nas regras verificadas' : grammarManual ? 'revisão confirmada por ti' : 'verificação indisponível ou ainda por concluir'}). Gramática: ${grammarPoints}/3 (${grammarEvidence}). Uma verificação sem alertas não garante ausência de erros.`,
    suggestion: steps.join(' ') || 'Mantém a revisão de ortografia e gramática atualizada sempre que alterares o texto.',
    example, source: spellingManual || grammarManual ? ready || punctuationIssues.length ? 'mixed' : 'confirmation' : 'automatic',
  };
}

function layoutCheck(meta, confirmations) {
  const reviewed = confirmations.layoutReviewed === true;
  const manualText = reviewed ? 'Revisão visual confirmada por ti; não é uma validação automática do aspeto.' : 'Revisão visual manual por confirmar.';
  if (!meta || typeof meta !== 'object') return {
    id: 'layout', label: 'Apresentação e legibilidade', points: reviewed ? 10 : 0, maxPoints: 10,
    evidence: `O texto colado não permite medir o aspeto do documento. ${manualText}`,
    suggestion: 'Abre o CV original e confirma uma letra legível, margens e espaçamentos consistentes, alinhamento das secções e ausência de cortes ou sobreposições. Depois assinala a revisão visual.',
    example: 'Revê o documento a 100% de ampliação: títulos distinguíveis, texto confortável de ler e datas alinhadas.', source: 'confirmation',
  };
  const validPages = Number.isInteger(meta.pageCount) && meta.pageCount > 0;
  const pagePoints = validPages && meta.pageCount <= 2 ? 3 : 0;
  const validSize = typeof meta.bodyFontSize === 'number' && Number.isFinite(meta.bodyFontSize) && meta.bodyFontSize > 0;
  const validRatio = typeof meta.smallTextRatio === 'number' && Number.isFinite(meta.smallTextRatio) && meta.smallTextRatio >= 0 && meta.smallTextRatio <= 1;
  const fontPoints = (validSize && meta.bodyFontSize >= 10) || (validRatio && meta.smallTextRatio <= 0.15) ? 4 : 0;
  const notes = [`Extensão: ${pagePoints}/3 (${validPages ? `${meta.pageCount} página(s)` : 'número de páginas indisponível'}).`, `Letra: ${fontPoints}/4 (${validSize ? `tamanho de corpo estimado: ${meta.bodyFontSize.toFixed(1)} pt` : 'tamanho de corpo não identificado'}${validRatio ? `; ${(meta.smallTextRatio * 100).toFixed(0)}% de texto pequeno` : ''}).`, manualText];
  const steps = [];
  if (!pagePoints) steps.push(validPages ? 'Para cumprir o critério de síntese desta ferramenta, reduz o CV a uma ou duas páginas e volta a importar. Não elimines informação essencial apenas pela pontuação.' : 'Volta a importar um PDF que permita identificar o número de páginas.');
  if (!fontPoints) steps.push('Confirma uma letra de corpo de pelo menos 10 pt ou, no máximo, 15% de texto pequeno, e volta a importar o PDF.');
  if (!reviewed) steps.push('Abre o PDF e confirma alinhamentos, margens, espaçamentos e ausência de cortes ou sobreposições; depois assinala a revisão visual.');
  return {
    id: 'layout', label: 'Apresentação e legibilidade', points: pagePoints + fontPoints + (reviewed ? 3 : 0), maxPoints: 10,
    evidence: notes.join(' '), suggestion: steps.join(' ') || 'Os indicadores do PDF são aproximados. Mantém a revisão visual do documento original.',
    example: 'Uma ou duas páginas, texto legível e secções alinhadas. As medidas do PDF não detetam todos os problemas de composição.', source: reviewed ? 'mixed' : 'automatic',
  };
}

/**
 * @param {string} text Entre 40 palavras e 30 000 caracteres.
 * @param {object|string} options Objeto de opções; uma string continua a representar jobText.
 * @returns {{score:number,checks:Array,strengths:string[],improvements:Array,keywords:object,wordCount:number}}
 */
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
  const confirmations = config.confirmations && typeof config.confirmations === 'object' ? config.confirmations : {};
  const issues = Array.isArray(config.writingIssues) ? config.writingIssues.filter(issue => issue && typeof issue === 'object') : [];
  const sections = sectionsOf(text);
  const select = kinds => sections.filter(section => kinds.includes(section.kind));
  const content = kinds => select(kinds).map(section => section.text).join(' ').trim();
  const profileText = content(['profile']) || content(['intro']).split(EMAIL).filter(part => !/@/.test(part)).join(' ');
  const profileFound = words(profileText).length >= 12 && PROFILE_CONTEXT.test(normalize(profileText));
  // O perfil, por si só, não demonstra formação, projetos ou experiência.
  const educationSections = select(['education', 'certificates']);
  const educationText = educationSections.length ? educationSections.map(section => section.text).join(' ') : select(['intro']).flatMap(section => section.lines).filter(line => DEGREE.test(normalize(line))).join(' ');
  const courseFound = words(educationText).length >= 3 && DEGREE.test(normalize(educationText));
  const educationContextFound = courseFound && EDUCATION_CONTEXT.test(normalize(educationText));
  const experienceSections = select(['experience', 'projects', 'volunteering']);
  const experienceText = experienceSections.length ? experienceSections.map(section => section.text).join(' ') : select(['intro']).flatMap(section => section.lines).filter(line => EXPERIENCE.test(normalize(line))).join(' ');
  const experienceContextFound = words(experienceText).length >= 6 && (experienceSections.length > 0 || EXPERIENCE.test(normalize(experienceText)));
  const actionFound = experienceContextFound && words(experienceText).length >= 12 && ACTION.test(normalize(experienceText));
  const evidenceSentence = experienceText.split(/[.!?](?:\s|$)/).find(sentence => words(sentence).length >= 4 && ACTION.test(normalize(sentence)) && OUTPUT.test(normalize(sentence)));
  const skillsText = content(['skills']);
  const skillFound = SKILL.test(normalize(skillsText || experienceText));
  const skillDetailFound = skillFound && words(skillsText).length >= 4;
  const populatedSections = new Set(sections.filter(section => section.kind !== 'intro' && words(section.text).length >= 3).map(section => section.kind)).size;
  const checks = [
    {
      id: 'contact', label: 'Contacto acessível', points: EMAIL.test(text) ? 10 : 0, maxPoints: 10,
      evidence: EMAIL.test(text) ? 'Foi identificado um endereço de email no texto.' : 'Email não identificado automaticamente.',
      suggestion: 'Inclui um email de contacto correto e adequado a candidaturas. Não precisas de fotografia, telefone, morada completa ou dados sensíveis para cumprir este critério.',
      example: 'Formato: nome@exemplo.pt. Usa o teu email verdadeiro no CV que enviares.',
    },
    {
      id: 'profile', label: 'Apresentação pessoal', points: profileFound ? 10 : 0, maxPoints: 10,
      evidence: profileFound ? `Apresentação identificada: “${excerpt(profileText)}”` : 'Apresentação com contexto e objetivo não identificada automaticamente.',
      suggestion: 'Acrescenta uma secção Perfil com duas ou três frases: o teu percurso, a área que te interessa e o que procuras aplicar ou aprender. Evita apenas listar adjetivos.',
      example: 'Estrutura a adaptar: “Estudante de [curso], com interesse em [área]. Procuro aplicar [conhecimento] em [tipo de oportunidade].”',
    },
    {
      id: 'education', label: 'Formação com contexto', points: (courseFound ? 5 : 0) + (educationContextFound ? 5 : 0), maxPoints: 10,
      evidence: courseFound ? `Curso identificado: “${excerpt(educationText)}”. ${educationContextFound ? 'Também foi identificada uma instituição, uma data ou o estado atual.' : 'Instituição, datas ou estado atual não identificados automaticamente.'}` : 'Curso com informação concreta não identificado automaticamente. Um título de secção vazio não conta.',
      suggestion: 'Na secção Formação, identifica o curso e acrescenta a instituição e as datas ou o estado atual. Confirma os dados no documento original.',
      example: 'Estrutura a adaptar: “Licenciatura em [curso] — [instituição]. [Ano de início]–[ano previsto], em curso.”',
    },
    {
      id: 'experience', label: 'Projetos e experiência', points: (experienceContextFound ? 5 : 0) + (actionFound ? 10 : 0), maxPoints: 15,
      evidence: actionFound ? `Atividade e contributo identificados: “${excerpt(experienceText)}”` : experienceContextFound ? 'Foi identificada uma atividade; a tua contribuição concreta não foi identificada automaticamente.' : 'Atividade com descrição concreta não identificada automaticamente. Referências genéricas no perfil não contam.',
      suggestion: 'Descreve um projeto académico, voluntariado, estágio ou outra atividade e explica o que fizeste. Não é necessário ter emprego anterior. Mantém a informação verdadeira.',
      example: 'Estrutura a adaptar: “[Projeto ou atividade]. Analisei [tema], organizei [tarefa] e colaborei com [equipa].”',
    },
    {
      id: 'evidence', label: 'Exemplos e resultados', points: evidenceSentence ? 10 : 0, maxPoints: 10,
      evidence: evidenceSentence ? `Ação com entrega ou detalhe identificada: “${excerpt(evidenceSentence.trim())}”` : 'Ação ligada a uma entrega, resultado ou detalhe concreto não identificada automaticamente.',
      suggestion: 'Completa uma experiência com uma ação e uma entrega concreta: relatório, apresentação, painel ou outro trabalho realizado. Números são opcionais; usa-os apenas se forem reais.',
      example: 'Exemplo de estrutura, apenas se verdadeiro: “Analisei [tema] e apresentei as conclusões num relatório.”',
    },
    {
      id: 'skills', label: 'Competências demonstráveis', points: (skillFound ? 5 : 0) + (skillDetailFound ? 5 : 0), maxPoints: 10,
      evidence: skillDetailFound ? `Competência com contexto identificada: “${excerpt(skillsText)}”` : skillFound ? 'Foi identificada uma competência; uma descrição do que sabes fazer numa secção de competências não foi identificada automaticamente.' : 'Competências concretas não identificadas pelo vocabulário limitado desta ferramenta.',
      suggestion: 'Na secção Competências, indica ferramentas ou capacidades relevantes e explica o que sabes fazer com elas. Não basta deixar apenas o nome da secção ou uma palavra solta.',
      example: 'Exemplo a adaptar ao teu domínio real: “Excel: organização de dados, fórmulas e criação de gráficos.”',
    },
    {
      id: 'structure', label: 'Secções com informação', points: populatedSections >= 3 ? 10 : populatedSections >= 1 ? 5 : 0, maxPoints: 10,
      evidence: `${populatedSections} tipos de secções com conteúdo identificados automaticamente. Títulos vazios ou repetidos não aumentam a pontuação.`,
      suggestion: 'Organiza o texto em pelo menos três secções com informação, por exemplo Perfil, Formação, Projetos e Competências. Coloca cada título numa linha própria.',
      example: 'Perfil → Formação académica → Projetos académicos → Competências.',
    },
    writingCheck(issues, config.writingReady === true, confirmations),
    layoutCheck(config.pdfMeta, confirmations),
  ].map(check => ({ ...check, status: check.points === check.maxPoints ? 'found' : 'review', source: check.source || 'automatic' }));
  const improvements = checks.filter(check => check.points < check.maxPoints).map(check => ({
    id: check.id, title: check.label, description: check.suggestion, example: check.example || '',
    gain: check.maxPoints - check.points, kind: check.id === 'writing' ? 'writing' : check.id === 'layout' ? 'layout' : 'content',
  })).sort((a, b) => b.gain - a.gain);
  return {
    score: checks.reduce((sum, check) => sum + check.points, 0), checks,
    strengths: checks.filter(check => check.status === 'found').map(check => check.label), improvements,
    keywords: keywordOverlap(text, jobText), wordCount: tokens.length,
  };
}

// Exemplo deliberadamente melhorável: faltam uma entrega concreta e detalhes das competências.
export const exampleCV = `ESTUDANTE DE ECONOMIA — EXEMPLO FICTÍCIO
Contactos
estudante@rumo.example

Perfil
Estudante de Economia com interesse em análise de dados e políticas públicas. Procuro aplicar conhecimentos de estatística a problemas concretos e aprender através de projetos e de um primeiro estágio.

Formação académica
Licenciatura em Economia — instituição fictícia
2024–2027, em curso. Unidades curriculares: Microeconomia, Macroeconomia, Estatística e Introdução à Econometria.

Projetos académicos
Custo de vida — projeto de grupo, 2026
Analisei informação económica e organizei dados recolhidos a partir de fontes públicas. Trabalhei com colegas na comparação de categorias de despesa e na discussão das diferenças observadas. A minha responsabilidade foi verificar a consistência das tabelas e organizar as tarefas do grupo.

Competências
Excel

Idiomas
Português: língua materna. Inglês: nível intermédio, autoavaliação.

Todos os dados e atividades deste exemplo são fictícios.`;
