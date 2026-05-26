import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:5173';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text(), time: Date.now() });
    console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    console.log(`[BROWSER PAGE ERROR] ${err.message}`);
    consoleMessages.push({ type: 'pageerror', text: err.message, time: Date.now() });
  });

  // ===== 1. Navigate =====
  console.log('\n=== STEP 1: Navigating to app ===');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Page title:', await page.title());
  await page.waitForTimeout(2000);

  // ===== 2. Close ChangelogModal ====
  console.log('\n=== STEP 2: Closing ChangelogModal ===');
  // The changelog has a "开 始 探 索" button that closes it
  const changelogBtn = page.locator('button').filter({ hasText: '开 始 探 索' });
  const changelogCount = await changelogBtn.count();
  console.log(`"开 始 探 索" buttons found: ${changelogCount}`);

  if (changelogCount > 0) {
    // Use JS click to bypass overlay issues
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.includes('开 始 探 索')) {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          return true;
        }
      }
      return false;
    });
    console.log('Clicked "开 始 探 索" via JS');
    await page.waitForTimeout(1000);
  } else {
    console.log('Changelog not open (already seen)');
  }

  // Verify changelog is gone
  const bodyTextAfterClose = await page.textContent('body');
  const hasChangelog = bodyTextAfterClose?.includes('首次发布');
  console.log('Changelog still visible:', hasChangelog);

  // ===== 3. Screenshot landing page =====
  console.log('\n=== STEP 3: Screenshot of landing page ===');
  await page.screenshot({ path: 'E:/Games/COC/screenshot-01-landing.png', fullPage: false });
  console.log('Screenshot saved: screenshot-01-landing.png');

  // ===== 4. Click "读取游戏" via JS =====
  console.log('\n=== STEP 4: Clicking "读取游戏" ===');
  const clicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.includes('读') && btn.textContent?.includes('游戏')) {
        // React uses onClick prop, dispatch native click
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return btn.textContent;
      }
    }
    return null;
  });
  console.log('Clicked button:', clicked);
  await page.waitForTimeout(2000);

  // Verify we navigated
  const afterLoadBody = await page.textContent('body');
  const hasTextarea = afterLoadBody?.includes('输入行动或对话');
  console.log('Game view visible (has textarea):', hasTextarea);
  console.log('Body text (first 400 chars):', afterLoadBody?.substring(0, 400));

  // ===== 5. Type "调查书房" in textarea =====
  console.log('\n=== STEP 5: Typing "调查书房" ===');
  const typed = await page.evaluate(() => {
    const ta = document.querySelector('footer textarea') || document.querySelector('textarea');
    if (!ta) return false;

    // React controlled input: set value via property descriptor, then dispatch input
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(ta, '调查书房');
    } else {
      ta.value = '调查书房';
    }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  console.log('Text typed:', typed);

  // ===== 6. Click "推 进" button =====
  console.log('\n=== STEP 6: Clicking "推 进" ===');
  const submitClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent || '';
      if (text.includes('推') && text.includes('进')) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return text;
      }
    }
    return null;
  });
  console.log('Submit button clicked:', submitClicked);

  // ===== 7. Wait 15 seconds =====
  console.log('\n=== STEP 7: Waiting for AI response (15s)... ===');
  const startTime = Date.now();
  for (let i = 1; i <= 15; i++) {
    await page.waitForTimeout(1000);
    if (i % 3 === 0) {
      const btnText = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const t = btn.textContent || '';
          if (t.includes('推') || t === '...') return t;
        }
        return '(not found)';
      });
      const taVal = await page.evaluate(() => {
        const ta = document.querySelector('footer textarea') || document.querySelector('textarea');
        return ta?.value || '(no textarea)';
      });
      console.log(`  ${i}s - button: "${btnText}" | textarea: "${taVal?.substring(0, 20)}"`);
    }
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Total wait: ${elapsed}s`);

  // ===== 8. Console analysis =====
  console.log('\n=== STEP 8: All Console Messages ===');
  for (const msg of consoleMessages) {
    console.log(`  [${msg.type}] ${msg.text}`);
  }

  const errors = consoleMessages.filter((m) => m.type === 'error' || m.type === 'pageerror');
  const warnings = consoleMessages.filter((m) => m.type === 'warning');
  console.log('\n--- ERRORS ---');
  if (errors.length === 0) console.log('  (none)');
  else errors.forEach((e) => console.log(`  [${e.type}] ${e.text}`));
  console.log('--- WARNINGS ---');
  if (warnings.length === 0) console.log('  (none)');
  else warnings.forEach((w) => console.log(`  ${w.text}`));

  // ===== 9. Final screenshot =====
  console.log('\n=== STEP 9: Taking final screenshot ===');
  await page.screenshot({ path: 'E:/Games/COC/screenshot-02-after-response.png', fullPage: false });
  console.log('Screenshot saved: screenshot-02-after-response.png');

  // ===== 10. Page State Summary =====
  console.log('\n=== PAGE STATE SUMMARY ===');
  const state = await page.evaluate(() => {
    // Find status bar
    const statusBar = document.querySelector('main > div:first-child');
    const leftPageH3 = document.querySelector('.lp-scroll')?.parentElement?.querySelector('h3');
    const rightPageH3 = document.querySelector('.rp-scroll')?.parentElement?.querySelector('h3');
    const ta = document.querySelector('footer textarea') || document.querySelector('textarea');
    const errorDiv = document.querySelector('footer > div:first-child');

    // Find error banner
    const allFooterDivs = document.querySelectorAll('footer > div');
    let errorText = '';
    for (const div of allFooterDivs) {
      if (div.style.color === 'rgb(232, 129, 91)' || div.textContent?.includes('AI') || div.textContent?.includes('错误') || div.textContent?.includes('API')) {
        errorText = div.textContent?.trim() || '';
      }
    }

    return {
      statusBar: statusBar?.textContent?.trim() || '(none)',
      leftHeader: leftPageH3?.textContent?.trim() || '(none)',
      rightHeader: rightPageH3?.textContent?.trim() || '(none)',
      rightChoices: Array.from(document.querySelectorAll('.rp-scroll button')).map(b => b.textContent?.trim()).join(' | '),
      textareaValue: ta?.value || '(empty)',
      errorDisplay: errorText || '(none)',
    };
  });

  console.log('Status Bar:', state.statusBar);
  console.log('Left Page Header:', state.leftHeader);
  console.log('Right Page Header:', state.rightHeader);
  console.log('Right Page Choices:', state.rightChoices);
  console.log('Textarea Value:', state.textareaValue);
  console.log('Error Display:', state.errorDisplay);

  await browser.close();
  console.log('\n=== AUTOMATION COMPLETE ===');
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
