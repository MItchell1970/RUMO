# Rumo — o teu currículo, com mais rumo

**[Experimentar o site](https://mitchell1970.github.io/RUMO/)** · [Testes e publicação](https://github.com/MItchell1970/RUMO/actions/workflows/pages.yml)

Uma ferramenta gratuita para perceber o que melhorar num currículo, rever o conteúdo e produzir um PDF claro. Projeto académico de Economia, em português de Portugal.

**Carregar → perceber → melhorar → descarregar.** A versão 3 reúne diagnóstico, editor e criação de PDF num único percurso. Funciona no navegador, sem conta ou envio do currículo para um servidor.

## O que faz

- Importa PDF com texto selecionável ou TXT; também aceita texto colado.
- Calcula uma pontuação de **0 a 100**, explicada em 17 critérios e quatro grupos.
- Mostra os pontos em falta e sugestões associadas ao conteúdo a rever.
- Verifica possíveis erros ortográficos PT-PT, pontuação básica e repetições próximas.
- Mede sinais de apresentação do PDF: tamanho da letra, distância às margens, espaçamento, cobertura de texto, páginas e famílias tipográficas.
- Permite organizar e editar as secções num modelo simples, com pré-visualização.
- Cria um **novo PDF com texto selecionável**, usando a informação revista pelo utilizador.
- Reavalia o documento produzido e permite continuar a melhorar antes de o descarregar.
- Compara opcionalmente palavras do currículo com a descrição de uma oportunidade.
- Inclui um exemplo fictício de Economia para uma demonstração sem dados pessoais.

O editor não inventa experiência, formação, competências nem resultados. Quando falta informação, a aplicação explica o que falta: essa informação tem de ser acrescentada pela pessoa. O PDF pode ser descarregado sem atingir 100; nunca é rotulado como perfeito só porque foi gerado.

## Experimentar localmente

É necessário **Node.js 22 ou superior** para o servidor e os testes. Os recursos da aplicação estão incluídos; não há dependências para instalar para a utilização habitual.

1. Extrair a pasta do projeto.
2. Abrir um terminal nessa pasta e executar `node server.mjs` (ou `npm start`).
3. Abrir **http://127.0.0.1:4173** num navegador atualizado.

Em Windows, `Iniciar-Rumo.cmd` facilita o arranque se o Node.js estiver instalado. O terminal precisa de ficar aberto durante a utilização. Para parar, usar Ctrl+C.

Não abrir `dist/index.html` diretamente: os módulos, os verificadores e as fontes precisam de um servidor HTTP, como o servidor incluído ou o GitHub Pages. PDF.js usa funcionalidades recentes de JavaScript; recomenda-se uma versão atual do navegador.

## Como se calcula a pontuação

| Grupo | Critérios | Máximo |
|---|---|---:|
| Conteúdo | Contacto (8), perfil e objetivo (8), formação (10), experiência/projetos (14), tarefas e entregas (10), competências aplicadas (10) | **60** |
| Estrutura | Secções com informação (7), clareza e síntese (5), ausência de duplicações exatas (3) | **15** |
| Escrita | Ortografia (7), pontuação e repetições próximas (3) | **10** |
| Apresentação do PDF | Letra (4), margens (3), espaçamento (3), cobertura de texto (2), extensão (2), famílias tipográficas (1) | **15** |
| **Total** | **17 critérios** | **100** |

Cada critério pode atribuir pontos parciais. As sugestões somam exatamente os pontos em falta: `pontuação + ganhos possíveis = 100`. Os pesos e limiares são escolhas educativas do projeto; não constituem uma escala científica validada nem uma avaliação utilizada por empregadores.

O conteúdo é reconhecido através de títulos, contexto e padrões. Projetos académicos e voluntariado contam como experiência. Uma entrega concreta pode ser um relatório ou uma apresentação: não é obrigatório incluir percentagens. Secções vazias ou duplicadas não dão pontos adicionais. Não há pontos por fotografia, morada completa, idade ou nacionalidade, nem pontos obtidos apenas por assinalar uma caixa de confirmação.

Na escrita, cada alerta distinto reduz um ponto, até ao mínimo de zero do respetivo critério. Alertas ortográficos repetidos sobre o mesmo termo são contados uma vez. Sem o verificador disponível, os pontos de escrita ficam por verificar. Confirmar um nome próprio ou termo técnico evita falsos alertas; não certifica que toda a frase esteja correta.

### Apresentação e limpeza

As medidas vêm da geometria do texto extraído do PDF, não de uma imagem ou de uma avaliação estética. A aplicação considera:

- Corpo estimado de pelo menos 10 pt e até 15% do texto abaixo de 10 pt para o máximo da letra.
- Pelo menos 28,35 pt, aproximadamente 10 mm, de distância estimada à borda para o máximo das margens.
- Até 5% de pares de linhas comparáveis demasiado próximos para o máximo de espaçamento.
- Cobertura das caixas de texto entre 5% e 45% da página para o máximo de distribuição; esta medida exclui imagens e fundos.
- Uma ou duas páginas para o máximo de extensão e uma ou duas famílias tipográficas identificadas para consistência.

As regras completas, incluindo os intervalos de pontuação parcial, aparecem no resultado e em `dist/analyzer.js`. O cálculo de espaçamento considera as áreas de leitura das linhas, para evitar confundir colunas desencontradas com linhas sobrepostas. As famílias usam a identidade original da fonte quando o PDF a disponibiliza; negrito e itálico da mesma família não são famílias adicionais.

Medidas desconhecidas não recebem pontos. Num TXT ou em texto colado, os 15 pontos de apresentação ficam por medir até se produzir e analisar um PDF. Alterar o conteúdo invalida as medidas do documento anterior. Um PDF digitalizado como imagem não pode ser medido por este percurso.

Estas referências destinam-se sobretudo a CVs de início de carreira. Um currículo com mais páginas ou um modelo diferente pode ser adequado ao contexto. Não se deve acrescentar texto vazio nem retirar informação essencial para aumentar a pontuação.

## O que significa chegar aos 100

**100 significa cumprir os critérios verificáveis da Rumo.** Não significa CV perfeito, contratação garantida ou aprovação em sistemas de recrutamento.

O percurso mantém a distinção entre alterações de apresentação e informação em falta:

1. O diagnóstico identifica os critérios e a evidência encontrada.
2. O utilizador corrige alertas reais, completa dados verdadeiros e revê as secções.
3. O modelo uniformiza a apresentação com texto selecionável, margens e hierarquia tipográfica.
4. O PDF resultante volta a ser analisado. O resultado depende do conteúdo e das medidas desse documento, sem bónus por clicar em «gerar».

É possível cumprir os critérios com um CV completo, sem inventar números nem experiências. As sugestões são indicações para rever, não afirmações acrescentadas automaticamente ao currículo.

## Privacidade e limites

- O conteúdo do CV é processado em memória no navegador. A aplicação não envia esse conteúdo a serviços externos, não usa analytics, cookies de rastreio ou armazenamento persistente. O alojamento recebe os pedidos normais de abertura do site e dos seus recursos.
- Fechar ou recarregar a página elimina o texto da memória da aplicação. Os ficheiros que a pessoa descarregou continuam no dispositivo.
- O PDF original não é modificado. O PDF novo contém a versão revista no editor; a extração de documentos com colunas ou elementos decorativos pode exigir correções na ordem das secções.
- A análise usa regras locais e um dicionário, sem IA generativa. Não verifica a veracidade das qualificações e pode falhar na interpretação do conteúdo, nomes próprios e termos técnicos.
- O verificador não compreende toda a gramática. As sugestões precisam de confirmação e o documento final deve ser lido pela pessoa.
- A medição de apresentação não avalia cores, contraste, fotografias, qualidade estética, adequação de uma marca de template nem todas as sobreposições. Algumas geometrias ou fontes incompletas ficam por medir.
- Limites de importação: 5 MB, 12 páginas e 30 000 caracteres. A análise exige pelo menos 40 palavras e alguma variedade de conteúdo. PDFs protegidos ou digitalizados como imagem não são suportados.
- A comparação de palavras-chave é literal, não compreende sinónimos, não altera a pontuação e não certifica compatibilidade com sistemas ATS.

## Código e verificação

```text
dist/
  index.html          Página e conteúdo em PT-PT
  styles.css          Identidade visual e comportamento responsivo
  app.js              Percurso, estado e apresentação dos resultados
  analyzer.js         Pontuação, evidência e sugestões por critério
  writing.js          Comunicação com o verificador
  writing-worker.js   Dicionário e regras fora da interface
  pdf-reader.js       Extração de texto e geometria de PDF
  cv-model.js         Secções editáveis e preservação do conteúdo importado
  pdf-export.js       Criação de PDF com fontes incorporadas
  vendor/             Bibliotecas, fontes, dicionário e licenças
tests/                Regressões da pontuação, escrita, leitura e geração
.github/workflows/   Validação e publicação no GitHub Pages
server.mjs            Servidor local
```

Executar `node --test tests/*.test.mjs` (ou `npm test`). A suíte verifica somas e limites da pontuação, conteúdo insuficiente, ganhos possíveis, casos de 100 pontos, alertas duplicados, falhas de escrita, acentos, dados inválidos, geometria de PDF, margens, colunas, rotação, fontes e limites de importação. A geração de PDF e o percurso na interface devem também ser verificados antes da publicação.

As decisões técnicas privilegiam simplicidade: HTML, CSS e JavaScript, sem processo de compilação. O Web Worker mantém a revisão ortográfica fora da interface. As bibliotecas e fontes são servidas com o próprio site; não há chaves secretas no cliente.

## Publicar no GitHub Pages

O projeto usa o repositório público [MItchell1970/RUMO](https://github.com/MItchell1970/RUMO) e o endereço [mitchell1970.github.io/RUMO](https://mitchell1970.github.io/RUMO/), sem domínio próprio pago.

Em **Settings → Pages → Build and deployment**, selecionar **GitHub Actions**. O workflow `.github/workflows/pages.yml` executa os testes antes de publicar apenas `dist` a partir de `main`. Também pode ser iniciado em **Actions → Testar e publicar a Rumo → Run workflow**. Os caminhos relativos permitem servir o site na subpasta `/RUMO/`.

O repositório contém código, documentação e exemplos fictícios. Nunca acrescentar currículos reais aos testes, commits ou imagens públicas. Documentação oficial: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Apresentação na faculdade e portefólio

Uma demonstração de três minutos pode mostrar o exemplo, o diagnóstico, a melhoria de uma competência ou descrição de projeto, a correção de um erro e a criação do novo PDF. Explicar os pesos e os limites é parte do projeto: o objetivo é tornar o processo de revisão compreensível, com privacidade e critérios visíveis.

Para o portefólio, apresenta o problema, a ligação à Economia, as decisões de produto, a metodologia, os testes e o que aprendeste com o feedback de colegas. O projeto foi desenvolvido com assistência de IA; descreve a tua participação com transparência e nunca publiques CVs de participantes.

## Fontes e componentes de terceiros

- [Europass — criar um CV](https://europass.europa.eu/pt/create-europass-cv): referência para organização e adaptação do conteúdo.
- [Europass — informações do perfil](https://europass.europa.eu/pt/what-type-information-should-i-include-my-europass-profile): referência para formação, experiências e competências.
- Mozilla PDF.js 5.6.205, Apache 2.0: `dist/vendor/LICENSE-pdfjs.txt`.
- pdf-lib, MIT: `dist/vendor/pdf-lib-LICENSE.md`.
- @pdf-lib/fontkit, MIT: `dist/vendor/fontkit-LICENSE.txt`.
- Pako, compressão usada pelo fontkit: `dist/vendor/pako-LICENSE.txt`.
- Typo.js: `dist/vendor/typo-LICENSE.txt`.
- Dicionário PT-PT distribuído no LibreOffice, GPL-2.0: origem e versões em `dist/vendor/pt-PT-SOURCES.md`; licenças nos ficheiros `pt-PT-LICENSES.txt` e `pt-PT-COPYING-GPL-2.txt`.
- Fontes Liberation Sans: `dist/vendor/LiberationSans-LICENSE.txt`.

Consultar também `dist/CREDITOS.txt` e `dist/vendor/PDF-EXPORT-SOURCES.md` e preservar todas as licenças ao redistribuir. A Rumo é independente das entidades referidas; nenhuma delas valida os pesos da pontuação. Os dados do exemplo são fictícios.
