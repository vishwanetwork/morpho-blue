const puppeteer = require('puppeteer');

(async () => {
  let browser;
  try {
    console.log('🚀 Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Collect console logs
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push({ type: msg.type(), text });
      console.log(`[${msg.type().toUpperCase()}]`, text);
    });
    
    // Collect errors
    const errors = [];
    page.on('pageerror', error => {
      errors.push(error.message);
      console.error('❌ PAGE ERROR:', error.message);
    });
    
    console.log('📡 Navigating to http://localhost:5178...');
    await page.goto('http://localhost:5178', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait a bit for React to render
    console.log('⏳ Waiting for page to load...');
    await page.waitForTimeout(3000);
    
    // Take screenshot
    console.log('📸 Taking screenshot...');
    await page.screenshot({ path: 'page-screenshot.png', fullPage: true });
    
    // Check for specific elements
    console.log('\n🔍 Checking page elements...');
    
    const hasTitle = await page.$('h1');
    console.log('✓ Title found:', !!hasTitle);
    
    const markets = await page.$$('[data-testid="market-card"], .market-card, [class*="market"]');
    console.log('✓ Market elements found:', markets.length);
    
    const loading = await page.$('[class*="loading"], [class*="spinner"], [role="status"]');
    console.log('✓ Loading spinner:', !!loading);
    
    const errorElements = await page.$$('[class*="error"], [role="alert"]');
    console.log('✓ Error messages:', errorElements.length);
    
    // Get page text content
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('\n📄 Page text preview (first 500 chars):');
    console.log(bodyText.substring(0, 500));
    
    // Check for specific market names
    const hasUSDC = bodyText.includes('USDC');
    const hasWETH = bodyText.includes('WETH');
    const hasWBTC = bodyText.includes('WBTC');
    
    console.log('\n🎯 Market detection:');
    console.log('  - USDC mentioned:', hasUSDC);
    console.log('  - WETH mentioned:', hasWETH);
    console.log('  - WBTC mentioned:', hasWBTC);
    
    // Check localStorage
    const localStorageData = await page.evaluate(() => {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) data[key] = localStorage.getItem(key);
      }
      return data;
    });
    
    console.log('\n💾 LocalStorage keys:', Object.keys(localStorageData));
    
    // Filter for Pharos/Loading related logs
    console.log('\n🔎 Pharos/Loading related console logs:');
    const relevantLogs = consoleLogs.filter(log => 
      log.text.toLowerCase().includes('pharos') || 
      log.text.toLowerCase().includes('loading') ||
      log.text.toLowerCase().includes('error') ||
      log.text.toLowerCase().includes('market')
    );
    
    if (relevantLogs.length > 0) {
      relevantLogs.forEach(log => {
        console.log(`  [${log.type}]`, log.text);
      });
    } else {
      console.log('  (No relevant logs found)');
    }
    
    console.log('\n✅ Test completed. Screenshot saved to page-screenshot.png');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
