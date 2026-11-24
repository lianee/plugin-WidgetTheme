// Headless render test against a live Matomo with the plugin active.
// Usage: MATOMO_URL=https://matomo.example.com MATOMO_TOKEN=<view token> MATOMO_IDSITE=1 \
//        PLAYWRIGHT=/path/to/node_modules/playwright node tests/render.test.cjs
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const base = process.env.MATOMO_URL;
const token = process.env.MATOMO_TOKEN;
const idSite = process.env.MATOMO_IDSITE || '1';
if (!base || !token) {
  console.error('MATOMO_URL and MATOMO_TOKEN are required');
  process.exit(2);
}

const widget = `${base.replace(/\/$/, '')}/index.php?forceView=1&viewDataTable=graphEvolution&module=Widgetize&action=iframe`
  + `&disableLink=1&widget=1&moduleToWidgetize=VisitsSummary&actionToWidgetize=getEvolutionGraph`
  + `&idSite=${idSite}&period=day&date=today&token_auth=${encodeURIComponent(token)}`;

const DARK = 'rgb(32, 35, 41)';
const LIGHT = 'rgb(255, 255, 255)';
const MARK = 'zqx7'; // marker inside hostile values: must never reach the page

// [label, extra query, colour scheme, expected mode, expected background, expected warning]
const cases = [
  ['no param, dark browser', '', 'dark', 'auto', DARK, null],
  ['no param, light browser', '', 'light', 'auto', LIGHT, null],
  ['6 digits', '&bgColor=1d1d1d', 'dark', 'auto', 'rgb(29, 29, 29)', null],
  ['3 digits', '&bgColor=abc', 'light', 'auto', 'rgb(170, 187, 204)', null],
  ['encoded #', '&bgColor=%231d1d1d', 'dark', 'auto', 'rgb(29, 29, 29)', null],
  ['uppercase', '&bgColor=ABCDEF', 'dark', 'auto', 'rgb(171, 205, 239)', null],
  ['with themeMode=light', '&themeMode=light&bgColor=fafafa', 'dark', 'light', 'rgb(250, 250, 250)', null],
  ['themeMode=dark', '&themeMode=dark', 'light', 'dark', DARK, null],
  ['themeMode invalid', `&themeMode=${MARK}`, 'dark', 'auto', DARK, 'invalid themeMode'],
  ['empty', '&bgColor=', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['colour name', '&bgColor=red', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['5 digits', '&bgColor=12345', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['7 digits', '&bgColor=1234567', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['8 digits (alpha)', '&bgColor=1d1d1d80', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['non hex', '&bgColor=gg0000', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['double #', '&bgColor=%23%23abc', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['rgb()', '&bgColor=rgb(1,2,3)', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['trailing newline', '&bgColor=1d1d1d%0a', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['trailing NUL', '&bgColor=1d1d1d%00', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['leading space', '&bgColor=%201d1d1d', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['JS breakout', `&bgColor=1d1d1d%27);alert(%27${MARK}`, 'dark', 'auto', DARK, 'invalid bgColor'],
  ['script close', `&bgColor=%3C/script%3E%3Cb%3E${MARK}`, 'dark', 'auto', DARK, 'invalid bgColor'],
  ['CSS breakout', `&bgColor=1d1d1d;background:url(${MARK})`, 'dark', 'auto', DARK, 'invalid bgColor'],
  ['array', '&bgColor[]=1d1d1d', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['duplicate, last invalid', '&bgColor=1d1d1d&bgColor=red', 'dark', 'auto', DARK, 'invalid bgColor'],
  ['duplicate, last valid', '&bgColor=red&bgColor=1d1d1d', 'dark', 'auto', 'rgb(29, 29, 29)', null],
];

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const [label, extra, scheme, mode, bg, warning] of cases) {
    const page = await browser.newPage({ colorScheme: scheme });
    const warnings = [];
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'warning' && m.text().startsWith('WidgetTheme')) warnings.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
    const resp = await page.goto(widget + extra);
    await page.waitForSelector('div.widget');
    const html = await resp.text();
    const got = await page.evaluate(() => {
      const bgOf = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).backgroundColor : null; };
      return {
        mode: document.documentElement.getAttribute('data-theme-mode'),
        body: bgOf('body'),
        widget: bgOf('div.widget'),
        button: bgOf('button.mtm-selector__trigger'),
      };
    });
    const problems = [];
    if (resp.status() !== 200) problems.push(`HTTP ${resp.status()}`);
    if (got.mode !== mode) problems.push(`mode ${got.mode}`);
    for (const k of ['body', 'widget', 'button']) if (got[k] !== null && got[k] !== bg) problems.push(`${k} ${got[k]}`);
    if (got.widget === null) problems.push('no widget');
    if (warning && !warnings.some((w) => w.includes(warning))) problems.push('missing warning');
    if (!warning && warnings.length) problems.push('unexpected warning: ' + warnings.join(' | '));
    // Matomo itself echoes every query parameter, HTML-escaped, elsewhere in the
    // page: only the plugin's own <script> (the one setting data-theme-mode) is checked.
    const pluginScript = (html.match(/<script[^>]*>(?:(?!<\/script>)[\s\S])*data-theme-mode[\s\S]*?<\/script>/) || [''])[0];
    if (!pluginScript) problems.push('plugin script not found');
    if (pluginScript.includes(MARK)) problems.push('hostile value echoed in plugin script');
    if (errors.length) problems.push('errors: ' + errors.join(' | '));
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${label}${problems.length ? ': ' + problems.join(', ') : ''}`);
    if (problems.length) failed++;
    await page.close();
  }
  await browser.close();
  console.log(`${cases.length - failed}/${cases.length} passed`);
  process.exit(failed ? 1 : 0);
})();
