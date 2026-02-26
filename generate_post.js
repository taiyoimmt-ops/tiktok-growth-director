const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// ==========================================
// TikTok Growth Director - 汎用自動生成ツール (Rollback to Initial Best Quality)
// 実行方法: node generate_post.js [エリアID]
// ==========================================

const ARGS = process.argv.slice(2);
const targetAreaId = ARGS[0];

if (!targetAreaId) {
    console.error("❌ エリアIDが指定されていません。（例: node generate_post.js 002）");
    process.exit(1);
}

const batchDataRaw = fs.readFileSync('batch_areas.json', 'utf8');
const batchData = JSON.parse(batchDataRaw);
const areaData = batchData.areas.find(a => a.id === targetAreaId);

if (!areaData) {
    console.error(`❌ エリアID「${targetAreaId}」が見つかりません。`);
    process.exit(1);
}

// ------------------------------------------

async function downloadGoogleImage(page, query, outputPath) {
    console.log(`  🔍 検索中: ${query}`);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}&hl=ja`, { waitUntil: 'domcontentloaded' });

    try {
        await page.waitForSelector('img', { timeout: 5000 });

        // 最初の有効なサムネイルをクリックする（img自体ではなく親のリンク要素をクリックしないとパネルが開かない）
        await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            for (let img of imgs) {
                if (img.width > 100 && img.height > 100) {
                    if (img.parentElement) img.parentElement.click();
                    else img.click();
                    break;
                }
            }
        });

        // パネルが開いて高画質オリジナル画像の読み込みが終わるの待機
        await new Promise(resolve => setTimeout(resolve, 3000));

        const imageSrc = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'));

            let bestImgStr = null;
            let maxWidth = 0;

            // サムネイル（gstatic.com）ではない、本来のURLを持つ大きな画像を探す
            for (let img of images) {
                if (img.src && typeof img.src === 'string') {
                    if (img.src.startsWith('http') && !img.src.includes('encrypted-tbn0.gstatic.com') && !img.src.includes('favicon')) {
                        const w = img.naturalWidth || img.width;
                        if (w > 200 && w > maxWidth) {
                            maxWidth = w;
                            bestImgStr = img.src;
                        }
                    }
                }
            }

            // 本物が見つからない場合のフォールバック（大きめのBase64やサムネイル）
            if (!bestImgStr) {
                for (let img of images) {
                    if (img.src && typeof img.src === 'string') {
                        if (img.src.startsWith('data:image/jpeg') && img.src.length > 10000) return img.src;
                        if (img.src.startsWith('http') && img.width > 150) return img.src;
                    }
                }
            }
            return bestImgStr;
        });

        if (imageSrc) {
            if (imageSrc.startsWith('data:image')) {
                const base64Data = imageSrc.replace(/^data:image\/[^;]+;base64,/, "");
                fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
                console.log('  ✅ Base64画像を取得しました');
            } else {
                const source = await page.goto(imageSrc, { waitUntil: 'networkidle2', timeout: 5000 });
                fs.writeFileSync(outputPath, await source.buffer());
                console.log('  ✅ URLから画像を取得しました');
            }
        } else {
            throw new Error("有効な画像が見つかりませんでした");
        }
    } catch (e) {
        console.log(`  ⚠️ 画像取得失敗: ${e.message}。ダミー背景を適用します。`);
        // エラー時は赤系のダミー画像（0バイトを避けるためBase64ダミー）を配置
        const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
        fs.writeFileSync(outputPath, Buffer.from(dummyBase64, 'base64'));
    }
}

async function run() {
    console.log(`\n🚀 【${areaData.area}】エリアの自動生成を開始します... (Rollback V1)`);
    const libraryDir = path.join(__dirname, 'content_library', areaData.folder);
    const imgDir = path.join(libraryDir, 'images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1000 });

    // 1. 画像収集（初期の鎌倉と同じロジックを踏襲。ただしクエリは少しだけ良質にする）
    console.log(`\n[ステップ1] 画像収集`);
    await downloadGoogleImage(page, `${areaData.landmark_search} 景色 高画質`, path.join(imgDir, 'photo_landmark.png'));

    let idx = 1;
    const spotsForHtml = [];
    for (const spot of areaData.spots) {
        const photoPath = path.join(imgDir, `photo_spot${idx}.png`);
        const querySuffix = spot.category.includes('カフェ') || spot.category.includes('スイーツ') ? 'メニュー' : '料理';
        await downloadGoogleImage(page, `${spot.search} ${querySuffix} 映え`, photoPath);

        spotsForHtml.push({
            name: spot.name,
            shortName: spot.name,
            addr: '非公開',
            price: spot.price,
            rating: spot.rating,
            reviews: spot.reviews,
            category: spot.category,
            merits: Array.isArray(spot.merits) ? spot.merits : [spot.merits],
            demerit: spot.demerit || '',
            secret: spot.secret || '',
            foodBg: `content_library/${areaData.folder}/images/photo_spot${idx}.png`,
            cardBg: ''
        });
        idx++;
    }

    // 2. HTML生成
    console.log(`\n[ステップ2] HTML生成 (slide_generator.html 初期スタイルに戻す)`);
    let baseHtml = fs.readFileSync('slide_generator.html', 'utf8');
    const newSpotsStr = JSON.stringify(spotsForHtml, null, 2).replace(/\\\\n/g, '\\n');

    baseHtml = baseHtml.replace(/const SPOTS = \[[\s\S]*?\];/, `const SPOTS = ${newSpotsStr};`);
    baseHtml = baseHtml.replace(/📍 [^<]+/, `📍 ${areaData.area}エリア`);
    baseHtml = baseHtml.replace(/[^<]+の穴場<span style="color:#25f4ee;">\d+選/g, `${areaData.area}の穴場<span style="color:#25f4ee;">${areaData.spots.length}選`);
    baseHtml = baseHtml.replace(/✨ [^<]+/, `✨ ${areaData.category_focus}`);
    baseHtml = baseHtml.replace(/<title>.*?<\/title>/, `<title>${areaData.title}</title>`);
    baseHtml = baseHtml.replace(/collected_data\/store_images\/photo_landmark\.png/g, `content_library/${areaData.folder}/images/photo_landmark.png`);

    const tempHtmlPath = path.join(__dirname, `temp_${areaData.id}.html`);
    fs.writeFileSync(tempHtmlPath, baseHtml);

    // 3. キャプチャ (初期と同じシンプルキャプチャ)
    console.log(`\n[ステップ3] スライドキャプチャ`);
    await page.goto(`file:///${tempHtmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

    const totalSlides = areaData.spots.length + 4;

    for (let i = 0; i < totalSlides; i++) {
        await page.evaluate((idx) => { if (typeof showSlide === 'function') showSlide(idx); }, i);
        await new Promise(r => setTimeout(r, 600));

        const slideElement = await page.$('#slideContainer');
        const slideName = `slide_0${i + 1}.png`;
        const outPath = path.join(libraryDir, slideName);

        await slideElement.screenshot({ path: outPath });
        process.stdout.write(` ${i + 1} `);
    }
    console.log(`\n✅ キャプチャ完了`);
    fs.unlinkSync(tempHtmlPath);
    await browser.close();

    // 4. ZIP化
    console.log(`\n[ステップ4] ZIP出力`);
    try {
        const outZipDir = path.join(__dirname, 'ready_to_post_zips');
        if (!fs.existsSync(outZipDir)) fs.mkdirSync(outZipDir, { recursive: true });

        const zipOutPath = path.join(outZipDir, `${areaData.area}_TikTok投稿セット_完成版.zip`);
        const zip = new AdmZip();
        zip.addLocalFolder(libraryDir);
        zip.writeZip(zipOutPath);

        console.log(`\n🎉 完了！ ${zipOutPath} に納品されました。`);
    } catch (e) {
        console.error(`\n❌ ZIP化エラー: ${e.message}`);
    }
}

run().catch(e => {
    console.error("❌ 予期せぬエラー:", e);
    process.exit(1);
});
