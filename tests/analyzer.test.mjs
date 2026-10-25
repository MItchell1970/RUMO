import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCV, exampleCV } from '../dist/analyzer.js';

const criterion = (result, id) => result.checks.find(item => item.id === id);
const group = (result, id) => result.groups.find(item => item.id === id);
const goodPdf = {pageCount:1,bodyFontSize:11,smallTextRatio:0,minMarginPt:48,tightLineRatio:0,textDensity:0.25,fontFamilyCount:1};
const fullCV = exampleCV.replace('A minha responsabilidade foi verificar', 'Apresentei as conclusões num relatório. A minha responsabilidade foi verificar')
  .replace('\nExcel\n', '\nExcel: organização de dados, fórmulas e criação de gráficos.\n');
const ready = {writingReady:true,pdfMeta:goodPdf};
const replaceProject = content => exampleCV.replace(/Projetos académicos\n[\s\S]*?\n\nCompetências/, 'Projetos académicos\n' + content + '\n\nCompetências');
const addProjectSentence = sentence => exampleCV.replace('A minha responsabilidade foi', sentence + ' A minha responsabilidade foi');

test('valida tipo, mínimo de palavras e limite de caracteres', () => {
  for (const text of ['', 'O meu CV', undefined, null, 123]) assert.throws(() => analyzeCV(text), /40 palavras/);
  assert.throws(() => analyzeCV('a'.repeat(30001)), /30 000 caracteres/);
  assert.throws(() => analyzeCV(exampleCV, {jobText:'a'.repeat(30001)}), /30 000 caracteres/);
  assert.throws(() => analyzeCV(exampleCV, {jobText:{}}), /deve ser texto/);
  assert.throws(() => analyzeCV(exampleCV, []), /opções/);
});

test('rejeita lixo e texto repetido sem informação variada', () => {
  for (const text of ['teste '.repeat(80),'12345 '.repeat(80)]) assert.throws(() => analyzeCV(text), /repetido/);
  assert.throws(() => analyzeCV('! '.repeat(80)), /40 palavras/);
});

test('os grupos têm pesos 60/15/10/15 e há dezassete subcritérios', () => {
  const result=analyzeCV(exampleCV);
  assert.deepEqual(result.groups.map(item=>[item.id,item.maxPoints]),[['content',60],['structure',15],['writing',10],['layout',15]]);
  assert.equal(result.checks.length,17);
  assert.equal(result.maxScore,100);
});

test('cem pontos são atingíveis com conteúdo completo e medidas PDF favoráveis', () => {
  const result=analyzeCV(fullCV,ready);
  assert.equal(result.score,100);
  assert.equal(result.improvements.length,0);
  assert.equal(result.strengths.length,17);
});

test('o exemplo permanece melhorável e os dados são fictícios', () => {
  const result=analyzeCV(exampleCV,{writingReady:true});
  assert.equal(result.score,73);
  assert.equal(result.improvements.find(item=>item.id==='evidence').gain,6);
  assert.equal(result.improvements.find(item=>item.id==='skills').gain,6);
  assert.match(exampleCV,/@rumo\.example/);
  assert.match(exampleCV,/fictícios/);
});

test('somas de checks, grupos e ganhos coincidem em todos os estados', () => {
  const cases=[
    [exampleCV,{}],[fullCV,ready],[fullCV,{writingReady:true}],
    [exampleCV,{pdfMeta:{pageCount:4,bodyFontSize:8}}],
    [fullCV,{writingReady:true,writingIssues:[{word:'erro',kind:'spelling'}],pdfMeta:{...goodPdf,tightLineRatio:0.2}}],
  ];
  for(const [text,options] of cases){
    const result=analyzeCV(text,options);
    assert.equal(result.score,result.checks.reduce((sum,item)=>sum+item.points,0));
    assert.equal(result.score,result.groups.reduce((sum,item)=>sum+item.points,0));
    assert.equal(result.checks.reduce((sum,item)=>sum+item.maxPoints,0),100);
    assert.equal(result.improvements.reduce((sum,item)=>sum+item.gain,0),100-result.score);
    assert.ok(result.score>=0&&result.score<=100);
    for(const item of result.checks){
      assert.ok(item.points>=0&&item.points<=item.maxPoints);
      assert.equal(item.status,item.points===item.maxPoints?'found':'review');
      assert.equal(item.source,'automatic');
      assert.ok(item.evidence&&item.suggestion);
    }
  }
});

test('melhorias são ordenadas, acionáveis e apontam para o campo certo do editor', () => {
  const result=analyzeCV(exampleCV);
  for(let i=0;i<result.improvements.length;i++){
    const item=result.improvements[i];
    assert.ok(item.title&&item.description&&item.example&&item.gain>0);
    assert.ok(['content','structure','writing','layout'].includes(item.kind));
    if(i)assert.ok(result.improvements[i-1].gain>=item.gain);
  }
  assert.equal(result.improvements.find(item=>item.id==='evidence').editorField,'experience');
  assert.equal(result.improvements.find(item=>item.id==='skills').editorField,'skills');
  assert.equal(result.improvements.find(item=>item.id==='font').editorField,null);
});

test('confirmações antigas e novos valores truthy nunca acrescentam pontos', () => {
  const original=analyzeCV(exampleCV);
  const confirmed=analyzeCV(exampleCV,{confirmations:{spellingReviewed:true,grammarReviewed:true,layoutReviewed:true}});
  assert.equal(confirmed.score,original.score);
  assert.equal(group(confirmed,'layout').points,0);
  assert.equal(group(confirmed,'writing').points,0);
  assert.equal(group(analyzeCV(exampleCV,{writingReady:'true'}),'writing').points,0);
});

test('maiúsculas e ausência de acentos não afetam o conteúdo', () => {
  const text=fullCV.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  assert.equal(analyzeCV(text,ready).score,100);
});

test('títulos vazios não contam como conteúdo citado apenas no perfil', () => {
  const text='Perfil\nEstudante de Economia com interesse em projetos, Excel e análise de dados. Procuro uma primeira oportunidade para aplicar conhecimentos da licenciatura e explorar novas perspetivas. Valorizo a comunicação entre colegas, a aprendizagem autónoma e a descoberta de novas formas de trabalhar em conjunto.\nFormação\nProjetos\nCompetências';
  const result=analyzeCV(text);
  assert.equal(criterion(result,'education').points,0);
  assert.equal(criterion(result,'experience').points,0);
  assert.equal(criterion(result,'skills').points,0);
  assert.equal(criterion(result,'sections').points,1);
});

test('reconhece títulos equivalentes e conteúdo na mesma linha', () => {
  const text=fullCV.replace('Perfil\n','Resumo profissional: ').replace('Formação académica\n','Habilitações académicas: ').replace('Competências\n','Ferramentas: ');
  assert.equal(analyzeCV(text,ready).score,100);
});

test('formação tem pontuação parcial por curso, instituição e datas', () => {
  const noInstitution=exampleCV.replace(' — instituição fictícia','');
  assert.equal(criterion(analyzeCV(noInstitution),'education').points,7);
  const noDates=noInstitution.replace('2024–2027, em curso.','');
  assert.equal(criterion(analyzeCV(noDates),'education').points,4);
});

test('projetos académicos e voluntariado não exigem emprego anterior', () => {
  assert.equal(criterion(analyzeCV(fullCV),'experience').points,14);
  const volunteer=fullCV.replace('Projetos académicos','Voluntariado').replace('Custo de vida — projeto de grupo','Iniciativa de apoio ao estudo');
  assert.equal(criterion(analyzeCV(volunteer),'experience').points,14);
});

test('contributos no passado, infinitivo ou forma nominal são equivalentes', () => {
  for(const sentence of [
    'Analisei os custos das famílias e elaborei um relatório comparativo.',
    'Analisar os custos das famílias e elaborar um relatório comparativo.',
    'Análise dos custos das famílias e elaboração de um relatório comparativo.',
  ]){
    const text=replaceProject('Projeto de Economia, 2026. '+sentence);
    const result=analyzeCV(text);
    assert.equal(criterion(result,'experience').points,14,sentence);
    assert.equal(criterion(result,'evidence').points,10,sentence);
  }
});

test('entregas concisas contam sem exigir percentagens nem frases artificiais', () => {
  for(const sentence of ['Apresentei as conclusões num relatório.','Produzi um relatório comparativo.','Elaboração de um relatório comparativo.','Elaborar um relatório comparativo.']){
    assert.equal(criterion(analyzeCV(addProjectSentence(sentence)),'evidence').points,10,sentence);
  }
  assert.equal(criterion(analyzeCV(fullCV.replace(/\d+/g,'')),'evidence').points,10);
});

test('palavras vagas, números soltos e datas não são entregas concretas', () => {
  for(const sentence of ['Criei site.','2024 2025 2026.']){
    const result=analyzeCV(addProjectSentence(sentence));
    assert.equal(criterion(result,'evidence').points,4,'mantém apenas os pontos da tarefa já descrita');
  }
  assert.equal(criterion(analyzeCV(replaceProject('Criei site.')),'evidence').points,0);
});

test('uma tarefa detalhada recebe pontos parciais mesmo sem entregar um relatório', () => {
  const result=analyzeCV(exampleCV);
  assert.equal(criterion(result,'evidence').points,4);
  assert.match(criterion(result,'evidence').evidence,/entrega\/detalhe concreto: 0\/6/);
});

test('competências desconhecidas são reconhecidas pelo formato ferramenta: aplicação', () => {
  const text=exampleCV.replace('\nExcel\n','\nFerramentaZ: construção de mapas e análise espacial de dados.\n');
  assert.equal(criterion(analyzeCV(text),'skills').points,10);
});

test('não confunde substrings com competências e pontua competências progressivamente', () => {
  assert.equal(criterion(analyzeCV(exampleCV),'skills').points,4);
  assert.equal(criterion(analyzeCV(fullCV),'skills').points,10);
  const text=exampleCV.replace('\nExcel\n','\nPessoa excelente, digital e organizada\n');
  assert.equal(criterion(analyzeCV(text),'skills').points,0);
  assert.deepEqual(analyzeCV(text,'Excel SQL Git').keywords.matched,[]);
});

test('um só meio de contacto basta e não há pontos por fotografia ou morada', () => {
  assert.equal(criterion(analyzeCV(exampleCV),'contact').points,8);
  const phone=exampleCV.replace('estudante@rumo.example','Telefone: +351 910 000 000');
  assert.equal(criterion(analyzeCV(phone),'contact').points,8);
  const noContact=exampleCV.replace('estudante@rumo.example','Morada e fotografia disponíveis');
  assert.equal(criterion(analyzeCV(noContact),'contact').points,0);
});

test('estrutura não aumenta com títulos duplicados ou vazios', () => {
  const original=criterion(analyzeCV(exampleCV),'sections').points;
  const extra=criterion(analyzeCV(exampleCV+'\nProjetos\nProjetos\nFormação\nCompetências'),'sections').points;
  assert.equal(extra,original);
});

test('texto curto e útil não precisa de enchimento para obter pontos de síntese', () => {
  const short='Perfil\nEstudante de Economia com interesse em políticas públicas. Procuro um estágio para aplicar conhecimentos académicos.\nFormação\nLicenciatura em Economia, instituição fictícia, em curso.\nProjetos\nProjeto académico, 2026. Elaboração de um relatório comparativo sobre despesas.\nCompetências\nExcel: fórmulas, gráficos e organização de dados.';
  assert.ok(analyzeCV(short).wordCount<80);
  assert.equal(criterion(analyzeCV(short),'concision').points,5);
});

test('trechos longos e duplicações recebem sugestões distintas', () => {
  const sentence='Analisei informação económica e organizei dados de despesas para compreender diferenças entre grupos de estudantes.';
  const repeated=exampleCV+'\nProjetos\n'+Array(8).fill(sentence).join(' ');
  assert.equal(criterion(analyzeCV(repeated),'repetition').points,0);
  const long=replaceProject(Array(10).fill(sentence.slice(0,-1)).join(' ') + '.');
  assert.ok(criterion(analyzeCV(long),'concision').points<5);
  assert.match(criterion(analyzeCV(long),'concision').evidence,/40 palavras/);
});

test('escrita indisponível nunca significa escrita aprovada', () => {
  for(const options of [{},{writingReady:false},{writingReady:'true'}]){
    const result=analyzeCV(fullCV,options);
    assert.equal(group(result,'writing').points,0);
    assert.match(criterion(result,'spelling').evidence,/indisponível/);
  }
});

test('escrita tem sete pontos ortográficos e três de pontuação sem avaliar gramática completa', () => {
  const result=analyzeCV(fullCV,{writingReady:true});
  assert.equal(criterion(result,'spelling').points,7);
  assert.equal(criterion(result,'punctuation').points,3);
  assert.match(criterion(result,'spelling').evidence,/não avalia toda a gramática/);
});

test('cada alerta reduz um ponto, com deduplicação ortográfica e mínimos zero', () => {
  const issues=[{word:'analizei',kind:'spelling',suggestions:['analisei']},{word:'ANALIZEI',kind:'spelling'},{id:'p1',kind:'punctuation'},{id:'p2',kind:'punctuation'}];
  const result=analyzeCV(fullCV,{writingReady:true,writingIssues:issues});
  assert.equal(criterion(result,'spelling').points,6);
  assert.equal(criterion(result,'punctuation').points,1);
  assert.match(criterion(result,'spelling').example,/analisei/i);
  const many=Array.from({length:15},(_,i)=>({word:'palavra'+i,kind:'spelling'}));
  assert.equal(criterion(analyzeCV(fullCV,{writingReady:true,writingIssues:many}),'spelling').points,0);
});

test('sem PDF todos os quinze pontos de apresentação ficam por medir', () => {
  const result=analyzeCV(fullCV,{writingReady:true});
  assert.equal(result.score,85);
  assert.equal(group(result,'layout').points,0);
  assert.ok(result.improvements.filter(item=>item.kind==='layout').every(item=>/modelo/.test(item.description)));
});

test('alertas repetidos preservam sugestões e tipos desconhecidos não são erros ortográficos', () => {
  const base = { word:'analizei', kind:'spelling' };
  for (const issues of [[base,{...base,message:'Rever o verbo',suggestions:['analisei']}],[{...base,message:'Rever o verbo',suggestions:['analisei']},base]]) {
    const result = analyzeCV(fullCV,{writingReady:true,writingIssues:issues});
    assert.equal(criterion(result,'spelling').points,6);
    assert.match(criterion(result,'spelling').example,/analisei/);
    assert.match(criterion(result,'spelling').example,/Rever o verbo/);
  }
  const result = analyzeCV(fullCV,{writingReady:true,writingIssues:[null,42,{},[],{kind:'__proto__',word:'texto'}]});
  assert.equal(group(result,'writing').points,10);
});

test('pontos curtos em linhas próprias não se tornam um parágrafo longo', () => {
  const lines = [
    'Analisei informação económica e organizei os dados das despesas.',
    'Apresentei as conclusões num relatório para o projeto académico.',
    'Comparei categorias de despesa e verifiquei as diferenças observadas.',
    'Elaborei gráficos com fontes públicas e descrevi os resultados.',
    'Organizei tarefas do grupo e revi a consistência das tabelas.',
  ].map(line => '• ' + line.replace(/\.$/, '')).join('\n');
  const result = analyzeCV(replaceProject(lines));
  assert.equal(criterion(result,'concision').points,5);
  assert.equal(criterion(result,'repetition').points,3);
});

test('chaves estranhas não alteram a fórmula nem a pesquisa de secções', () => {
  const options = JSON.parse('{"__proto__":{"writingReady":true},"constructor":"texto","pdfMeta":{"fontFamilyCount":0,"__proto__":{"pageCount":1}}}');
  assert.equal(analyzeCV(fullCV,options).score,analyzeCV(fullCV).score);
  const result = analyzeCV(fullCV + '\n\n__proto__\nconstructor\ntoString',{writingReady:true});
  assert.ok(Number.isInteger(result.score));
  assert.equal(result.groups.reduce((sum,item)=>sum+item.maxPoints,0),100);
});

test('títulos do PDF gerado são reconhecidos sem precisar de subtítulos herdados', () => {
  const rebuilt = fullCV.replace('Projetos académicos\n','Experiência e projetos\n');
  const result = analyzeCV(rebuilt,ready);
  assert.equal(result.score,100);
  assert.equal(criterion(result,'experience').points,14);
});

test('informações adicionais não são confundidas com competências demonstradas', () => {
  const text = fullCV.replace('Excel: organização de dados, fórmulas e criação de gráficos.','Excel\n\nInformações adicionais\nExcel: organização de dados, fórmulas e criação de gráficos.');
  const result = analyzeCV(text,ready);
  assert.equal(criterion(result,'skills').points,4);
});

test('medidas desconhecidas, nulas e inválidas nunca ganham pontos', () => {
  for(const pdfMeta of [{},{pageCount:0,bodyFontSize:NaN,smallTextRatio:-1,minMarginPt:-2,tightLineRatio:2,textDensity:-1,fontFamilyCount:0},{pageCount:'1',bodyFontSize:Infinity,smallTextRatio:null,minMarginPt:null,tightLineRatio:null,textDensity:null,fontFamilyCount:null}]){
    const result=analyzeCV(fullCV,{pdfMeta});
    assert.equal(group(result,'layout').points,0);
    assert.ok(!result.checks.some(item=>/NaN|Infinity/.test(item.evidence)));
  }
});

test('tamanho de letra e proporção pequena têm pesos independentes', () => {
  assert.equal(criterion(analyzeCV(fullCV,{pdfMeta:{bodyFontSize:11}}),'font').points,2);
  assert.equal(criterion(analyzeCV(fullCV,{pdfMeta:{smallTextRatio:0}}),'font').points,2);
  assert.equal(criterion(analyzeCV(fullCV,{pdfMeta:{bodyFontSize:9,smallTextRatio:0.3}}),'font').points,2);
  assert.equal(criterion(analyzeCV(fullCV,{pdfMeta:{bodyFontSize:8,smallTextRatio:0.31}}),'font').points,0);
});

test('margens e espaçamento respeitam os limiares declarados', () => {
  for(const [value,expected] of [[28.35,3],[18,2],[9,1],[8.9,0]]){
    assert.equal(criterion(analyzeCV(fullCV,{pdfMeta:{minMarginPt:value}}),'margins').points,expected);
  }
  for(const [value,expected] of [[0.05,3],[0.15,2],[0.3,1],[0.31,0]]){
    assert.equal(criterion(analyzeCV(fullCV,{pdfMeta:{tightLineRatio:value}}),'spacing').points,expected);
  }
});

test('cobertura de texto não é tratada como juízo estético', () => {
  for(const [value,expected] of [[0,0],[0.01,1],[0.05,2],[0.45,2],[0.6,1],[0.61,0]]){
    const item=criterion(analyzeCV(fullCV,{pdfMeta:{textDensity:value}}),'density');
    assert.equal(item.points,expected);
    assert.match(item.evidence,/não mede legibilidade por si só/);
    assert.match(item.evidence,/não avaliam a estética/);
  }
});

test('páginas e famílias tipográficas têm contributos limitados', () => {
  for(const [value,expected] of [[1,2],[2,2],[3,1],[4,0]])assert.equal(criterion(analyzeCV(fullCV,{pdfMeta:{pageCount:value}}),'pages').points,expected);
  for(const [value,expected] of [[1,1],[2,1],[3,0]])assert.equal(criterion(analyzeCV(fullCV,{pdfMeta:{fontFamilyCount:value}}),'typography').points,expected);
});

test('palavras-chave mantêm compatibilidade, acentos e exclusão de termos genéricos', () => {
  const jobText='Procuramos uma pessoa para a equipa com formação e experiência. Excel EXCEL, ANÁLISE analise, SQL SQL e Python.';
  const result=analyzeCV(exampleCV,{jobText});
  assert.deepEqual(result.keywords,analyzeCV(exampleCV,jobText).keywords);
  assert.deepEqual(result.keywords.matched,['excel','análise']);
  assert.deepEqual(result.keywords.missing,['sql','python']);
  assert.equal(result.score,analyzeCV(exampleCV).score);
});
