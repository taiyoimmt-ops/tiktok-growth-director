const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 浅草のデータ
const areaData = {
    area: '浅草',
    title: 'デートにおすすめ浅草の穴場6選',
    category_focus: '下町・食べ歩き',
    folder: '002_asakusa_gourmet',
    spots: [
        { name: 'フルーツパーラー\\nゴトー', shortName: 'フルーツパーラーゴトー', price: '¥1,000〜¥2,000', rating: '4.3', reviews: '800', category: 'スイーツ', search: 'フルーツパーラーゴトー パフェ' },
        { name: 'ペリカンカフェ', shortName: 'ペリカンカフェ', price: '¥1,000〜¥2,000', rating: '4.2', reviews: '450', category: 'カフェ', search: 'ペリカンカフェ 浅草 トースト' },
        { name: 'つくし', shortName: 'つくし', price: '¥1,000〜¥2,000', rating: '4.5', reviews: '200', category: 'とんかつ', search: 'つくし 浅草 定食' },
        { name: '浅草メンチ', shortName: '浅草メンチ', price: '〜¥500', rating: '4.0', reviews: '1200', category: '食べ歩き', search: '浅草メンチ' },
        { name: '珈琲天国', shortName: '珈琲天国', price: '〜¥1,000', rating: '4.3', reviews: '500', category: 'カフェ', search: '珈琲天国 浅草 パンケーキ' }
    ]
};

async function downloadImageForQuery(page, query, outputPath) {
    console.log(`🔍 検索中: ${query}`);
    // Google画像検索へ（Bot対策のため、UserAgentを偽装し viewport を設定）
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}&hl=ja`, { waitUntil: 'domcontentloaded' });

    try {
        await page.waitForSelector('img', { timeout: 5000 });
        // 画像を少し読み込ませるための待機
        await new Promise(r => setTimeout(r, 1500));

        const imageSrc = await page.evaluate(() => {
            // Google画像検索のサムネイル群（JSロードされているもの）から抽出
            const images = Array.from(document.querySelectorAll('img'));
            for (let img of images) {
                // サイズがそこそこ大きくて、アイコン等ではない写真を探す
                if (img.src && typeof img.src === 'string') {
                    if (img.src.startsWith('data:image/jpeg') && img.src.length > 5000) {
                        return img.src; // Base64の大きめな画像
                    }
                    if (img.src.startsWith('http') && !img.src.includes('favicon') && img.width > 150) {
                        return img.src; // URL画像
                    }
                }
            }
            return null;
        });

        if (imageSrc) {
            if (imageSrc.startsWith('data:image')) {
                const base64Data = imageSrc.replace(/^data:image\/[^;]+;base64,/, "");
                fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
                console.log('✅ Base64画像を取得しました');
            } else {
                const source = await page.goto(imageSrc);
                fs.writeFileSync(outputPath, await source.buffer());
                console.log('✅ URLから画像を取得しました');
            }
        } else {
            throw new Error("有効な画像が見つかりませんでした");
        }
    } catch (e) {
        console.log(`⚠️ 写真取得でエラー: ${e.message} （ダミー画像を配置します）`);
        // エラー時はフォールバックとしてグレーの画像を配置
        const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
        fs.writeFileSync(outputPath, Buffer.from(dummyBase64, 'base64'));
    }
}

async function run() {
    console.log(`🚀 浅草エリアの自動生成を開始します...`);
    const libraryDir = path.join(__dirname, 'content_library', areaData.folder);
    const imgDir = path.join(libraryDir, 'images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    // ブラウザを開く（headless: false の方がBotブロックされにくいが、今回は素早く裏で処理するため true に設定。UserAgent偽装で回避）
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // 1. 画像の収集
    await downloadImageForQuery(page, '雷門 浅草寺 夜景 高画質', path.join(imgDir, 'photo_landmark.png'));

    let idx = 1;
    const spotsForHtml = [];
    for (const spot of areaData.spots) {
        const photoPath = path.join(imgDir, `photo_spot${idx}.png`);
        await downloadImageForQuery(page, `${spot.search} 綺麗`, photoPath);

        spotsForHtml.push({
            name: spot.name,
            shortName: spot.shortName,
            addr: '非公開', // 重複するので非表示にすることが多い
            price: spot.price,
            rating: spot.rating,
            reviews: spot.reviews,
            category: spot.category,
            merits: ['詳細は動画でチェック！'], // スプシ廃止に伴いダミー化
            demerit: '',
            secret: '',
            foodBg: `content_library/${areaData.folder}/images/photo_spot${idx}.png`,
            cardBg: ''
        });
        idx++;
    }

    // 2. HTMLの生成
    console.log(`📝 HTMLスライドを生成中...`);
    let baseHtml = fs.readFileSync('slide_generator.html', 'utf8');
    const newSpotsStr = JSON.stringify(spotsForHtml, null, 2).replace(/\\\\n/g, '\\n');

    baseHtml = baseHtml.replace(/const SPOTS = \[[\s\S]*?\];/, `const SPOTS = ${newSpotsStr};`);
    baseHtml = baseHtml.replace(/📍 鎌倉エリア/g, `📍 ${areaData.area}エリア`);
    baseHtml = baseHtml.replace(/鎌倉の穴場<span style="color:#25f4ee;">6選/g, `${areaData.area}の穴場<span style="color:#25f4ee;">${areaData.spots.length}選`);
    baseHtml = baseHtml.replace(/☕ カフェ ＆ 🍝 イタリアン/g, `✨ ${areaData.category_focus}`);
    baseHtml = baseHtml.replace(/鎌倉 穴場6選 - 新テンプレート/g, `${areaData.title}`);
    baseHtml = baseHtml.replace(/collected_data\/store_images\/photo_landmark\.png/g, `content_library/${areaData.folder}/images/photo_landmark.png`);

    const tempHtmlPath = path.join(__dirname, `temp_asakusa.html`);
    fs.writeFileSync(tempHtmlPath, baseHtml);

    // 3. キャプチャ（TikTokサイズの 450x800 に合わせるため #slideContainer をキャプチャ）
    console.log(`📷 スライドをキャプチャ中...`);
    await page.goto(`file:///${tempHtmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

    for (let i = 0; i < 9; i++) {
        await page.evaluate((idx) => showSlide(idx), i);
        await new Promise(r => setTimeout(r, 500)); // アニメーション待機

        const slideElement = await page.$('#slideContainer');
        const slideName = `slide_0${i + 1}.png`;
        await slideElement.screenshot({ path: path.join(libraryDir, slideName) });
        process.stdout.write(` ${i + 1} `);
    }
    console.log(`\n✅ 全9枚のキャプチャ完了！`);
    fs.unlinkSync(tempHtmlPath);

    // ブラウザを確実に閉じる（不要なウィンドウを残さない）
    await browser.close();

    // 4. ZIPにまとめる
    console.log(`📦 ZIPファイルを作成中...`);
    const zipPath = path.join(__dirname, 'content_library', `${areaData.folder}.zip`);
    const readyToPostDir = path.join(__dirname, 'ready_to_post_zips');
    if (!fs.existsSync(readyToPostDir)) fs.mkdirSync(readyToPostDir, { recursive: true });
    const targetPath = path.join(readyToPostDir, `浅草_TikTok投稿セット_完成版.zip`);
    try {
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        execSync(`powershell Compress-Archive -Path "${libraryDir}\\*" -DestinationPath "${zipPath}" -Force`);
        execSync(`powershell Copy-Item "${zipPath}" "${targetPath}" -Force`);
        console.log(`🎉 getmoney/ready_to_post_zips に「浅草_TikTok投稿セット_完成版.zip」を出力しました！`);
    } catch (e) {
        console.error("ZIP作成エラー:", e.message);
    }

    // 5. GAS用の入力データをコンソールに表示（コピペ用）
    const caption = fs.readFileSync(path.join(libraryDir, 'caption.txt'), 'utf8');
    console.log('\n==================================================');
    console.log('📝 スプレッドシート（TikTok投稿DB）へのコピペ用データ');
    console.log('==================================================');
    console.log(`エリア: ${areaData.area}`);
    console.log(`店名  : \n${areaData.spots.map(s => s.shortName).join('\\n')}`);
    console.log(`口コミ: \n${areaData.spots.map(s => s.reviews).join('\\n')}`);
    console.log(`投稿日: 2026/02/27`);
    console.log(`\nキャプション:\n${caption.split('\\n')[0]}... (他省略)`);
}

run().catch(e => {
    console.error("致命的なエラー:", e);
    process.exit(1);
});
