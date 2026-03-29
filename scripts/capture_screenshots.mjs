// scripts/capture_screenshots.mjs
// Captura screenshots de cada aba do app FarmaIA usando Puppeteer
// Run: node scripts/capture_screenshots.mjs

import puppeteer from 'puppeteer';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, '../apresentacao/screenshots');
const BASE_URL = 'http://localhost:3000';

// Cria diretório se não existir
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Abas a capturar: [label do sidebar, nome do arquivo output]
const TABS_TO_CAPTURE = [
  { label: 'Insights do Farma',        file: 'insights_farma' },
  { label: 'Análise Dispensação',      file: 'analise_disp' },
  { label: 'Análise Dispensários V2',  file: 'dispensarios_v2' },
  { label: 'Indicadores CAF',          file: 'indicadores_caf' },
  { label: 'Painel CAF V2',            file: 'painel_caf_v2' },
  { label: 'Requisição V2',            file: 'requisicao_v2' },
  { label: 'Previsibilidade V2',       file: 'previsib_v2' },
  { label: 'Baixas Estoque',           file: 'baixas_estoque' },
  { label: 'Análise Operacional',      file: 'analise_op' },
  { label: 'Avaliação Fornec.',        file: 'fornecedores' },
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveScreenshot(page, filename) {
  const filePath = path.join(SCREENSHOTS_DIR, `${filename}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  ✓ Saved: ${filename}.png`);
  return filePath;
}

async function main() {
  console.log('Iniciando captura de screenshots...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 },
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // ─── 1. Landing Page ────────────────────────────────────────────────
    console.log('Capturando Landing Page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(1500); // wait for animations
    await saveScreenshot(page, 'landing_page');

    // Rolar um pouco para mostrar mais conteúdo (landing_full)
    await page.evaluate(() => window.scrollTo(0, 200));
    await sleep(500);
    await saveScreenshot(page, 'landing_full');
    await page.evaluate(() => window.scrollTo(0, 0));

    // ─── 2. Entrar no App ────────────────────────────────────────────────
    console.log('\nEntrando no sistema...');
    // Clicar em "Acessar o Sistema"
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('Acessar o Sistema') || b.textContent.includes('Acessar FarmaIA'));
      if (btn) btn.click();
    });
    await sleep(1500); // wait for transition

    // Verificar se entrou no app (sidebar deve estar visível)
    const hasSidebar = await page.evaluate(() => {
      return !!document.querySelector('nav') || !!document.querySelector('[class*="sidebar"]');
    });
    console.log(`  App carregado: ${hasSidebar}`);
    await sleep(1000);

    // ─── 3. Capturar cada aba ────────────────────────────────────────────
    for (const tab of TABS_TO_CAPTURE) {
      console.log(`\nCapturando aba: ${tab.label}`);

      // Clicar no item do sidebar pelo texto
      const clicked = await page.evaluate((labelText) => {
        const allButtons = Array.from(document.querySelectorAll('button, a, li'));
        const btn = allButtons.find(el => el.textContent.trim() === labelText || el.textContent.trim().includes(labelText));
        if (btn) {
          btn.click();
          return true;
        }
        // Try partial match
        const partial = allButtons.find(el => el.textContent.trim().startsWith(labelText.substring(0, 8)));
        if (partial) {
          partial.click();
          return 'partial';
        }
        return false;
      }, tab.label);

      if (!clicked) {
        console.log(`  ⚠ Não encontrou botão para: ${tab.label}`);
      }

      await sleep(1200); // wait for tab render + animations
      await saveScreenshot(page, tab.file);
    }

    console.log('\n✅ Todos os screenshots capturados com sucesso!');
    console.log(`📁 Salvos em: ${SCREENSHOTS_DIR}`);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
