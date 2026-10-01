// Teste de ponta a ponta: a app no Chrome com o ecrã de um iPhone 14 e uma câmara
// simulada (vídeo com um código de barras). Usa a rede para falar com o Open Food Facts.
//
//   npm run test:e2e            (compila, serve dist/ e corre todos os fluxos)
//   node scripts/e2e/run.mjs b  (só um fluxo: a, dark, b, c, d ou e)
//
// Variáveis: CHROME_PATH (Chrome instalado), APP_URL (usar um servidor já a correr).
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices } from 'playwright-core';
import { preview } from 'vite';
import { makeVideo } from './make-video.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const SHOTS = join(HERE, 'shots') + '/';
const WORK = join(tmpdir(), 'macro-e2e');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(WORK, { recursive: true });
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const only = process.argv[2];
const VIDEOS = {
  'nutella.y4m': '3017620422003',
  'notfound.y4m': '5609876543212',
  'blank.y4m': '',
  'prince.y4m': '7622210449283',
};
let APP = process.env.APP_URL;

const problems = [];
const step = (msg) => console.log('  ✓', msg);
function assert(cond, msg) {
  if (!cond) throw new Error(`Falhou: ${msg}`);
}

const browsers = [];
async function launch(video) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${join(WORK, video)}`,
    ],
  });
  browsers.push(browser);
  return browser;
}

async function newPage(browser, colorScheme = 'light') {
  const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 14'];
  const context = await browser.newContext({
    ...iphone,
    viewport: { width: 390, height: 844 },
    colorScheme,
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    permissions: ['camera'],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  return { context, page };
}

const shot = (page, name, fullPage = false) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage });
const back = (page) => page.getByRole('button', { name: 'Voltar', exact: true }).click();
const mealCard = (page, name) => page.locator('section.meal', { has: page.getByRole('heading', { name, exact: true }) });

async function scan(page) {
  await page.getByRole('button', { name: 'Ler código de barras' }).click();
}

/** Pesagens e refeições dos últimos 45 dias, escritas diretamente no IndexedDB. */
async function seed(page) {
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('macro');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction(['weights', 'entries'], 'readwrite');
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (let i = 45; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = iso(d);
      if (i % 4 !== 0) {
        const kg = 84 - (45 - i) * 0.07 + Math.sin(i * 1.7) * 0.6;
        tx.objectStore('weights').put({ date, kg: Math.round(kg * 10) / 10 });
      }
      if (i <= 30 && i % 9 !== 4) {
        const kcal = 2050 + Math.round(Math.sin(i) * 260);
        tx.objectStore('entries').add({
          date,
          meal: 'lunch',
          createdAt: d.getTime(),
          name: 'Refeição de teste',
          quick: true,
          nutrients: { kcal, protein: (kcal * 0.3) / 4, fat: (kcal * 0.3) / 9, carbs: (kcal * 0.4) / 4 },
        });
      }
    }
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByText(/kcal (restantes|acima)/).waitFor();
}

/* ---------------- Fluxo A: ler Nutella, registar, editar, adicionar ---------------- */
async function flowA(colorScheme) {
  console.log(`\nFluxo A (${colorScheme}): leitura do código da Nutella`);
  const browser = await launch('nutella.y4m');
  const { page } = await newPage(browser, colorScheme);
  const tag = colorScheme === 'dark' ? '-escuro' : '';
  await page.goto(APP);
  await page.getByText('kcal restantes').waitFor();
  await shot(page, `01-diario-vazio${tag}`);
  step('diário vazio');

  const t0 = Date.now();
  await scan(page);
  await page.getByRole('heading', { name: 'Nutella', exact: true }).waitFor({ timeout: 30000 });
  step(`código lido e produto obtido do Open Food Facts em ${Date.now() - t0} ms`);
  await page.getByText('Encontrado no Open Food Facts').waitFor();
  await page.waitForTimeout(400);
  await shot(page, `02-registar-nutella${tag}`);

  await page.locator('#qty').fill('15');
  await page.locator('label', { hasText: /^Lanche$/ }).click();
  const kcalShown = await page.locator('.nutrition-kcal strong').innerText();
  assert(kcalShown === '81', `15 g de Nutella = 81 kcal (mostrou ${kcalShown})`);
  step('15 g → 81 kcal calculado na hora');
  await page.getByRole('button', { name: 'Adicionar ao diário' }).click();
  await page.getByText('kcal restantes').waitFor();
  const lanche = mealCard(page, 'Lanche');
  await lanche.locator('.row-title', { hasText: 'Nutella' }).first().waitFor();
  assert((await lanche.innerText()).includes('81'), 'registo de 81 kcal no lanche');
  step('registo no lanche');
  await page.waitForTimeout(300);
  await shot(page, `03-diario-com-registo${tag}`);

  if (colorScheme === 'dark') {
    await seed(page);
    await page.getByRole('button', { name: 'Progresso' }).click();
    await page.getByText('Peso de tendência', { exact: true }).waitFor();
    await page.waitForTimeout(300);
    await shot(page, '10-progresso-escuro', true);
    await browser.close();
    return;
  }

  // Segunda leitura: tem de vir da base de dados local, com a última quantidade.
  await scan(page);
  await page.getByRole('heading', { name: 'Nutella', exact: true }).waitFor({ timeout: 30000 });
  assert((await page.getByText('Encontrado no Open Food Facts').count()) === 0, 'segunda leitura vem da base local');
  assert((await page.locator('#qty').inputValue()) === '15', 'sugere a última quantidade (15 g)');
  step('segunda leitura veio da base local e sugeriu 15 g');
  await back(page);

  // Editar o registo.
  await lanche.getByRole('button', { name: /Nutella/ }).click();
  await page.getByRole('heading', { name: 'Editar registo' }).waitFor();
  await page.locator('#qty').fill('30');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('kcal restantes').waitFor();
  assert((await lanche.innerText()).includes('162'), 'registo editado para 30 g = 162 kcal');
  step('registo editado (30 g → 162 kcal)');

  // Ecrã "Adicionar": + rápido e adição rápida.
  await lanche.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByRole('heading', { name: 'Adicionar · Lanche' }).waitFor();
  await page.waitForTimeout(300);
  await shot(page, '04-adicionar');
  await page.getByRole('button', { name: /Adicionar 30 g de Nutella/ }).click();
  await page.getByText(/adicionado/).waitFor();
  await shot(page, '05-aviso-anular');
  step('“+” regista a última quantidade com aviso “Anular”');

  await page.getByRole('button', { name: 'Adição rápida' }).click();
  await page.locator('#q-kcal').fill('650');
  await page.locator('#q-protein').fill('42');
  await page.locator('#q-name').fill('Bitoque');
  await page.locator('label', { hasText: /^Jantar$/ }).click();
  await shot(page, '06-adicao-rapida');
  await page.getByRole('button', { name: 'Adicionar ao diário' }).click();
  await page.getByRole('heading', { name: 'Adicionar · Lanche' }).waitFor();
  await back(page);
  await page.getByText('kcal restantes').waitFor();
  assert((await mealCard(page, 'Jantar').innerText()).includes('Bitoque'), 'adição rápida no jantar');
  step('adição rápida no jantar');
  await page.waitForTimeout(300);
  await shot(page, '07-diario-cheio', true);

  // Dia seguinte: copiar o lanche do dia anterior.
  await page.getByRole('button', { name: 'Dia seguinte' }).click();
  await page.getByRole('heading', { name: 'Amanhã' }).waitFor();
  await mealCard(page, 'Lanche').getByRole('button', { name: 'Copiar do dia anterior' }).click();
  await page.getByText(/copiados do dia anterior/).waitFor();
  await page.waitForTimeout(300);
  assert((await mealCard(page, 'Lanche').locator('.row-title', { hasText: 'Nutella' }).count()) === 2, 'dois registos copiados');
  step('copiar refeição do dia anterior');
  await page.getByRole('button', { name: 'Voltar a hoje' }).click();
  await page.getByRole('heading', { name: 'Hoje' }).waitFor();

  // Progresso com dados.
  await seed(page);
  await page.getByRole('button', { name: 'Progresso' }).click();
  await page.getByText('Peso de tendência', { exact: true }).waitFor();
  await page.waitForTimeout(300);
  await shot(page, '08-progresso', true);
  const tdee = await page.locator('.stat-value-big').innerText();
  assert(/kcal\/dia/.test(tdee), 'gasto energético estimado calculado');
  step(`gasto estimado: ${tdee}`);

  // Tooltip do gráfico de calorias.
  const bars = page.locator('.chart-hit');
  await bars.nth(20).dispatchEvent('pointerdown');
  await page.locator('.chart-tooltip').waitFor();
  await page.locator('.chart-tooltip').scrollIntoViewIfNeeded();
  await shot(page, '09-tooltip-calorias');
  await page.getByRole('radio', { name: '3 meses' }).check({ force: true });
  await page.waitForTimeout(300);
  await shot(page, '09b-progresso-3-meses', true);

  // Objetivos.
  await page.getByRole('button', { name: 'Definições' }).click();
  await page.getByRole('heading', { name: 'Objetivos diários' }).waitFor();
  await shot(page, '11-definicoes', true);
  await page.getByRole('button', { name: 'Calcular' }).click();
  await page.getByRole('heading', { name: 'Calcular objetivos' }).waitFor();
  await page.locator('#p-age').fill('32');
  await page.locator('#p-height').fill('178');
  await page.locator('label', { hasText: /^Perder peso$/ }).click();
  await page.waitForTimeout(200);
  await shot(page, '12-calcular-objetivos', true);
  await page.getByRole('button', { name: 'Aplicar objetivos' }).click();
  await page.getByText('Objetivos atualizados').waitFor();
  step('objetivos calculados e aplicados');

  await page.getByRole('button', { name: 'Diário' }).click();
  assert((await page.getByText('Define os teus objetivos').count()) === 0, 'aviso de objetivos desaparece');
  await page.getByRole('button', { name: 'Alimentos' }).click();
  await page.getByRole('heading', { name: 'Alimentos' }).waitFor();
  await shot(page, '13-alimentos');

  // Exportar cópia de segurança (no Chrome de secretária descarrega o ficheiro).
  await page.getByRole('button', { name: 'Definições' }).click();
  // Sem folha de partilha (como num browser de secretária) → descarrega o ficheiro.
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.getByRole('button', { name: 'Exportar' }).click(),
  ]);
  const path = join(WORK, 'backup.json');
  await download.saveAs(path);
  step(`cópia de segurança exportada (${download.suggestedFilename()})`);

  // Apagar tudo e repor a cópia.
  await page.getByRole('button', { name: 'Apagar todos os dados' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar tudo' }).click();
  await page.getByText('Dados apagados').waitFor();
  await page.locator('input[type=file]').setInputFiles(path);
  await page.getByRole('dialog').getByRole('button', { name: 'Repor' }).click();
  await page.getByText(/Reposto: \d+ alimentos?,/).waitFor();
  step(`cópia reposta: ${await page.getByText(/Reposto:/).innerText()}`);
  await browser.close();
}

/* ---------------- Fluxo B: código desconhecido → criar alimento ---------------- */
async function flowB() {
  console.log('\nFluxo B: produto que não existe no Open Food Facts');
  const browser = await launch('notfound.y4m');
  const { page } = await newPage(browser);
  await page.goto(APP);
  await page.getByText('kcal restantes').waitFor();
  await scan(page);
  await page.getByRole('heading', { name: 'Produto não encontrado' }).waitFor({ timeout: 30000 });
  await shot(page, '14-nao-encontrado');
  step('código 5609876543212 não encontrado');
  await page.getByRole('button', { name: 'Criar alimento' }).click();
  await page.getByRole('heading', { name: 'Novo alimento' }).waitFor();
  assert((await page.locator('#f-barcode').inputValue()) === '5609876543212', 'código preenchido');
  await page.getByRole('button', { name: 'Guardar e continuar' }).click();
  await page.locator('#err-name').waitFor();
  step('validação: nome e calorias obrigatórios');
  await page.locator('#f-name').fill('Bolachas de aveia');
  await page.locator('#f-brand').fill('Marca da casa');
  await page.locator('label', { hasText: /^Porção$/ }).click();
  await page.locator('#f-serving').fill('30');
  await page.locator('label', { hasText: /^Porção$/ }).click();
  await page.locator('#f-protein').fill('2,1');
  await page.locator('#f-fat').fill('5,4');
  await page.locator('#f-carbs').fill('19');
  await page.getByRole('button', { name: /Usar \d+ kcal/ }).click();
  await shot(page, '15-novo-alimento', true);
  await page.getByRole('button', { name: 'Guardar e continuar' }).click();
  await page.getByRole('heading', { name: 'Bolachas de aveia' }).waitFor();
  const per100 = await page.locator('.nutrition-per100').innerText();
  assert(per100.includes('P 7') && per100.includes('H 63'), `valores por porção convertidos para 100 g (${per100})`);
  step(`valores por porção convertidos: ${per100}`);
  await page.getByRole('button', { name: 'Adicionar ao diário' }).click();
  await page.getByText('kcal restantes').waitFor();
  step('alimento criado e registado');

  await scan(page);
  await page.getByRole('heading', { name: 'Bolachas de aveia' }).waitFor({ timeout: 30000 });
  step('a seguir, o mesmo código é reconhecido a partir da base local');
  await browser.close();
}

/* ---------------- Fluxo C: câmara sem código + introdução manual ---------------- */
async function flowC() {
  console.log('\nFluxo C: leitor sem código à vista e código escrito à mão');
  const browser = await launch('blank.y4m');
  const { page } = await newPage(browser);
  await page.goto(APP);
  await page.getByText('kcal restantes').waitFor();
  await scan(page);
  await page.getByText('Aponta para o código de barras').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await shot(page, '16-leitor');
  step('câmara aberta com moldura');
  await page.getByRole('button', { name: 'Escrever o código' }).click();
  await page.locator('#manual-code').fill('3017620422004');
  await page.getByRole('button', { name: 'Procurar' }).click();
  await page.locator('#manual-code-error').waitFor();
  step('dígito de controlo errado é rejeitado');
  await page.locator('#manual-code').fill('3017620422003');
  await shot(page, '17-codigo-manual');
  await page.getByRole('button', { name: 'Procurar' }).click();
  await page.getByRole('heading', { name: 'Nutella', exact: true }).waitFor({ timeout: 30000 });
  step('código escrito à mão encontrado');
  await browser.close();
}


/* ---------------- Fluxo D: sem internet ---------------- */
async function flowD() {
  console.log('\nFluxo D: funciona sem internet');
  const browser = await launch('nutella.y4m');
  const { context, page } = await newPage(browser);
  await page.goto(APP);
  await page.getByText('kcal restantes').waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  step('service worker ativo');
  await scan(page);
  await page.getByRole('heading', { name: 'Nutella', exact: true }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await back(page);
  await context.setOffline(true);
  await page.reload();
  await page.getByText('kcal restantes').waitFor();
  step('a app abre sem internet');
  await scan(page);
  await page.getByRole('heading', { name: 'Nutella', exact: true }).waitFor({ timeout: 30000 });
  const img = await page.locator('.food-head img').evaluate((el) => el.complete && el.naturalWidth > 0);
  step(`código lido sem internet (foto em cache: ${img ? 'sim' : 'não'})`);
  await shot(page, '18-offline');
  await browser.close();
}


/* ---------------- Fluxo E: nomes em português/inglês ---------------- */
async function flowE() {
  console.log('\nFluxo E: nome do produto em português ou inglês');
  const browser = await launch('prince.y4m');
  const { page } = await newPage(browser);
  await page.goto(APP);
  await page.getByText('kcal restantes').waitFor();

  // Alimento guardado por uma versão antiga, com o nome em francês, e um registo de hoje.
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('macro');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction(['foods', 'entries'], 'readwrite');
    const now = Date.now();
    const per100 = { kcal: 520, protein: 6, fat: 25, carbs: 66 };
    const add = (store, value) =>
      new Promise((res, rej) => {
        const r = tx.objectStore(store).add(value);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    const old = 'Biscuits NUTELLA Biscuits Noisettes et Cacao x22 - 304g';
    const foodId = await add('foods', {
      barcode: '8000500310427', name: old, unit: 'g', per100, source: 'off',
      favorite: 0, useCount: 1, lastUsedAt: now, lastAmount: 28, createdAt: now, updatedAt: now,
    });
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await add('entries', {
      date, meal: 'snack', createdAt: now, foodId, name: old, amount: 28, unit: 'g', per100,
      nutrients: { kcal: 145.6, protein: 1.7, fat: 7, carbs: 18.5 },
    });
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
  });
  await page.reload();
  await page.getByText('Crocantes bolachas com um coração cremoso de Nutella®').waitFor({ timeout: 20000 });
  step('alimento já guardado em francês passou a português (também no diário)');

  await scan(page);
  await page.getByRole('heading', { name: 'Prince Goût Chocolat au Blé Complet' }).waitFor({ timeout: 30000 });
  step('produto francês sem nome em português aparece com o nome em inglês');
  await shot(page, '19-nome-ingles');
  await browser.close();
}

const flows = { a: () => flowA('light'), dark: () => flowA('dark'), b: flowB, c: flowC, d: flowD, e: flowE };
let server;
try {
  for (const [file, code] of Object.entries(VIDEOS)) {
    if (!existsSync(join(WORK, file))) await makeVideo(code, join(WORK, file));
  }
  if (!APP) {
    server = await preview({ preview: { port: 4173 } });
    APP = server.resolvedUrls.local[0];
  }
  for (const [name, run] of Object.entries(flows)) if (!only || only === name) await run();
  console.log(`\nTudo OK. Capturas em ${SHOTS}`);
} catch (err) {
  console.error('\n✗', err.message);
  process.exitCode = 1;
} finally {
  await Promise.all(browsers.map((b) => b.close().catch(() => {})));
  await server?.close();
  // O 404 do Open Food Facts no fluxo B (produto inexistente) é esperado.
  const relevant = problems.filter((p) => !p.includes('favicon') && !p.includes('status of 404'));
  if (relevant.length) {
    console.log('\nConsola do browser:');
    for (const p of [...new Set(relevant)]) console.log('  ', p);
  }
}
