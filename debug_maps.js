const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1400, height: 900 });

    const query = 'Sghr cafe 九十九里浜';
    console.log(`Searching for: ${query}`);
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=ja`, { waitUntil: 'domcontentloaded' });

    // Wait for maps to load
    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: 'debug_sghr_maps_1_initial.png' });

    console.log("Looking for first map result link to click...");
    const firstResult = await page.$('a[href*="/maps/place/"]');
    if (firstResult) {
        console.log("Clicking the first result...");
        await firstResult.click();
        await new Promise(r => setTimeout(r, 4000)); // Wait for panel to slide open
        await page.screenshot({ path: 'debug_sghr_maps_2_clicked.png' });

        // Let's also grab the inner text of the panel to see what it sees
        const text = await page.evaluate(() => {
            const el = document.querySelector('.m6QErb.W7RFne'); // General container for place info
            return el ? el.innerText.substring(0, 500) : "Could not find main panel container";
        });
        console.log("Panel Text Sample:\n", text);
    } else {
        console.log("No list items found, maybe it opened the place directly.");
    }

    await browser.close();
    console.log('Debug complete.');
})();
