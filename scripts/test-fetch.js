const { chromium } = require('playwright');

async function test() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('Navigating to page...');
    await page.goto('https://groww.in/mutual-funds/hdfc-mid-cap-fund-direct-growth', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    
    console.log('Page loaded, waiting for content...');
    await page.waitForTimeout(3000);
    
    const title = await page.title();
    console.log('Page title:', title);
    
    const html = await page.content();
    console.log('HTML length:', html.length);
    console.log('First 500 chars:', html.substring(0, 500));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
