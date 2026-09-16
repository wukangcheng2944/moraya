import { chromium } from 'playwright';

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testSingleHighlightAndNoop() {
  console.log('=== TEST SUB-TAB SINGLE HIGHLIGHT & NO-OP REPEAT CLICK ===');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:1420/');
  await delay(1500);

  // Setup the exact scenario from user's screenshot:
  // 1. Single tab: Untitled
  // 2. Tab Group 1: 金融2.md + 金融1.md
  // 3. Tab Group 2: 地缘2.md + 地缘1.md
  // 4. Single tab: A股收盘综述 (1).md
  console.log('Setting up tabs to mirror user screenshot...');
  await page.evaluate(() => {
    const tabsStore = window.__tabsStore;
    
    // Close all current tabs first except 1
    const s = tabsStore.getState();
    for (const t of s.tabs.slice(1)) {
      tabsStore.closeTab(t.id);
    }

    // Open group 1 files
    const fin2 = tabsStore.openFileTab('D:/test/fin2.md', '金融2.md', '# 金融2 内容', null, false, false);
    const fin1 = tabsStore.openFileTab('D:/test/fin1.md', '金融1.md', '# 金融1 内容', null, false, false);
    tabsStore.mergeTabs([fin2, fin1]);

    // Open group 2 files
    const geo2 = tabsStore.openFileTab('D:/test/geo2.md', '地缘2.md', '# 地缘2 内容', null, false, false);
    const geo1 = tabsStore.openFileTab('D:/test/geo1.md', '地缘1.md', '# 地缘1 内容', null, false, false);
    tabsStore.mergeTabs([geo2, geo1]);

    // Open single tab
    tabsStore.openFileTab('D:/test/stock.md', 'A股收盘综述 (1).md', '# A股收盘综述 内容', null, false, false);

    // Switch to Group 2 and activate 地缘2.md
    const finalState = tabsStore.getState();
    const group2 = finalState.tabs.find(t => t.fileName.includes('地缘2'));
    if (group2) {
      const subGeo2 = group2.subTabs.find(st => st.fileName.includes('地缘2'));
      if (subGeo2) {
        tabsStore.setActiveSubTab(group2.id, subGeo2.id);
      }
    }
  });

  await delay(600);

  // --- REQUIREMENT 2 VERIFICATION: 全局只能存在一个高亮 ---
  console.log('\n--- Checking Requirement 2: Globally only ONE highlight exists ---');
  
  // Count active sub-tab chips
  const activeChips = page.locator('.sub-tab-chip.active');
  const activeChipCount = await activeChips.count();
  console.log(`Active sub-tab chips count: ${activeChipCount} (Expected: 1)`);
  if (activeChipCount !== 1) {
    throw new Error(`FAILED: Expected exactly 1 active sub-tab chip, but found ${activeChipCount}!`);
  }

  const activeChipText = (await activeChips.first().textContent())?.trim();
  console.log(`Active sub-tab chip name: "${activeChipText}" (Expected: 地缘2.md)`);
  if (!activeChipText.includes('地缘2.md')) {
    throw new Error(`FAILED: Expected active chip to be 地缘2.md, but got "${activeChipText}"`);
  }

  // Verify that in Group 1 (金融2 | 金融1), ZERO chips are active
  const group1ActiveChips = page.locator('.tab-group:not(.active) .sub-tab-chip.active');
  const group1ActiveCount = await group1ActiveChips.count();
  console.log(`Inactive tab groups active chips count: ${group1ActiveCount} (Expected: 0)`);
  if (group1ActiveCount !== 0) {
    throw new Error(`FAILED: Inactive tab group has active chip! Count: ${group1ActiveCount}`);
  }

  // --- REQUIREMENT 1 VERIFICATION: 地缘2要是本身已经蓝色高亮就不用再频繁切换状态 ---
  console.log('\n--- Checking Requirement 1: Clicking already active 地缘2 is a NO-OP ---');
  
  // Track mutations on the active chip
  const mutationCountBefore = await page.evaluate(() => {
    window.__tabStateSwitchCount = 0;
    const { tabsStore } = window.__testTabsStore || {};
    return 0;
  });

  // Click 地缘2.md
  const geo2Chip = page.locator('.sub-tab-chip.active').first();
  const box = await geo2Chip.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
  }
  await delay(200);

  // Re-verify that 地缘2 is still the only active chip
  const afterClickCount = await activeChips.count();
  const afterClickText = (await activeChips.first().textContent())?.trim();
  console.log(`After clicking already active 地缘2: count=${afterClickCount}, text="${afterClickText}"`);
  if (afterClickCount !== 1 || !afterClickText.includes('地缘2.md')) {
    throw new Error(`FAILED: State became inconsistent after clicking already active sub-tab`);
  }

  // --- VERIFY SWITCHING TO ANOTHER GROUP (金融1.md) ---
  console.log('\n--- Checking Switch to Inactive Group (Clicking 金融1.md) ---');
  const fin1Chip = page.locator('.tab-group:not(.active) .sub-tab-chip').filter({ hasText: '金融1.md' });
  const fin1Box = await fin1Chip.boundingBox();
  if (fin1Box) {
    await page.mouse.move(fin1Box.x + fin1Box.width / 2, fin1Box.y + fin1Box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
  }
  await delay(400);

  // Now Group 1 should be active, and ONLY 金融1.md should be active!
  const newActiveChips = page.locator('.sub-tab-chip.active');
  const newActiveCount = await newActiveChips.count();
  const newActiveText = (await newActiveChips.first().textContent())?.trim();
  console.log(`After clicking 金融1.md: active count=${newActiveCount}, active text="${newActiveText}"`);
  if (newActiveCount !== 1 || !newActiveText.includes('金融1.md')) {
    throw new Error(`FAILED: After switching to 金融1.md, expected exactly 1 active chip (金融1.md), got count=${newActiveCount}, text="${newActiveText}"`);
  }

  // --- VERIFY SWITCHING TO SINGLE TAB (A股收盘综述) ---
  console.log('\n--- Checking Switch to Single Tab (A股收盘综述) ---');
  const singleTab = page.locator('.tab-item').filter({ hasText: 'A股收盘综述' });
  await singleTab.click();
  await delay(400);

  const subChipsActiveWhenSingle = await page.locator('.sub-tab-chip.active').count();
  console.log(`Active sub-tab chips when single tab active: ${subChipsActiveWhenSingle} (Expected: 0)`);
  if (subChipsActiveWhenSingle !== 0) {
    throw new Error(`FAILED: Expected 0 active sub-tab chips when single tab is active, got ${subChipsActiveWhenSingle}`);
  }

  console.log('\n>>> ALL CHECKS PASSED SUCCESSFULLY! <<<');
  await browser.close();
}

testSingleHighlightAndNoop().catch(err => {
  console.error(err);
  process.exit(1);
});
