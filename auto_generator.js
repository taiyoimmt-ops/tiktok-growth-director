const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');
const { execSync } = require('child_process');

async function downloadGoogleImage(page, query, outputPath) {
    console.log(`  🔍 検索中: ${query}`);
    await page.goto(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`);

    try {
        await page.waitForSelector('.rg_i', { timeout: 5000 });
        await page.click('.rg_i'); // 最初の画像をクリックして拡大

        // 高画質版の読み込みを少し待つ
        await new Promise(resolve => setTimeout(resolve, 2000));

        const imgSrc = await page.evaluate(() => {
            // 右側のプレビューパネル内の大きめの画像を取得
            const imgs = Array.from(document.querySelectorAll('img[src^="http"]:not(.rg_i)'));
            const bigImg = imgs.find(img => img.width > 200 || img.height > 200);
            return bigImg ? bigImg.src : null;
        });

        if (imgSrc) {
            console.log(`  📸 高画質画像取得: ${imgSrc.substring(0, 50)}...`);
            const viewSource = await page.goto(imgSrc);
            fs.writeFileSync(outputPath, await viewSource.buffer());
            return;
        }
    } catch (e) {
        console.log(`  ⚠️ 高画質画像の取得失敗、サムネイルを使用します: ${e.message}`);
    }

    // フォールバック: サムネイル画像
    try {
        const fallbackSrc = await page.evaluate(() => {
            const img = document.querySelector('.rg_i');
            return img ? img.src : null;
        });

        if (fallbackSrc && fallbackSrc.startsWith('data:image')) {
            const base64Data = fallbackSrc.replace(/^data:image\/[^;]+;base64,/, "");
            fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
        } else if (fallbackSrc) {
            const viewSource = await page.goto(fallbackSrc);
            fs.writeFileSync(outputPath, await viewSource.buffer());
        } else {
            // 最悪の場合のダミーファイル
            fs.writeFileSync(outputPath, "");
        }
    } catch (e) {
        console.log('  ❌ 画像取得失敗');
    }
}

async function start() {
    console.log('🚀 TikTok スライド全自動生成バッチを開始します...');
    const batchData = JSON.parse(fs.readFileSync('batch_areas.json', 'utf8'));
    let baseHtml = fs.readFileSync('slide_generator.html', 'utf8');

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1000 });

    for (const area of batchData.areas) {
        console.log(`\n========================================`);
        console.log(`🎯 エリア処理開始: ${area.area}`);
        console.log(`========================================`);

        const folder = path.join(__dirname, 'content_library', area.folder);
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        if (!fs.existsSync(path.join(folder, 'images'))) fs.mkdirSync(path.join(folder, 'images'), { recursive: true });

        // 1. ランドマーク写真の取得
        const landmarkPhoto = `images/photo_landmark.png`;
        const landmarkPath = path.join(folder, landmarkPhoto);
        if (!fs.existsSync(landmarkPath) || fs.statSync(landmarkPath).size === 0) {
            await downloadGoogleImage(page, `${area.landmark_search} 景色 高画質`, landmarkPath);
        }

        // 2. 店舗写真の取得とSPOTS配列の構築
        const newSpots = [];
        let idx = 1;
        for (const spot of area.spots) {
            const spotPhoto = `images/photo_spot${idx}.png`;
            const spotPath = path.join(folder, spotPhoto);
            if (!fs.existsSync(spotPath) || fs.statSync(spotPath).size === 0) {
                const querySuffix = spot.category.includes('カフェ') || spot.category.includes('スイーツ') ? 'メニュー' : '料理';
                await downloadGoogleImage(page, `${spot.search} ${querySuffix} 映え`, spotPath);
            }

            // 店舗名が長い場合は適度に改行を入れる
            let displayName = spot.name;
            if (displayName.length > 8 && !displayName.includes(' ')) {
                const mid = Math.floor(displayName.length / 2);
                displayName = displayName.substring(0, mid) + '\\n' + displayName.substring(mid);
            } else {
                displayName = displayName.replace(' ', '\\n');
            }

            newSpots.push({
                name: displayName,
                shortName: spot.name,
                addr: '非公開', // 実際の住所は省略
                price: spot.price,
                rating: String(spot.rating),
                reviews: String(spot.reviews),
                category: spot.category,
                merits: spot.merits,
                demerit: spot.demerit,
                secret: spot.secret,
                foodBg: `content_library/${area.folder}/${spotPhoto}`,
                cardBg: ''
            });
            idx++;
        }

        // 3. HTMLの生成（テンプレート置換）
        console.log(`📝 ${area.area} 用のHTMLスライドを生成中...`);
        let areaHtml = baseHtml;
        const newSpotsStr = JSON.stringify(newSpots, null, 2).replace(/\\\\n/g, '\\n');

        areaHtml = areaHtml.replace(/const SPOTS = \[[\s\S]*?\];/, `const SPOTS = ${newSpotsStr};`);
        areaHtml = areaHtml.replace(/<div class="cover-sub">📍 鎌倉エリア<\/div>/g, `<div class="cover-sub">📍 ${area.area}エリア</div>`);
        areaHtml = areaHtml.replace(/<div class="cover-title-main">デートにおすすめ<br>鎌倉の穴場<span style="color:#25f4ee;">6選<\/span><\/div>/g, `<div class="cover-title-main">デートにおすすめ<br>${area.area}の穴場<span style="color:#25f4ee;">${area.spots.length}選</span></div>`);
        areaHtml = areaHtml.replace(/<div class="cover-tag">☕ カフェ ＆ 🍝 イタリアン<\/div>/g, `<div class="cover-tag">✨ ${area.category_focus}</div>`);
        areaHtml = areaHtml.replace(/鎌倉 穴場6選 - 新テンプレート/g, `${area.area} 穴場${area.spots.length}選`);
        areaHtml = areaHtml.replace(/collected_data\/store_images\/photo_landmark\.png/g, `content_library/${area.folder}/${landmarkPhoto}`);

        const tempHtmlPath = path.join(__dirname, `temp_${area.id}.html`);
        fs.writeFileSync(tempHtmlPath, areaHtml);

        // 4. スライドのキャプチャ（Puppeteerでスクリーンショット）
        console.log(`📷 スライドをキャプチャ中...`);
        await page.goto(`file:///${tempHtmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

        for (let i = 0; i < 9; i++) {
            await page.evaluate((idx) => showSlide(idx), i);
            await new Promise(r => setTimeout(r, 600)); // スライドアニメーション待ち

            const slideElement = await page.$('#slideContainer');
            const slideName = `slide_0${i + 1}.png`;
            await slideElement.screenshot({ path: path.join(folder, slideName) });
            process.stdout.write(` ${i + 1} `);
        }
        console.log(`\n✅ キャプチャ完了！`);

        fs.unlinkSync(tempHtmlPath); // 一時ファイル削除

        // 5. ZIP作成と所定フォルダ配置
        try {
            console.log(`📦 ZIPファイルを作成中...`);
            const zipPath = path.join(__dirname, 'content_library', `${area.folder}.zip`);
            const readyToPostDir = path.join(__dirname, 'ready_to_post_zips');
            if (!fs.existsSync(readyToPostDir)) fs.mkdirSync(readyToPostDir, { recursive: true });
            const targetPath = path.join(readyToPostDir, `${area.area}_TikTok投稿セット.zip`);
            execSync(`powershell Compress-Archive -Path "${folder}\\*" -DestinationPath "${zipPath}" -Force`);
            execSync(`powershell Copy-Item "${zipPath}" "${targetPath}" -Force`);
            console.log(`🎉 getmoney/ready_to_post_zips に ${area.area}_TikTok投稿セット.zip を出力しました！`);
        } catch (e) {
            console.error("ZIP作成エラー:", e.message);
        }
    }

    await browser.close();
    console.log('\n🌟 全てのエリア処理が完了しました！おやすみなさい！🌙');
}

start().catch(e => {
    console.error("エラーが発生しました:", e);
    process.exit(1);
});
