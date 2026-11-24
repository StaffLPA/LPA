const { chromium } = require('playwright');
const path = require('path');
const [dir, outdir] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 2100, height: 900 }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(dir, 'banners.html'));
  await p.waitForSelector('body[data-ready="1"]');
  await p.waitForTimeout(300);
  for (const id of ['classic', 'night', 'seafoam', 'texas-orange', 'white-seafoam']) {
    await p.locator('#' + id).screenshot({ path: path.join(outdir, `jr-outlaws-email-banner-${id}.png`) });
  }
  const fam = await p.evaluate(() => document.fonts.check('700 40px "House of Cards"'));
  console.log('font loaded', fam);
  await b.close();
})();
