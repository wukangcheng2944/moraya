import { chromium } from 'playwright';

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testRapidClicks() {
  console.log('--- TEST RAPID SUB-TAB CLICKS ---');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:1420/');
  await delay(1500);

  // Set up 3 tabs and merge them

  // Let's create tabs via UI or evaluate
  const result = await page.evaluate(() => {
    const tabsStore = window.__tabsStore;
    tabsStore.openFileTab('D:/test/geo1.md', '地缘1.md', '# 地缘1 内容', null, false, false);
    tabsStore.openFileTab('D:/test/fin1.md', '金融1.md', '# 金融1 内容', null, false, false);
    tabsStore.openFileTab('D:/test/geo2.md', '地缘2.md', '# 地缘2 内容', null, false, false);

    const s1 = tabsStore.getState();
    const tabIds = s1.tabs.slice(-3).map(t => t.id);
    tabsStore.mergeTabs(tabIds);
    return { ok: true };
  });

  await delay(500);

  const chips = page.locator('.sub-tab-chip');
  const count = await chips.count();
  console.log(`Found ${count} sub-tab chips`);

  // Rapidly click chip 0, then chip 1, then chip 2 with minimal delay (e.g. 50ms)
  // Let's simulate human mouse clicks: pointerdown, slight micro-movement (3-4px), pointerup, click
  console.log('Testing rapid clicks between chips...');

  // Test Click Chip 1
  const chip1 = chips.nth(1);
  const box1 = await chip1.boundingBox();
  if (box1) {
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
    await page.mouse.down();
    // Simulate slight 3px jitter during rapid click
    await page.mouse.move(box1.x + box1.width / 2 + 4, box1.y + box1.height / 2);
    await page.mouse.up();
  }
  await delay(50);

  let activeText1 = await page.locator('.sub-tab-chip.active .sub-tab-name').textContent();
  console.log('After rapid click on Chip 1 (with 4px jitter), active chip is:', activeText1?.trim());

  // Rapid Click Chip 2 immediately
  const chip2 = chips.nth(2);
  const box2 = await chip2.boundingBox();
  if (box2) {
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.mouse.down();
    await page.mouse.move(box2.x + box2.width / 2 + 4, box2.y + box2.height / 2);
    await page.mouse.up();
  }
  await delay(50);

  let activeText2 = await page.locator('.sub-tab-chip.active .sub-tab-name').textContent();
  console.log('After rapid click on Chip 2 (with 4px jitter), active chip is:', activeText2?.trim());

  // Rapid Click Chip 0 immediately
  const chip0 = chips.nth(0);
  const box0 = await chip0.boundingBox();
  if (box0) {
    await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
    await page.mouse.down();
    await page.mouse.move(box0.x + box0.width / 2 + 4, box0.y + box0.height / 2);
    await page.mouse.up();
  }
  await delay(50);

  let activeText0 = await page.locator('.sub-tab-chip.active .sub-tab-name').textContent();
  console.log('After rapid click on Chip 0 (with 4px jitter), active chip is:', activeText0?.trim());

  await browser.close();

  const success = (activeText1?.includes('金融1') && activeText2?.includes('地缘2') && activeText0?.includes('地缘1'));
  console.log('Test Result:', success ? 'PASSED' : 'FAILED');
  process.exit(success ? 0 : 1);
}

testRapidClicks().catch(err => {
  console.error(err);
  process.exit(1);
});
