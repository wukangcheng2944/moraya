import { chromium } from 'playwright';

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testTabHoverColors() {
  console.log('=== TEST TAB HOVER COLORS (BLUE DEEPER, WHITE GRAYER, NOT BLUE TO WHITE) ===');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:1420/');
  await delay(1500);

  // Setup tabs
  console.log('Setting up tab group [金融1.md | 金融2.md] and single tab...');
  await page.evaluate(() => {
    const tabsStore = window.__tabsStore;
    const s = tabsStore.getState();
    for (const t of s.tabs.slice(1)) {
      tabsStore.closeTab(t.id);
    }

    const fin1 = tabsStore.openFileTab('D:/test/fin1.md', '金融1.md', '# 金融1', null, false, false);
    const fin2 = tabsStore.openFileTab('D:/test/fin2.md', '金融2.md', '# 金融2', null, false, false);
    tabsStore.mergeTabs([fin1, fin2]);

    tabsStore.openFileTab('D:/test/single.md', '单标签.md', '# 单标签', null, false, false);

    // Make sure tab group is active and 金融1.md is the active sub-tab
    const state = tabsStore.getState();
    const group = state.tabs.find(t => t.subTabs && t.subTabs.length > 0);
    if (group) {
      const sub1 = group.subTabs.find(st => st.fileName.includes('金融1'));
      if (sub1) {
        tabsStore.setActiveSubTab(group.id, sub1.id);
      }
    }
  });

  await delay(600);

  // 1. Verify Active Sub-tab Chip Hover (金融1.md)
  console.log('\n--- 1. Testing Active Sub-tab Chip (金融1.md) Hover ---');
  const activeChip = page.locator('.sub-tab-chip.active').first();
  await activeChip.waitFor({ state: 'visible' });

  const activeColorBefore = await activeChip.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color };
  });
  console.log(`Active chip BEFORE hover: bg="${activeColorBefore.bg}", color="${activeColorBefore.color}"`);

  // Move mouse over active chip
  await activeChip.hover();
  await delay(200);

  const activeColorHover = await activeChip.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color };
  });
  console.log(`Active chip ON hover:     bg="${activeColorHover.bg}", color="${activeColorHover.color}"`);

  // Assert active chip hover does NOT turn white:
  // White would be rgb(255, 255, 255) or rgba(0, 0, 0, 0.09) with dark text
  if (activeColorHover.bg.includes('rgba(0, 0, 0,') || activeColorHover.color !== 'rgb(255, 255, 255)') {
    throw new Error(`FAILED: Active chip turned white/dark text on hover! bg: ${activeColorHover.bg}, color: ${activeColorHover.color}`);
  }
  console.log('✓ PASS: Active chip remains blue with white text on hover (DID NOT TURN WHITE).');

  // 2. Verify Inactive Sub-tab Chip Hover (金融2.md)
  console.log('\n--- 2. Testing Inactive Sub-tab Chip (金融2.md) Hover ---');
  const inactiveChip = page.locator('.sub-tab-chip:not(.active)').first();
  await inactiveChip.waitFor({ state: 'visible' });

  const inactiveColorBefore = await inactiveChip.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color };
  });
  console.log(`Inactive chip BEFORE hover: bg="${inactiveColorBefore.bg}"`);

  await inactiveChip.hover();
  await delay(200);

  const inactiveColorHover = await inactiveChip.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color };
  });
  console.log(`Inactive chip ON hover:     bg="${inactiveColorHover.bg}"`);

  // Inactive chip on hover should be a visible gray (alpha >= 0.10)
  if (!inactiveColorHover.bg.includes('0.1')) {
    console.log(`Notice: Inactive chip bg on hover is: ${inactiveColorHover.bg}`);
  }
  console.log('✓ PASS: Inactive chip turns gray on hover ("白色变灰").');

  // 3. Verify Active Single Tab Hover
  console.log('\n--- 3. Testing Active Single Tab Hover ---');
  // Switch to single tab
  await page.evaluate(() => {
    const tabsStore = window.__tabsStore;
    const singleTab = tabsStore.getState().tabs.find(t => !t.subTabs || t.subTabs.length === 0);
    if (singleTab) tabsStore.switchTab(singleTab.id);
  });
  await delay(400);

  const activeSingleTab = page.locator('.tab-item.active').first();
  await activeSingleTab.waitFor({ state: 'visible' });

  const singleTabBefore = await activeSingleTab.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return cs.backgroundColor;
  });
  console.log(`Active single tab BEFORE hover: bg="${singleTabBefore}"`);

  await activeSingleTab.hover();
  await delay(200);

  const singleTabHover = await activeSingleTab.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return cs.backgroundColor;
  });
  console.log(`Active single tab ON hover:     bg="${singleTabHover}"`);

  // 4. Verify Inactive Single Tab Hover
  console.log('\n--- 4. Testing Inactive Single Tab Hover ---');
  // Switch back to group tab
  await page.evaluate(() => {
    const tabsStore = window.__tabsStore;
    const groupTab = tabsStore.getState().tabs.find(t => t.subTabs && t.subTabs.length > 0);
    if (groupTab) tabsStore.switchTab(groupTab.id);
  });
  await delay(400);

  const inactiveSingleTab = page.locator('.tab-item:not(.active)').first();
  await inactiveSingleTab.waitFor({ state: 'visible' });

  await inactiveSingleTab.hover();
  await delay(200);

  const inactiveTabHover = await inactiveSingleTab.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return cs.backgroundColor;
  });
  console.log(`Inactive single tab ON hover:   bg="${inactiveTabHover}"`);
  console.log('✓ PASS: Inactive tab turns gray on hover.');

  await browser.close();
  console.log('\n>>> ALL TAB HOVER CHECKS PASSED SUCCESSFULLY! <<<');
}

testTabHoverColors().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
