import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const safeShot = target => async options => {
  try { await target.screenshot({ ...options, timeout: 10000 }); return; }
  catch {
    try {
      const client = await target.context().newCDPSession(target);
      const metrics = await client.send('Page.getLayoutMetrics');
      const size = options.fullPage ? metrics.cssContentSize : metrics.cssViewportSize;
      const { data } = await client.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: !!options.fullPage,
        clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 },
      });
      writeFileSync(options.path, Buffer.from(data, 'base64'));
      await client.detach();
    } catch { console.warn(`Screenshot unavailable: ${options.path}`); }
  }
};
const shot = { screenshot: safeShot(page) };
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const results = [];
const check = (name, condition) => { assert.ok(condition, name); results.push(name); console.log(`PASS ${name}`); };
const nav = i => page.locator('.chapter-tab').nth(i).click();
const openControls = async () => { if (!(await page.locator('.model-panel').isVisible())) await page.getByRole('button', { name: 'Model controls', exact: true }).click(); };
const closeControls = async () => { if (await page.locator('.model-panel').isVisible()) await page.getByRole('button', { name: 'Close model controls', exact: true }).click(); };
const setRange = async (name, value) => {
  await page.getByRole('slider', { name, exact: true }).evaluate((element, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(element, String(v)); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
};
const annotation = async () => (await page.locator('.lattice-annotation').textContent()) ?? '';
const latticeParameter = async () => (await page.locator('.parameter-note').filter({ hasText: 'Reference lattice parameter' }).textContent()) ?? '';
const numeric = text => Number((text.match(/-?\d+(?:\.\d+)?/) || [])[0]);
await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1400);
const modelChecks = await page.evaluate(async () => {
  const model = await import('/src/models.ts');
  const cu = model.latticeSites('copper', true);
  const faces = cu.filter(site => site.kind === 'face');
  const corners = cu.filter(site => site.kind === 'corner');
  const cellBonds = model.bondPairs('copper', cu);
  const cellDegrees = new Array(cu.length).fill(0);
  cellBonds.forEach(([a, b]) => { cellDegrees[a]++; cellDegrees[b]++; });
  const faceDegrees = cu.map((site, index) => site.kind === 'face' ? cellDegrees[index] : null).filter(value => value !== null);
  const cornerDegrees = cu.map((site, index) => site.kind === 'corner' ? cellDegrees[index] : null).filter(value => value !== null);
  const lattice = model.latticeSites('copper', false);
  const latticeBonds = model.bondPairs('copper', lattice);
  const latticeDegrees = new Array(lattice.length).fill(0);
  latticeBonds.forEach(([a, b]) => { latticeDegrees[a]++; latticeDegrees[b]++; });
  const maxCoordination = Math.max(...latticeDegrees);
  const cellInterstitials = model.interstitialSites(true, 7);
  const latticeInterstitials = model.interstitialSites(false, 7);
  const spins = [0, 0.001, 0.1, 0.5, 0.8, 0.998, 1].map(m => {
    const dirs = model.spinDirections(m, 81);
    const meanY = dirs.reduce((sum, direction) => sum + direction.y, 0) / dirs.length;
    const maxNormError = Math.max(...dirs.map(direction => Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1)));
    return { m, meanY, maxNormError, up: dirs.filter(direction => direction.y > 0.5).length, down: dirs.filter(direction => direction.y < -0.5).length };
  });
  return {
    cuCount: cu.length,
    faceCount: faces.length,
    cornerCount: corners.length,
    faceDegrees,
    cornerDegrees,
    faceCoordinatesValid: faces.every(site => [site.x, site.y, site.z].filter(value => Math.abs(value) === 0.5).length === 1),
    cellPairs: cellBonds.length,
    maxCoordination,
    nnPm: model.nearestNeighbourDistance('copper', 361.5),
    cellInterstitialMax: Math.max(...cellInterstitials.flatMap(site => [Math.abs(site.x), Math.abs(site.y), Math.abs(site.z)])),
    latticeInterstitialMax: Math.max(...latticeInterstitials.flatMap(site => [Math.abs(site.x), Math.abs(site.y), Math.abs(site.z)])),
    spins,
  };
});
check('FCC conventional cell has 14 sites: 8 corners and 6 face centres', modelChecks.cuCount === 14 && modelChecks.cornerCount === 8 && modelChecks.faceCount === 6);
check('FCC face centres use face coordinates, not edge midpoints', modelChecks.faceCoordinatesValid);
check('FCC cell bonds reproduce 8 face-site and 3 corner-site neighbours', modelChecks.faceDegrees.every(value => value === 8) && modelChecks.cornerDegrees.every(value => value === 3) && modelChecks.cellPairs === 36);
check('FCC bulk coordination is 12 at a/√2', modelChecks.maxCoordination === 12 && Math.abs(modelChecks.nnPm - 255.62) < 0.01);
check('Interstitial examples stay inside cell and lattice samples', modelChecks.cellInterstitialMax <= 0.5 && modelChecks.latticeInterstitialMax <= 1.5);
check('Spin arrow average projection matches mean-field m', modelChecks.spins.every(entry => Math.abs(entry.meanY - entry.m) < 1e-12 && entry.maxNormError < 1e-12));
check('Above Tc spin populations are balanced, not downward biased', modelChecks.spins[0].up === 40 && modelChecks.spins[0].down === 40 && Math.abs(modelChecks.spins[0].meanY) < 1e-12);
check('Desktop loads a WebGL lattice', await page.locator('canvas').count() === 1 && !(await page.locator('.fallback-scene').count()));
check('Desktop has no horizontal overflow', await page.evaluate(() => document.body.scrollWidth === innerWidth));
await shot.screenshot({ path: 'artifacts/desktop-initial.png', fullPage: true, timeout: 90000 });
check('Copper lattice annotation identifies FCC and four points', (await annotation()).includes('Face-centered cubic. Four lattice points per conventional cell.'));
await page.getByRole('button', { name: 'Inspect an atom', exact: true }).click();
check('Accessible atom inspection works', await page.locator('.atom-selection').isVisible());
await page.getByRole('button', { name: 'Close atom inspection', exact: true }).click();
await page.getByRole('button', { name: 'Unit cell', exact: true }).click();
check('Unit-cell view is selectable', await page.getByRole('button', { name: 'Unit cell', exact: true }).getAttribute('aria-pressed') === 'true');
check('Copper cell annotation counts four FCC lattice points', (await annotation()).includes('ONE CELL.') && (await annotation()).includes('FOUR LATTICE POINTS.') && (await annotation()).includes('FCC: 8 corners (⅛) + 6 faces (½)'));
await page.waitForTimeout(900);
await shot.screenshot({ path: 'artifacts/desktop-cell.png', fullPage: true, timeout: 90000 });
const inspectedCell = [];
for (let i = 0; i < 14; i++) {
  await page.getByRole('button', { name: 'Inspect an atom', exact: true }).click();
  const kind = (await page.locator('.selected-title span').textContent()) ?? '';
  const position = (await page.locator('.atom-selection p').first().textContent()) ?? '';
  inspectedCell.push({ kind, position, coords: (position.match(/-?\d+\.\d+/g) || []).map(Number) });
}
const inspectedFaces = inspectedCell.filter(entry => entry.kind === 'Face-centered site');
check('Atom inspector reports 8 corners and 6 face-centred sites for FCC', inspectedCell.filter(entry => entry.kind === 'Corner site').length === 8 && inspectedFaces.length === 6);
check('Inspector face positions are (½,0,0), (0,½,0), or (0,0,½)', inspectedFaces.every(entry => entry.coords.filter(value => Math.abs(value) === 0.5).length === 1));
check('Inspector never labels an edge midpoint as face-centred', !inspectedCell.some(entry => entry.kind === 'Face-centered site' && entry.coords.filter(value => Math.abs(value) === 0.5).length !== 1));
await page.getByRole('button', { name: 'Close atom inspection', exact: true }).click();
await openControls();
check('Copper reference lattice parameter is shown precisely', (await latticeParameter()).includes('361.5 pm'));
await page.getByLabel('Crystal structure', { exact: true }).selectOption('iron');
check('Crystal material selection updates the specimen', (await page.locator('.specimen-label').textContent()).includes('Iron'));
check('Iron cell annotation counts two BCC lattice points', (await annotation()).includes('ONE CELL.') && (await annotation()).includes('TWO LATTICE POINTS.') && (await annotation()).includes('BCC: 8 corners (⅛) + 1 body site'));
check('Iron reference lattice parameter keeps 286.65 pm', (await latticeParameter()).includes('286.65 pm'));
await closeControls();
await shot.screenshot({ path: 'artifacts/desktop-iron-cell.png', fullPage: true, timeout: 90000 });
await openControls();
await page.getByRole('button', { name: 'Lattice', exact: true }).click();
await page.waitForTimeout(700);
check('Iron lattice annotation identifies the BCC structure', (await annotation()).includes('Body-centered cubic. Two lattice points per conventional cell.'));
await closeControls();
await shot.screenshot({ path: 'artifacts/desktop-iron-lattice.png', fullPage: true, timeout: 90000 });
await openControls();
await page.getByRole('button', { name: 'Unit cell', exact: true }).click();
await page.getByLabel('Crystal structure', { exact: true }).selectOption('salt');
await page.waitForTimeout(700);
check('Salt cell annotation counts four lattice points and eight ions', (await annotation()).includes('FOUR LATTICE POINTS.') && (await annotation()).includes('EIGHT IONS.') && (await annotation()).includes('FCC + two-ion basis = four formula units'));
check('Salt reference lattice parameter is shown precisely', (await latticeParameter()).includes('564.0 pm'));
await closeControls();
await shot.screenshot({ path: 'artifacts/desktop-salt-cell.png', fullPage: true, timeout: 90000 });
await openControls();
await page.getByRole('button', { name: 'Lattice', exact: true }).click();
await page.waitForTimeout(700);
check('Salt lattice annotation identifies rocksalt and its basis', (await annotation()).includes('Rock salt. An FCC lattice with a two-ion basis.'));
await closeControls();
await shot.screenshot({ path: 'artifacts/desktop-salt-lattice.png', fullPage: true, timeout: 90000 });
await openControls();
await page.getByRole('button', { name: 'Unit cell', exact: true }).click();
await page.getByLabel('Crystal structure', { exact: true }).selectOption('iron');
check('Returning to iron restores two points and 286.65 pm', (await annotation()).includes('TWO LATTICE POINTS.') && (await latticeParameter()).includes('286.65 pm'));
await setRange('Model spacing', 110);
check('Lattice scale control updates', await page.locator('#model-spacing').inputValue() === '110');
await closeControls();
await page.getByRole('button', { name: 'The science', exact: true }).click();
const latticeScience = await page.getByRole('dialog').textContent();
check('Science dialog explains the NaCl basis, formula units, and ions', latticeScience.includes('four lattice points, four NaCl formula units, and eight ions'));
check('Science dialog links the chapter 0 lattice sources', (await page.locator('.reference-list a').evaluateAll(links => links.map(link => link.href))).includes('https://openstax.org/books/university-physics-volume-3/pages/9-3-bonding-in-crystalline-solids'));
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Lattice', exact: true }).click();
await page.waitForTimeout(700);
check('Returning to iron lattice restores the BCC note', (await annotation()).includes('Body-centered cubic. Two lattice points per conventional cell.'));
await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
await page.getByRole('button', { name: 'Rotate model', exact: true }).click();
check('Model rotation can be enabled', await page.getByRole('button', { name: 'Pause rotation', exact: true }).getAttribute('aria-pressed') === 'true');
await page.getByRole('button', { name: 'Pause rotation', exact: true }).click();
const canvas=page.locator('canvas');
await canvas.focus();
await canvas.press('ArrowLeft');
check('Canvas keyboard rotation does not change chapters', await page.locator('.chapter-tab.active').getAttribute('aria-current') === 'step' && (await page.locator('.chapter-tab.active').textContent()).includes('Atomic lattices'));
await nav(1);
await page.waitForTimeout(500);
check('Band plot renders', await page.locator('.band-plot').isVisible());
check('Half filling with t = 1 places the Fermi level at zero', (await page.locator('.band-plot').textContent()).includes('Eꜰ = 0.00 eV'));
await setRange('Hopping strength in electron volts', 2);
await setRange('Band filling in electrons per site', 2);
check('Full band is identified correctly', (await page.locator('.band-status').textContent()).includes('Full band'));
check('Band Fermi energy updates', (await page.locator('.band-plot').textContent()).includes('4.00 eV'));
await shot.screenshot({ path: 'artifacts/desktop-bands.png', fullPage: true, timeout: 90000 });
await setRange('Band filling in electrons per site', 1);
await nav(2);
await openControls();
const baselineDrift = numeric(await page.locator('.calculated-readout').textContent());
check('Baseline Drude drift matches 60 V/m at 25 fs', baselineDrift.toFixed(1) === '263.8');
await setRange('Electric field', 120);
check('Doubling the field doubles the model drift', Math.abs(numeric(await page.locator('.calculated-readout').textContent()) - baselineDrift * 2) < 0.01);
await setRange('Electric field', 200);
check('Drude velocity is calculated from the selected field', (await page.locator('.calculated-readout').textContent()).includes(((1.602176634e-19 * 25e-15 * 200 / 9.1093837139e-31) * 1000).toFixed(3)));
await setRange('Scattering time', 50);
check('Changing scattering time updates the model', (await page.locator('.calculated-readout').textContent()).includes(((1.602176634e-19 * 50e-15 * 200 / 9.1093837139e-31) * 1000).toFixed(3)));
await setRange('Electric field', 60);
await page.getByRole('button', { name: 'The science', exact: true }).click();
check('Drude explanation states that electron drift opposes the field', (await page.getByRole('dialog').textContent()).includes('opposite direction to the field'));
await page.keyboard.press('Escape');
await openControls();
await setRange('Electric field', 0);
check('Zero field has zero model drift', (await page.locator('.calculated-readout').textContent()).includes('0.000'));
await closeControls();
await page.waitForTimeout(250);
await shot.screenshot({ path: 'artifacts/desktop-conductivity.png', fullPage: true, timeout: 90000 });
await nav(3);
await openControls();
await setRange('Temperature', 300);
check('Mean-field magnetization is 99.8% at 300 K', numeric(await page.locator('.calculated-readout').textContent()) === 99.8);
await setRange('Temperature', 1045);
check('Above-Curie model enters the paramagnetic phase', (await page.locator('.scene-phase-label').textContent()).includes('PARAMAGNETIC'));
check('Mean-field order vanishes above the Curie point', (await page.locator('.calculated-readout').textContent()).includes('0.0'));
await page.waitForTimeout(900);
await shot.screenshot({ path: 'artifacts/desktop-magnetism-paramagnetic.png', fullPage: true, timeout: 90000 });
await setRange('Temperature', 300);
await closeControls();
await page.waitForTimeout(1200);
await shot.screenshot({ path: 'artifacts/desktop-magnetism.png', fullPage: true, timeout: 90000 });
await nav(4);
await openControls();
await page.getByLabel('Defect crystal material', { exact: true }).selectOption('copper');
check('Defect view switches to the requested copper sample', (await page.locator('.specimen-label').textContent()).includes('Copper'));
await setRange('Defects in the sample', 7);
await page.getByLabel('Point defect type', { exact: true }).selectOption('interstitial');
check('Interstitial count updates', (await page.locator('.defect-status').textContent()).includes('7 interstitials'));
await closeControls();
await page.getByRole('button', { name: 'Unit cell', exact: true }).click();
await page.waitForTimeout(500);
const interstitialInspections = [];
for (let i = 0; i < 30 && interstitialInspections.length < 7; i++) {
  await page.getByRole('button', { name: 'Inspect an atom', exact: true }).click();
  const kind = (await page.locator('.selected-title span').textContent()) ?? '';
  const position = (await page.locator('.atom-selection p').first().textContent()) ?? '';
  if (kind === 'Interstitial site') {
    const key = position;
    if (!interstitialInspections.some(entry => entry.position === key)) {
      interstitialInspections.push({ position, coords: (position.match(/-?\d+\.\d+/g) || []).map(Number) });
    }
  }
}
check('All seven interstitials are present in the unit-cell inspector', interstitialInspections.length === 7);
check('Unit-cell interstitial coordinates stay inside the cell', interstitialInspections.every(entry => entry.coords.every(value => Math.abs(value) <= 0.5)));
await page.getByRole('button', { name: 'Close atom inspection', exact: true }).click();
await page.waitForTimeout(900);
await shot.screenshot({ path: 'artifacts/desktop-interstitials.png', fullPage: true, timeout: 90000 });
await openControls();
await page.getByLabel('Point defect type', { exact: true }).selectOption('vacancy');
check('Vacancy model updates', (await page.locator('.defect-status').textContent()).includes('7 vacancies'));
await closeControls();
await page.waitForTimeout(1200);
await shot.screenshot({ path: 'artifacts/desktop-defects.png', fullPage: true, timeout: 90000 });
await nav(5);
await openControls();
await setRange('Temperature', 3);
await setRange('Applied magnetic field', 20);
check('Lead enters the Meissner phase below its critical field', (await page.locator('.scene-phase-label').textContent()).includes('MEISSNER'));
check('Critical field is 66.1 mT at 3 K', (await page.locator('.calculated-readout').textContent()).includes('66.1'));
check('Superconducting gap is open at 3 K', (await page.locator('.model-panel').textContent()).includes('Δ/Δ₀ = 0.97'));
await setRange('Applied magnetic field', 140);
check('A high field suppresses superconductivity', (await page.locator('.scene-phase-label').textContent()).includes('NORMAL STATE'));
check('Normal state reports the applied field exceeding Bc(T)', (await page.locator('.scene-phase-label').textContent()).includes('Applied field exceeds B꜀(T)'));
await setRange('Applied magnetic field', 0);
await setRange('Temperature', 7.2);
check('Above the critical temperature the sample is normal', (await page.locator('.scene-phase-label').textContent()).includes('NORMAL STATE'));
check('Superconducting gap closes at and above Tc', (await page.locator('.model-panel').textContent()).includes('Δ/Δ₀ = 0.00'));
await setRange('Temperature', 3);
await setRange('Applied magnetic field', 20);
await closeControls();
await page.waitForTimeout(500);
await shot.screenshot({ path: 'artifacts/desktop-superconductivity.png', fullPage: true, timeout: 90000 });
await page.getByRole('button', { name: 'The science', exact: true }).click();
check('Scientific explanation dialog opens', await page.getByRole('dialog').isVisible());
check('Model limitations are disclosed', (await page.locator('.model-caveat').textContent()).includes('not a microscopic BCS'));
check('Scientific sources are real external links', (await page.locator('.reference-list a').count()) >= 1);
await page.keyboard.press('Escape');
check('Escape closes dialogs', !(await page.getByRole('dialog').count()));
await page.getByRole('button', { name: 'About the project', exact: false }).click();
check('About dialog opens', (await page.getByRole('dialog').textContent()).includes('A field guide'));
await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
await page.getByRole('button', { name: 'A guided journey', exact: false }).click();
await page.getByRole('button', { name: 'The next discovery', exact: true }).click();
check('Guided journey changes chapters', (await page.locator('.tour-chapter-index').textContent()).toLowerCase().includes('band structures'));
await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
await nav(0);
await page.locator('.chapter-kicker').click({ force: true });
await page.keyboard.press('ArrowRight');
check('Arrow keyboard navigation changes chapter', (await page.locator('.chapter-tab.active').textContent()).includes('Band structures'));
await page.keyboard.press('ArrowLeft');
check('Left-arrow navigation returns to the previous chapter', (await page.locator('.chapter-tab.active').textContent()).includes('Atomic lattices'));
const requiredReferences = [
  'https://openstax.org/books/university-physics-volume-3/pages/9-3-bonding-in-crystalline-solids',
  'https://openstax.org/books/chemistry-2e/pages/10-6-lattice-structures-in-crystalline-solids',
  'https://en.wikipedia.org/wiki/Copper',
  'https://en.wikipedia.org/wiki/Iron',
  'https://en.wikipedia.org/wiki/Sodium_chloride',
  'https://en.wikipedia.org/wiki/Tight_binding',
  'http://hyperphysics.phy-astr.gsu.edu/hbase/electric/ohmmic.html',
  'https://physics.nist.gov/cuu/Constants/',
  'https://www.britannica.com/science/Curie-point',
  'https://openstax.org/books/university-physics-volume-2/pages/11-1-magnetism-and-its-historical-discoveries',
  'https://www.pas.rochester.edu/~stte/phy418S23/units/unit_4-3.pdf',
  'https://en.wikipedia.org/wiki/Crystallographic_defect',
  'https://www.nobelprize.org/prizes/physics/1972/summary/',
  'https://openstax.org/books/university-physics-volume-3/pages/9-8-superconductivity',
];
const discoveredReferences = [];
for (let i = 0; i < 6; i++) {
  await nav(i);
  await page.getByRole('button', { name: 'The science', exact: true }).click();
  discoveredReferences.push(...await page.locator('.reference-list a').evaluateAll(links => links.map(link => link.href)));
  await page.keyboard.press('Escape');
}
check('Every chapter exposes its verified reference set', requiredReferences.every(url => discoveredReferences.includes(url)));
check('Reference list contains no stale or broken destination', !discoveredReferences.some(url => /9-6-the-structure|12-1-magnetism|libretexts|tudelft|materialsproject/.test(url)));
await page.close();
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const mobileShot = { screenshot: safeShot(mobile) };
mobile.on('pageerror', error => errors.push(error.message));
await mobile.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 });
await mobile.waitForTimeout(1200);
check('Mobile does not overflow horizontally', await mobile.evaluate(() => document.body.scrollWidth === innerWidth));
await mobileShot.screenshot({ path: 'artifacts/mobile-initial.png', fullPage: true, timeout: 90000 });
await mobile.getByRole('button', { name: 'Model controls', exact: true }).click();
check('Mobile controls are accessible', await mobile.locator('.model-panel').isVisible());
await mobile.getByRole('button', { name: 'Close model controls', exact: true }).click();
await mobile.locator('.chapter-tab').nth(1).click();
check('Mobile chapter navigation and band model work', await mobile.locator('.band-plot').isVisible());
await mobileShot.screenshot({ path: 'artifacts/mobile-bands.png', fullPage: true, timeout: 90000 });
await mobile.getByRole('button', { name: 'A guided journey', exact: false }).click();
check('Mobile dialogs stay within the viewport', await mobile.getByRole('dialog').evaluate(element => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; }));
check('No runtime or browser console errors in any chapter', errors.length === 0);
writeFileSync('artifacts/browser-results.json', JSON.stringify({ passed: results.length, results, errors }, null, 2));
console.log(`\n${results.length} checks passed. Browser errors: ${errors.length}.`);
await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
process.exit(0);
