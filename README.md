# Macro — contador de calorias pessoal

App para o iPhone, inspirada no MacroFactor: lês o código de barras de um produto, a app vai buscar os valores nutricionais ao [Open Food Facts](https://world.openfoodfacts.org) (gratuito, sem chave) e guarda o alimento numa base de dados no telemóvel. Da próxima vez que leres o mesmo código, o alimento aparece logo, mesmo sem internet.

É uma **web app instalável (PWA)**: abre-se no Safari, adiciona-se ao ecrã principal e passa a funcionar como uma app, em ecrã inteiro e offline. Não precisa de Xcode, de conta de programador da Apple nem da App Store, e não expira ao fim de 7 dias como as apps instaladas pelo Xcode com uma conta grátis.

## O que faz

- **Leitor de códigos de barras** (EAN-13, EAN-8, UPC) com a câmara traseira, ou escrevendo os números à mão.
- **Base de dados local** (IndexedDB): cada produto lido fica guardado. A procura é sempre feita primeiro aqui e só depois no Open Food Facts.
- **Produto inexistente ou incompleto?** Crias ou completas o alimento com os valores do rótulo (por 100 g ou por porção) e fica associado ao código.
- **Diário** com pequeno-almoço, almoço, lanche e jantar; calorias restantes; proteína, gordura e hidratos face ao objetivo.
- Quantidade em g/ml, porções ou embalagens; a app sugere sempre a última quantidade usada.
- **Adição rápida** (só calorias/macros), **favoritos**, **recentes** e **copiar a refeição do dia anterior**.
- **Progresso**: peso de tendência (média suavizada, como no MacroFactor), calorias por dia face ao objetivo e médias de macros.
- **Gasto energético estimado** a partir do que comes e da variação do teu peso.
- **Calculadora de objetivos** (Mifflin-St Jeor + atividade + ritmo de perda/ganho), que também pode usar o gasto medido pelos teus dados.
- **Cópia de segurança** em JSON (exportar para a app Ficheiros/iCloud e repor).
- Modo claro e escuro automáticos.

## Pôr no iPhone

A câmara só funciona em páginas **HTTPS**, por isso a app tem de ser publicada num alojamento estático. Abaixo estão duas opções gratuitas.

### Opção A — GitHub Pages (recomendada; atualizações com `git push`)

1. Cria um repositório **público** vazio no GitHub, por exemplo `macro`.
2. Neste diretório:
   ```sh
   git init -b main
   git add .
   git commit -m "Macro: contador de calorias"
   git remote add origin https://github.com/<o-teu-utilizador>/macro.git
   git push -u origin main
   ```
3. No GitHub: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
4. Espera 1–2 minutos pelo workflow *Publicar no GitHub Pages* (separador **Actions**). A app fica em `https://<o-teu-utilizador>.github.io/macro/`.

O workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) corre os testes, compila a app com o caminho certo para o repositório e publica-a. Se o repositório se chamar `<utilizador>.github.io`, altera `BASE_PATH` para `/` no workflow.

### Opção B — Netlify Drop (sem git)

1. `npm install` e depois `npm run build`.
2. Arrasta a pasta `dist` para <https://app.netlify.com/drop> e cria uma conta grátis para o site não expirar.
3. Para atualizar, repete o `npm run build` e arrasta a pasta `dist` para a página **Deploys** desse site.

### Instalar no ecrã principal

1. No iPhone, abre o endereço da app no **Safari**.
2. Toca em **Partilhar** › **Adicionar ao ecrã principal**.
3. Abre a app pelo ícone. Da primeira vez que leres um código, toca em **Permitir** para dar acesso à câmara.

> A app instalada tem dados próprios, separados dos do Safari: usa sempre o ícone do ecrã principal.

## Os teus dados

- Tudo fica **só no iPhone**: não há servidor nem conta. A única coisa que sai do telemóvel é o código de barras enviado ao Open Food Facts quando um produto ainda não está guardado.
- Se apagares a app do ecrã principal, os dados são apagados. Usa **Definições › Cópia de segurança › Exportar** de vez em quando e guarda o ficheiro no iCloud Drive.
- Os dados estão ligados ao endereço da app. Se mudares de alojamento (por exemplo do Netlify para o GitHub Pages), exporta antes e repõe no novo endereço.

## Desenvolvimento

Precisa de Node.js 20.19+ (testado com o Node 25).

```sh
npm install
npm run dev          # http://localhost:5173 (a câmara funciona em localhost)
npm test             # testes unitários (Vitest)
npm run test:e2e     # teste de ponta a ponta no Chrome com câmara simulada (precisa do Chrome e de internet)
npm run build        # versão de produção em dist/
npm run preview      # serve a pasta dist/
```

Para testar no iPhone na mesma rede Wi-Fi sem publicar, arranca o servidor com HTTPS:

```sh
npm run dev:https    # depois abre https://<IP-do-Mac>:5173 no iPhone e aceita o aviso do certificado
```

Os ícones e o ecrã de arranque são gerados a partir do mesmo desenho com `npm run icons`.

### Estrutura

| Pasta/ficheiro | O quê |
| --- | --- |
| `src/db.ts` | Esquema da base de dados (Dexie/IndexedDB): alimentos, registos, pesagens e definições |
| `src/data.ts` | Operações: procurar por código, registar, copiar refeições, guardar objetivos |
| `src/lib/off.ts` | Cliente do Open Food Facts e conversão dos dados para valores por 100 g/ml |
| `src/lib/scanner.ts` | Leitura de códigos com ZXing em WebAssembly (o Safari não tem `BarcodeDetector`) |
| `src/lib/trend.ts` | Peso de tendência e estimativa do gasto energético |
| `src/lib/goals.ts` | Calculadora de objetivos |
| `src/screens/` | Ecrãs da app |
| `src/components/` | Componentes partilhados, gráficos e ícones |

## Limitações conhecidas

- A **pesquisa por nome** procura nos teus alimentos guardados. A pesquisa por texto do Open Food Facts não está disponível para apps no browser (a API antiga está desativada e a nova não aceita pedidos de outros sites), mas a consulta por código de barras funciona normalmente.
- O Safari não deixa as páginas web ligar a **lanterna**; o botão só aparece nos browsers que o permitem.
- Em algumas versões do iOS, a app instalada volta a pedir autorização da câmara de cada vez que é aberta. É um comportamento do sistema.
- Os valores do Open Food Facts são introduzidos por voluntários. Se algo parecer errado, toca no lápis para corrigir o alimento: a correção fica guardada no teu telemóvel.

Dados de produtos: © Open Food Facts, disponíveis sob a [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
