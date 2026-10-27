import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const checks = [
  ['https://openstax.org/books/university-physics-volume-3/pages/9-3-bonding-in-crystalline-solids', 'title', 'Bonding in Crystalline Solids'],
  ['https://openstax.org/books/chemistry-2e/pages/10-6-lattice-structures-in-crystalline-solids', 'title', 'Lattice Structures in Crystalline Solids'],
  ['https://en.wikipedia.org/wiki/Copper', 'body', 'Lattice constant'],
  ['https://en.wikipedia.org/wiki/Iron', 'body', '286.65'],
  ['https://en.wikipedia.org/wiki/Sodium_chloride', 'body', 'Lattice constant'],
  ['https://en.wikipedia.org/wiki/Tight_binding', 'title', 'Tight binding'],
  ['http://hyperphysics.phy-astr.gsu.edu/hbase/electric/ohmmic.html', 'body', "Ohm's Law"],
  ['https://physics.nist.gov/cuu/Constants/', 'title', 'Fundamental Physical Constants'],
  ['https://www.britannica.com/science/Curie-point', 'body', 'Curie point'],
  ['https://openstax.org/books/university-physics-volume-2/pages/11-1-magnetism-and-its-historical-discoveries', 'title', 'Magnetism and Its Historical Discoveries'],
  ['https://www.pas.rochester.edu/~stte/phy418S23/units/unit_4-3.pdf', 'status', ''],
  ['https://en.wikipedia.org/wiki/Crystallographic_defect', 'body', 'Crystallographic defect'],
  ['https://www.nobelprize.org/prizes/physics/1972/summary/', 'title', 'The Nobel Prize in Physics 1972'],
  ['https://openstax.org/books/university-physics-volume-3/pages/9-8-superconductivity', 'title', 'Superconductivity'],
];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', locale: 'en-US' });
const results = [];
for (const [url, field, keyword] of checks) {
  const page = await context.newPage();
  try {
    if (field === 'status') {
      const response = await context.request.get(url, { timeout: 60000 });
      const title = (await page.title()) || 'PDF resource';
      const passed = response.status() < 400;
      results.push({ url, status: response.status(), title, keyword, passed });
      console.log(`${passed ? 'PASS' : 'FAIL'} ${response.status()} ${url} | ${title.slice(0, 80)}`);
      await page.close();
      continue;
    }
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(800);
    const title = await page.title();
    const body = await page.locator('body').innerText({ timeout: 20000 });
    const haystack = field === 'title' ? title : body;
    const passed = !!response && response.status() < 400 && haystack.toLowerCase().includes(keyword.toLowerCase());
    results.push({ url, status: response?.status() ?? null, title, keyword, passed });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${response?.status() ?? 'ERR'} ${url} | ${title.slice(0, 80)}`);
  } catch (error) {
    results.push({ url, status: null, title: '', keyword, passed: false, error: error.message.split('\n')[0] });
    console.log(`FAIL ERR ${url} | ${error.message.split('\n')[0]}`);
  }
  await page.close();
}
writeFileSync('artifacts/citation-audit.json', JSON.stringify({ passed: results.filter(result => result.passed).length, total: results.length, results }, null, 2));
console.log(`\n${results.filter(result => result.passed).length}/${results.length} citations verified in a browser.`);
await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
process.exit(results.every(result => result.passed) ? 0 : 1);
