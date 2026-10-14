# Rumo — o teu CV, com mais rumo

Uma ferramenta gratuita para perceber o que melhorar num currículo, feita como projeto académico de Economia em português de Portugal.

**Carregar → perceber a pontuação → melhorar.** Um único percurso, com critérios transparentes e sugestões concretas. A aplicação funciona inteiramente no navegador e pode ser publicada gratuitamente no GitHub Pages.

## O que faz

- Importa PDF com texto selecionável ou TXT; também aceita texto colado.
- Dá uma pontuação de preparação de **0 a 100**, discriminada em nove critérios.
- Mostra as melhorias por prioridade e os pontos que cada uma permite recuperar.
- Procura possíveis erros ortográficos com um dicionário PT-PT e verifica repetições e sinais básicos de pontuação.
- Permite aplicar sugestões de escrita ou confirmar que um termo está correto.
- Estima o número de páginas e o tamanho de letra num PDF; pede revisão humana para gramática e apresentação visual.
- Compara, opcionalmente, palavras do CV com uma descrição de vaga.
- Permite descarregar um plano de melhoria e o texto revisto, em TXT.
- Inclui um exemplo fictício de Economia e adapta-se a telemóvel e computador.

## Experimentar localmente

Requer **Node.js 22 ou superior**. Não há dependências para instalar.

1. Extrair a pasta do projeto.
2. Abrir um terminal nessa pasta e executar `node server.mjs` (ou `npm start`).
3. Abrir **http://127.0.0.1:4173** no navegador.

Em Windows, o ficheiro `Iniciar-Rumo.cmd` facilita o arranque se o Node.js estiver instalado. O terminal precisa de ficar aberto durante a utilização. Para parar, usar Ctrl+C no terminal.

Não abrir `dist/index.html` diretamente: os módulos e o dicionário precisam de um servidor HTTP, como o servidor local incluído ou o GitHub Pages.

## Publicar gratuitamente no GitHub Pages

Não é necessário comprar um domínio. Um repositório público pode usar o endereço `https://mitchell1970.github.io/RUMO/`.

1. Usar o repositório público [MItchell1970/RUMO](https://github.com/MItchell1970/RUMO).
2. Colocar na raiz do repositório os ficheiros desta pasta, incluindo `.github/workflows/pages.yml`. A pasta `dist` deve ficar diretamente na raiz, sem outra pasta a envolvê-la.
3. Em **Settings → Pages → Build and deployment**, selecionar **GitHub Actions** como origem.
4. Em **Actions**, abrir **Testar e publicar a Rumo** e executar **Run workflow** na branch `main`. As atualizações futuras em `main` voltam a testar e publicar automaticamente.
5. Quando o trabalho terminar com sucesso, abrir o endereço indicado no ambiente `github-pages`.

O workflow executa os testes antes de publicar apenas a pasta `dist`. O site não necessita de chaves, contas de utilizador, base de dados ou serviços pagos. O código usa caminhos relativos, compatíveis com subpastas do GitHub Pages.

Documentação oficial: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Como se calcula a pontuação

| Critério | Máximo | Verificação |
|---|---:|---|
| Contacto | 10 | Um meio de contacto identificado |
| Perfil e objetivo | 10 | Introdução com contexto e objetivo |
| Formação | 10 | Secção com conteúdo de formação |
| Experiência ou projetos | 15 | Experiência, projeto académico ou voluntariado descrito |
| Exemplos e resultados | 10 | Ação e entrega concretas, sem exigir números inventados |
| Competências demonstráveis | 10 | Ferramentas/capacidades com explicação |
| Organização do conteúdo | 10 | Secções identificáveis no texto |
| Escrita | 15 | Ortografia (9), pontuação (3), revisão humana de gramática (3) |
| Apresentação e legibilidade | 10 | Sinais de PDF e revisão visual, ou confirmação humana no texto |
| **Total** | **100** | |

As sugestões somam exatamente os pontos em falta. Os pesos são uma decisão educativa deste projeto: não constituem uma escala científica validada nem uma avaliação utilizada por empregadores.

No PDF, até duas páginas vale três pontos e a indicação de letra legível vale quatro. São referências para candidaturas de início de carreira, não regras universais. A revisão visual vale os três pontos restantes. Ao colar texto, a apresentação não é inferida: os dez pontos dependem de confirmação humana. Ao editar o texto, as confirmações e medidas do PDF anterior deixam de se aplicar.

O exemplo começa com **72 pontos** quando o dicionário está disponível: faltam exemplos/resultados (10), detalhe nas competências (5), revisão de gramática (3) e revisão visual (10). As confirmações pessoais aparecem explicitamente no resultado.

## Limites e privacidade

- A análise usa regras locais, sem IA generativa ou serviços externos para interpretar o CV. Pode falhar na identificação de conteúdo, termos técnicos ou nomes próprios.
- A revisão automática não compreende toda a gramática. As sugestões precisam de confirmação; o utilizador faz a leitura final.
- O formato do PDF é avaliado apenas por medidas aproximadas. Colunas, margens, cores e sobreposições exigem revisão visual. PDFs digitalizados como imagem e documentos protegidos não são suportados.
- Limites de importação: 5 MB, 12 páginas e 30 000 caracteres. A análise exige pelo menos 40 palavras.
- A comparação de palavras-chave não altera a pontuação, não compreende sinónimos nem certifica compatibilidade com sistemas de recrutamento.
- **100 pontos significa cumprir a lista deste projeto**, não ter um CV perfeito nem ter contratação garantida.
- O conteúdo do CV é processado em memória no navegador. A aplicação não o envia a um servidor, não usa analytics, cookies de rastreio ou armazenamento persistente. O servidor de alojamento continua a receber os pedidos normais para abrir o site e os seus recursos.
- Fechar ou recarregar a página elimina o texto da memória da aplicação. Os ficheiros descarregados permanecem no dispositivo. Editar o texto aqui não modifica o PDF original.

## Código e verificação

```text
dist/
  index.html          Página e conteúdo em PT-PT
  styles.css          Identidade visual e comportamento responsivo
  app.js              Interação, estado, resultados e exportação
  analyzer.js         Critérios transparentes de pontuação
  writing.js          Comunicação com o verificador de escrita
  writing-worker.js   Dicionário e regras de escrita fora da interface
  pdf-reader.js       Extração de texto e medidas aproximadas de PDF
  vendor/             Bibliotecas, dicionário, fontes e licenças
tests/                Testes de critérios, escrita e leitura de ficheiros
.github/workflows/   Validação e publicação no GitHub Pages
server.mjs            Servidor local
```

Executar os testes com `node --test tests/*.test.mjs` (ou `npm test`). A suíte cobre a soma e os limites da pontuação, conteúdos incompletos, alertas, falhas do dicionário, acentos, confirmação humana, metadados de PDF, limites e erros de importação. A interface é também verificada manualmente em computador e telemóvel.

As decisões técnicas privilegiam simplicidade: HTML, CSS e JavaScript, sem processo de compilação. O Web Worker evita bloquear a interface durante a revisão ortográfica. Os conteúdos introduzidos pelo utilizador são escapados antes de serem apresentados como HTML.

## Apresentação na faculdade e portefólio

Uma demonstração de três minutos:

1. Explicar o problema: é difícil perceber o que falta num CV quando se procura a primeira oportunidade.
2. Carregar o exemplo e mostrar a pontuação e as sugestões com pontos recuperáveis.
3. Melhorar uma competência e acrescentar uma entrega verdadeira de um projeto; voltar a analisar.
4. Introduzir um erro como “responssabilidade”, demonstrar a sugestão de correção e aplicar.
5. Explicar por que motivo a gramática e a apresentação ainda exigem leitura humana; descarregar o plano.

Para o portefólio, mostra o problema, as decisões de produto, a ligação à Economia, a metodologia de pontuação e os testes. O projeto foi desenvolvido com assistência de IA: descreve a tua participação com transparência. Uma evolução útil é testar com colegas e documentar o que mudaste a partir desse feedback, sem publicar os seus CVs.

## Fontes e componentes de terceiros

- [Europass — criar um CV](https://europass.europa.eu/pt/create-europass-cv): referência para organização e adaptação do conteúdo.
- [Europass — informações do perfil](https://europass.europa.eu/pt/what-type-information-should-i-include-my-europass-profile): referência para formação, experiências e competências.
- Mozilla PDF.js 5.6.205: licença Apache 2.0 em `dist/vendor/LICENSE-pdfjs.txt`.
- Typo.js: licença em `dist/vendor/typo-LICENSE.txt`.
- Dicionário PT-PT distribuído no projeto LibreOffice: origem, versões e licença GPL-2.0 em `dist/vendor/pt-PT-SOURCES.md`, `pt-PT-LICENSES.txt` e `pt-PT-COPYING-GPL-2.txt`.

Consultar também `dist/CREDITOS.txt`. Preservar as licenças dos componentes ao redistribuir. A Rumo é independente das entidades mencionadas. Os dados do exemplo são fictícios.
