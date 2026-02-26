const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// sharpが無ければインストールする（Approach 5で使用）
try {
    require.resolve('sharp');
} catch (e) {
    console.log('Installing sharp...');
    execSync('npm install sharp', { stdio: 'inherit' });
}
const sharp = require('sharp');

const outDir = path.join(__dirname, 'demo_kagurazaka');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function downloadImageForQuery(page, query, outputPath) {
    console.log(`🔍 検索中: ${query}`);
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.goto(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}&hl=ja`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('img', { timeout: 5000 });
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await new Promise(r => setTimeout(r, 2000));

        const imageSrc = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'));
            for (let img of images) {
                // 本物のURLかつ高解像度のものを狙う
                if (img.src && typeof img.src === 'string' && img.src.startsWith('http') && !img.src.includes('favicon') && img.width > 200 && img.height > 200) {
                    return img.src;
                }
            }
            return null;
        });

        if (imageSrc) {
            const source = await page.goto(imageSrc, { waitUntil: 'networkidle2', timeout: 8000 });
            fs.writeFileSync(outputPath, await source.buffer());
            return true;
        }
    } catch (e) {
        console.error(e.message);
    }
    return false;
}

function generateHtml(options) {
    const w = options.width;
    const h = options.height;
    const s = options.scale;
    const absBgUrl = options.bgUrl;

    const css = `
        body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; }
        .slide { width: ${w}px; height: ${h}px; position: relative; overflow: hidden; border-radius: ${12 * s}px; box-shadow: 0 ${20 * s}px ${60 * s}px rgba(0,0,0,0.5); background: ${options.transparent ? 'transparent' : '#000'}; }
        .bg-layer { position: absolute; inset: 0; width: 100%; height: 100%; }
        .overlay { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 35%, rgba(0,0,0,0.95) 80%); }
        .ui-layer { position: absolute; inset: 0; z-index: 10; padding: ${20 * s}px; color:#fff; display: flex; flex-direction: column; justify-content: flex-end;}
        .store-num { background: rgba(255,45,85,0.9); padding: ${2 * s}px ${10 * s}px; border-radius: ${12 * s}px; font-size: ${9 * s}px; font-weight: 800; display: inline-block; margin-bottom: ${4 * s}px; }
        .store-label { font-size: ${24 * s}px; font-weight: 900; line-height: 1.2; text-shadow: 0 ${2 * s}px ${8 * s}px rgba(0,0,0,0.9); margin-bottom: ${10 * s}px; }
        .bottom-area { padding-bottom: ${50 * s}px; padding-left: ${10 * s}px; }
        .merit { color: #5eead4; font-size: ${11 * s}px; font-weight: 800; margin-bottom: ${6 * s}px; display: flex; align-items: center; gap: ${6 * s}px; text-shadow: 0px 2px 4px rgba(0,0,0,0.8); }
        .merit::before { content: "✓"; background: #5eead4; color: #000; width: ${14 * s}px; height: ${14 * s}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: ${9 * s}px; }
        .card { position:absolute; top:${16 * s}px; right:${16 * s}px; width:${120 * s}px; height:${140 * s}px; background:#fff; border-radius:${10 * s}px; overflow:hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.4); transform: rotate(2deg); }
        .card img { width:100%; height:60%; object-fit:cover; }
        .card-text { padding:${8 * s}px; color:#000; }
        .card-name { font-size:${8 * s}px; font-weight:900; }
        .card-rating { font-size:${7 * s}px; color:#fbbc04; margin-top:${2 * s}px; font-weight:bold; }
    `;

    let bgHtml = '';
    if (options.bgType === 'css') {
        bgHtml = `<div class="bg-layer" style="background-image:url('${absBgUrl}'); background-size: cover; background-position: center;"></div>`;
    } else if (options.bgType === 'img') {
        bgHtml = `<img class="bg-layer" src="${absBgUrl}" style="object-fit:cover;">`;
    } else if (options.bgType === 'canvas') {
        bgHtml = `<canvas id="bgCanvas" class="bg-layer" width="${w}" height="${h}"></canvas>
        <script>
            const img = new Image();
            img.onload = () => {
                const ctx = document.getElementById('bgCanvas').getContext('2d');
                const scale = Math.max(${w} / img.naturalWidth, ${h} / img.naturalHeight);
                const x = (${w} / 2) - (img.naturalWidth / 2) * scale;
                const y = (${h} / 2) - (img.naturalHeight / 2) * scale;
                ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
            };
            img.src = '${absBgUrl}';
        </script>`;
    }

    return `
    <html><head><style>${css}</style></head>
    <body style="${options.transparent ? 'background:transparent;' : 'background:#333;'}">
        <div class="slide" id="slide" style="${options.transparent ? 'background:transparent; box-shadow:none;' : ''}">
            ${bgHtml}
            <div class="overlay"></div>
            <div class="ui-layer">
                <div style="position:absolute; top:${16 * s}px; left:${16 * s}px;">
                    <div class="store-num">焼肉 #1</div>
                    <div class="store-label">神楽坂<br>焼肉 KAZU</div>
                </div>
                
                <div class="card">
                    <img src="${absBgUrl}">
                    <div class="card-text">
                        <div class="card-name">神楽坂 KAZU</div>
                        <div class="card-rating">★★★★☆ 4.8</div>
                    </div>
                </div>

                <div class="bottom-area">
                    <div class="merit">極上の黒毛和牛が堪能できる</div>
                    <div class="merit">神楽坂の隠れ家的な落ち着いた空間</div>
                    <div class="merit">記念日デートに最適な完全個室あり</div>
                </div>
            </div>
        </div>
    </body></html>
    `;
}

async function run() {
    console.log("=== 🚀 神楽坂 KAZU デモ 5アプローチ 生成開始 ===");
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    const bgImgName = 'kazu_bg.jpg';
    const bgImgPath = path.join(outDir, bgImgName);

    // 画像ダウンロード
    if (!fs.existsSync(bgImgPath)) {
        console.log("神楽坂 KAZU の画像をダウンロードしています...");
        // ユーザー提供の画像に近い「外観」の高画質画像をピンポイントで狙う
        let success = await downloadImageForQuery(page, "神楽坂 焼肉 KAZU 外観 高画質", bgImgPath);
        if (!success) {
            console.log("⚠️ 代替ダミー画像（赤色）を生成します...");
            await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 150, g: 50, b: 50 } } }).jpeg().toFile(bgImgPath);
        }
    }
    const absBgUrl = 'file:///' + bgImgPath.replace(/\\/g, '/');

    // アプローチ実行用ヘルパー関数
    const runApproach = async (name, opts, vpScale, useSharp = false) => {
        const htmlFile = path.join(outDir, `${name}.html`);
        const pngFile = path.join(outDir, `${name}.png`);

        fs.writeFileSync(htmlFile, generateHtml({ ...opts, bgUrl: absBgUrl }));

        await page.setViewport({ width: 1920, height: 1600, deviceScaleFactor: vpScale });
        await page.goto(`file:///${htmlFile.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

        // Canvas描画等のために少し待機
        await new Promise(r => setTimeout(r, 1000));

        const slideEl = await page.$('#slide');

        if (useSharp) {
            const tempPng = path.join(outDir, `${name}_transparent_ui.png`);
            // Puppeteerで背景透過PNG（文字・UIのみ）をキャプチャ
            await slideEl.screenshot({ path: tempPng, omitBackground: true });

            // sharpを使って元の高画質画像をリサイズ加工し、上に透過PNGを物理的に重ねる（ブラウザのUIエンジンを迂回）
            const bgBuffer = await sharp(bgImgPath).resize(1080, 1350, { fit: 'cover' }).toBuffer();
            await sharp(bgBuffer).composite([{ input: tempPng }]).toFile(pngFile);

            fs.unlinkSync(tempPng);
        } else {
            // Puppeteer上で合成済みの結果をそのままキャプチャ
            await slideEl.screenshot({ path: pngFile, omitBackground: opts.transparent ? true : false });
        }

        console.log(`✅ ${name} 生成完了`);
    };

    // Approach 1: 最初期と同じスタイル（432x540のCSS等倍キャプチャ。一番最初はおそらくこれに近かった）
    await runApproach('01_最初期スタイル_CSS等倍', { bgType: 'css', width: 432, height: 540, scale: 1 }, 1);

    // Approach 2: PuppeteerのScale限界突破（432x540の見た目を、3倍解像度で内部レンダリング）
    await runApproach('02_高解像度スケール_CSS', { bgType: 'css', width: 432, height: 540, scale: 1 }, 3);

    // Approach 3: ネイティブ1080x1350 & imgタグ（実寸でHTMLを組み立てて等倍キャプチャ）
    await runApproach('03_実寸1080_Imgタグ', { bgType: 'img', width: 1080, height: 1350, scale: 2.5 }, 1);

    // Approach 4: Canvas描画（HTMLのimgタグを避け、Canvas側に直接ピクセルを流し込んでキャプチャ）
    await runApproach('04_実寸1080_Canvas描画', { bgType: 'canvas', width: 1080, height: 1350, scale: 2.5 }, 1);

    // Approach 5: Ultimate Sharp（ブラウザは文字出力だけを行い、背景画像合成はNode.jsの画像処理エンジンで直接行う）
    await runApproach('05_究極_Sharp直接合成', { bgType: 'none', width: 1080, height: 1350, scale: 2.5, transparent: true }, 1, true);

    await browser.close();
    console.log("🎉 すべてのテストが完了しました！ desktop/getmoney/demo_kagurazaka を確認してください。");
}

run().catch(console.error);
