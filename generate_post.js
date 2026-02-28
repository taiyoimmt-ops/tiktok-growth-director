const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const google = require('googlethis');
const axios = require('axios');
const AdmZip = require('adm-zip');

// ==========================================
// TikTok Growth Director - リアルタイム評価抽出版ジェネレーター
// 特徴: Google検索から最新の「星」と「口コミ数」のテキストのみをスクレイピングし、CSSバッジに反映する。
// 実行: node generate_post.js [エリアID]
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

// ============== ロジック関数 ==============

// 写真取得し、実際に画像がまともなサイズか（1pxのゴミやエラー画像ではないか）を自動検証する監査付き関数
async function downloadHighResPhoto(queryArray, outputPath) {
    for (const query of queryArray) {
        console.log(`    🖼️ [画像取得] 検索中: ${query}`);
        try {
            const images = await google.image(query, { safe: false });
            if (images && images.length > 0) {
                // ロゴやアイコン、マップなど関係なさそうなキーワードを除外
                const validImages = images.filter(img => {
                    const url = img.url.toLowerCase();
                    return !url.includes('logo') && !url.includes('avatar') && !url.includes('icon')
                        && !url.includes('profile') && !url.includes('default') && !url.includes('map');
                });

                // 上位5件程度の候補から順番にダウンロードを試行し、監査をパスするものを探す
                const candidates = validImages.length > 0 ? validImages : images;

                for (let i = 0; i < Math.min(candidates.length, 3); i++) {
                    const targetImg = candidates[i];
                    try {
                        const response = await axios({
                            url: targetImg.url,
                            method: 'GET',
                            responseType: 'stream',
                            timeout: 8000,
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                        });

                        const writer = fs.createWriteStream(outputPath);
                        response.data.pipe(writer);
                        await new Promise((resolve, reject) => {
                            writer.on('finish', resolve);
                            writer.on('error', reject);
                        });

                        // 【画像監査システム (Image Auditor)】
                        // ダウンロードした画像が破損していないか、極小サイズ（15KB未満等）のゴミ画像でないか確認する
                        const stats = fs.statSync(outputPath);
                        if (stats.size > 15000) { // 15KB以上ならまともな画像と判定
                            console.log(`    ✅ 写真取得成功 (監査パス: ${(stats.size / 1024).toFixed(1)}KB)`);
                            return true; // 成功したら完全離脱
                        } else {
                            console.log(`    ⚠️ [自動監査エラー] 画像が小さすぎます (${(stats.size / 1024).toFixed(1)}KB)。別の画像をリトライします...`);
                            fs.unlinkSync(outputPath); // ゴミ画像を破棄
                        }
                    } catch (e) {
                        // ダウンロードエラーの場合は次の候補へ
                    }
                }
                console.log(`    ⚠️ クエリ '${query}' 内の候補はすべて監査に落ちました。次のクエリを試します...`);
            } else {
                console.log(`    ⚠️ 見つかりませんでした。別のクエリを試します...`);
            }
        } catch (e) {
            console.log(`    ⚠️ エラー発生 (${e.message})。別のクエリを試します...`);
        }
    }

    console.log(`    ❌ 写真取得完全失敗。ダミーを使用します。`);
    const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    fs.writeFileSync(outputPath, Buffer.from(dummyBase64, 'base64'));
    return false;
}

// Googleマップから直接正確な評価をスクレイピングする
// Maps内で検索し、リストが出た場合は一番上の店舗をクリックして詳細を開く
async function scrapeGoogleMaps(page, spotName, query) {
    console.log(`    🔍 [Google] ${spotName} の確実な数値を検索中...`);
    try {
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=ja`, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 2000));

        // リスト表示になっている場合、一番上の店舗リンクをクリックして詳細パネルを開く
        const firstResult = await page.$('a[href*="/maps/place/"]');
        if (firstResult) {
            await firstResult.click();
            await new Promise(r => setTimeout(r, 2500)); // パネルのロード待ち
        }

        const data = await page.evaluate(() => {
            let rating = null;
            let reviews = null;

            // aria-label を総走査して確実な星とレビュー数を探す
            const allElements = document.querySelectorAll('*');
            for (let el of allElements) {
                const aria = el.getAttribute('aria-label') || '';
                const text = el.innerText || '';

                if (!rating) {
                    let rMatch = aria.match(/^5つ星のうち\s*([1-5]\.[0-9])$/);
                    if (!rMatch) rMatch = aria.match(/評価\s*([1-5]\.[0-9])\s*（最高 5）/);
                    if (rMatch) rating = parseFloat(rMatch[1]);
                }

                if (!reviews) {
                    let vMatch = aria.match(/^([0-9,]+)\s*件の(?:レビュー|クチコミ)$/);
                    if (vMatch) reviews = parseInt(vMatch[1].replace(/,/g, ''), 10);
                }

                if (rating && reviews) break;
            }

            // Google Maps特有のクラスフォールバック
            if (!rating || !reviews) {
                const kp = document.querySelector('.F7nice');
                if (kp) {
                    const txt = kp.innerText;
                    const rMatch = txt.match(/([1-5]\.[0-9])/);
                    const vMatch = txt.match(/([\d,]+)/g); // (1,234)
                    if (rMatch) rating = parseFloat(rMatch[1]);
                    if (vMatch && vMatch.length > 1) {
                        reviews = parseInt(vMatch[vMatch.length - 1].replace(/,/g, ''), 10);
                    }
                }
            }

            return { rating, reviews };
        });

        if (data && data.rating && data.reviews && data.reviews > 0) {
            console.log(`    ✅ [Google] 取得完了: ⭐${data.rating} (${data.reviews}件)`);
            return data;
        }
        console.log(`    ⚠️ [Google] 店舗詳細が見つかりませんでした。`);
        return null;
    } catch (e) {
        console.log(`    ❌ [Google] エラー: ${e.message}`);
        return null;
    }
}

// フォールバック: 食べログ専用ページから確実に評価を取得する
async function scrapeTabelog(page, spotName, query) {
    console.log(`    🔍 [食べログ] ${spotName} 専用ページを検索中...`);
    try {
        // 1. Google 検索で確実にその店舗の食べログURLを取得する（広告誤爆防止）
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent('site:tabelog.com ' + query)}`, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 1500));

        const tabelogUrl = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="tabelog.com/"]'));
            for (let a of links) {
                // 店舗個別ページURLのみを抽出 (/rst/ などではない、食べログの店舗トップ)
                if (a.href.match(/tabelog\.com\/[a-z_]+\/A[0-9]+\/A[0-9]+\/[0-9]+\/?$/)) {
                    return a.href;
                }
            }
            return null;
        });

        if (!tabelogUrl) {
            console.log(`    ⚠️ [食べログ] 店舗専用URLが見つかりませんでした。`);
            return null;
        }

        // 2. 店舗専用ページに遷移して点数をピンポイント抽出
        await page.goto(tabelogUrl, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 1500));

        const data = await page.evaluate(() => {
            // 店舗専用ヘッダーのピンポイントクラス
            const ratingEl = document.querySelector('span.rdheader-rating__score-val-dtl');
            const reviewsEl = document.querySelector('span.rdheader-rating__review-target .num');

            let rating = null;
            let reviews = null;

            if (ratingEl) rating = parseFloat(ratingEl.innerText.trim());
            if (reviewsEl) reviews = parseInt(reviewsEl.innerText.trim().replace(/,/g, ''), 10);

            return { rating, reviews, isTabelog: true };
        });

        if (data && data.rating) {
            console.log(`    ✅ [食べログ] 取得完了: ⭐${data.rating} (${data.reviews || 0}件)`);
            return data;
        }
        console.log(`    ⚠️ [食べログ] 星の抽出に失敗しました。`);
        return null;
    } catch (e) {
        console.log(`    ❌ [食べログ] エラー: ${e.message}`);
        return null;
    }
}

// 評価取得の統合関数
async function scrapeLiveRating(page, spotName, searchQuery, areaName) {
    // 1. まずは正確なGoogle Mapsで検索（余計な文字を足さず、元のsearchQueryで検索）
    let data = await scrapeGoogleMaps(page, spotName, searchQuery);
    if (data && data.reviews >= 10) return data; // 精度が高い時のみ確定

    // 2. 失敗、あるいは口コミが少なすぎる場合は「店舗名＋エリア名」でGoogle Maps再検索
    const strictQuery = `${spotName} ${areaName} 店舗`;
    if (searchQuery !== strictQuery) {
        data = await scrapeGoogleMaps(page, spotName, strictQuery);
        if (data && data.reviews >= 10) return data;
    }

    // 3. それでもダメなら食べログを検索 (site指定で安全に)
    data = await scrapeTabelog(page, spotName, spotName + ' ' + areaName);
    return data;
}


// ============== メイン処理 ==============

async function run() {
    console.log(`\n=================================================`);
    console.log(`🚀 【${areaData.area}】TikTok生成プロセス開始 (Headful Scraping)`);
    console.log(`=================================================\n`);

    const libraryDir = path.join(__dirname, 'content_library', areaData.folder);
    const imgDir = path.join(libraryDir, 'images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    // データスクレイピング用のブラウザ起動 (HeadlessをONにして、完全に裏で実行する)
    const dataBrowser = await puppeteer.launch({
        headless: 'new',
        args: ['--start-minimized', '--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--lang=ja-JP,ja']
    });
    const dataPage = await dataBrowser.newPage();
    await dataPage.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }) });
    await dataPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    await dataPage.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7' });

    // 1. 画像収集 (ランドマーク)
    console.log(`[ステップ1] ランドマーク写真の取得`);
    await downloadHighResPhoto([`${areaData.landmark_search} 景色 高画質`], path.join(imgDir, 'photo_landmark.png'));

    // 2. スライドの逐次生成（情報収集→即時画像化）
    console.log(`\n[ステップ2] スライドの逐次生成（情報収集→即時レンダリング）`);

    // レンダリング用のブラウザを並行して準備
    const renderBrowser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const renderPage = await renderBrowser.newPage();
    await renderPage.setViewport({ width: 1200, height: 1000 });

    const tempHtmlPath = path.join(__dirname, `temp_${areaData.id}.html`);
    const templateFile = areaData.template || 'slide_generator.html';
    let baseHtml = fs.readFileSync(templateFile, 'utf8');

    // HTML更新関数
    const updateRenderHtml = (currentSpots) => {
        let html = baseHtml;
        const newSpotsStr = JSON.stringify(currentSpots, null, 2).replace(/\\\\n/g, '\\n');
        html = html.replace(/const SPOTS = \[[\s\S]*?\];/, `const SPOTS = ${newSpotsStr};`);
        html = html.replace(/📍 [^<]+/, `📍 ${areaData.area}エリア`);
        html = html.replace(/[^<]+の穴場<span style="color:#25f4ee;">\d+選/g, `${areaData.area}の穴場<span style="color:#25f4ee;">${areaData.spots.length}選`);
        html = html.replace(/✨ [^<]+/, `✨ ${areaData.category_focus}`);
        html = html.replace(/<title>.*?<\/title>/, `<title>${areaData.title}</title>`);
        html = html.replace(/content_library\/002_asakusa_gourmet\/images\/photo_landmark\.png/g, `content_library/${areaData.folder}/images/photo_landmark.png`);
        fs.writeFileSync(tempHtmlPath, html);
    };

    // 初期データ（仮に埋めておく）
    const spotsForHtml = areaData.spots.map(s => ({
        name: s.name, shortName: s.name, addr: '非公開', price: s.price, rating: s.rating, reviews: s.reviews,
        category: s.category, merits: Array.isArray(s.merits) ? s.merits : [s.merits], demerit: s.demerit || '', secret: s.secret || '',
        foodBg: `content_library/${areaData.folder}/images/dummy.png`
    }));

    // タイトルスライド (Slide 0) の撮影
    updateRenderHtml(spotsForHtml);
    await renderPage.goto(`file:///${tempHtmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
    await renderPage.evaluate(() => { if (typeof showSlide === 'function') showSlide(0); });
    await new Promise(r => setTimeout(r, 600));
    await (await renderPage.$('#slideContainer')).screenshot({ path: path.join(libraryDir, 'slide_01.png') });
    console.log(`    🎨 [画像生成] タイトルスライド完了`);

    let idx = 1;
    for (const spot of areaData.spots) {
        console.log(`\n  📍 ${idx}/${areaData.spots.length}: ${spot.name}`);
        const photoPath = path.join(imgDir, `photo_spot${idx}.png`);

        // 1. リアルタイムテキストスクレイピング
        // 検索クエリは JSON の "search" フィールドをそのまま活用（余計なエリア名結合によるMapsの誤作動を防ぐ）
        const liveData = await scrapeLiveRating(dataPage, spot.name, spot.search, areaData.area);

        // 【ルール厳守】極端にレビューが少ない、または取得失敗した場合は絶対フォールバックせずエラー終了
        if (!liveData || liveData.reviews < 10) {
            console.error(`\n    ❌ [致命的エラー] ${spot.name} の正確な評価（レビュー数10件以上の実店舗データ）がGoogle等から取得できませんでした。`);
            console.error(`    ⚠️ ルールに基づき、JSONの事前データを自動採用（フォールバック）することは絶対に行いません。`);
            console.error(`    💡 ユーザー様へ: 「${spot.name}」はネット上で情報が安定していないためオススメ対象に不適切です。batch_areas.json の該当店舗を別の確実な店舗に書き換えてから再実行してください。`);
            process.exit(1); // ここで安全に強制終了
        }

        // 2. 高画質画像の取得
        const photoQueries = [
            `${spot.name} ${areaData.area} 店舗 外観`,
            `${spot.search} ${spot.category} メニュー`,
            `${spot.name} 映え`
        ];
        await downloadHighResPhoto(photoQueries, photoPath);

        // 3. データ反映と即時レンダリング（1店舗ごとに画像を完成させる）
        spotsForHtml[idx - 1].rating = liveData.rating;
        spotsForHtml[idx - 1].reviews = liveData.reviews;
        spotsForHtml[idx - 1].source = liveData.isTabelog ? '食べログ' : 'Googleのクチコミ';
        spotsForHtml[idx - 1].foodBg = `content_library/${areaData.folder}/images/photo_spot${idx}.png`;

        updateRenderHtml(spotsForHtml);
        await renderPage.reload({ waitUntil: 'networkidle0' });
        await renderPage.evaluate((slideIdx) => { if (typeof showSlide === 'function') showSlide(slideIdx); }, idx);
        await new Promise(r => setTimeout(r, 600));
        await (await renderPage.$('#slideContainer')).screenshot({ path: path.join(libraryDir, `slide_0${idx + 1}.png`) });

        console.log(`    🎨 [画像生成] スライド画像完成 => slide_0${idx + 1}.png`);
        idx++;
    }

    // 3. エンドスライドの生成
    console.log(`\n[ステップ3] エンドスライドの生成`);
    for (let i = areaData.spots.length + 1; i < areaData.spots.length + 4; i++) {
        await renderPage.evaluate((slideIdx) => { if (typeof showSlide === 'function') showSlide(slideIdx); }, i);
        await new Promise(r => setTimeout(r, 600));
        await (await renderPage.$('#slideContainer')).screenshot({ path: path.join(libraryDir, `slide_0${i + 1}.png`) });
    }
    console.log(`    ✅ 全スライドのレンダリング完了`);

    // 4. キャプションの自動生成
    console.log(`\n[ステップ4] キャプションの自動生成`);
    const hashtags = [
        `#${areaData.area}`,
        `#${areaData.area}旅行`,
        `#${areaData.area}グルメ`,
        '#隠れ家カフェ',
        '#教えたくない場所',
        '#永久保存版',
        '#コスパ最強',
        '#旅行好きな人と繋がりたい',
        '#TikTok旅行',
        '#学生旅行',
        '#国内旅行',
        '#穴場スポット',
        '#週末旅行',
        '#デートスポット',
    ];

    const caption = `【${areaData.area}で本当は教えたくない${areaData.spots.length}選】

「え、こんな場所あったの？」
地元民が隠してた${areaData.area}の穴場を全部暴露します。

${areaData.spots.map((s, i) => `${i + 1}. ${s.name}
💰 ${s.price} ⭐${spotsForHtml[i].rating || s.rating}
→ ${Array.isArray(s.merits) ? s.merits[0] : s.merits}
🤫 ${(s.secret || '').substring(0, 40)}...`).join('\n\n')}

──────────────

⚠️ ぶっちゃけ${areaData.spots[0].name}は予約取れなくなるんで本当は教えたくないです。
でも${areaData.spots[1] ? areaData.spots[1].name : '他のお店'}の方がコスパは上かも？
皆はどっち派？コメントで教えて👇

──────────────

📌 保存して次の旅行で行ってみて！
📍 詳しい情報はプロフィールのリンクから

${hashtags.join(' ')}`;

    fs.writeFileSync(path.join(libraryDir, 'caption.txt'), caption, 'utf8');
    console.log(`    ✅ caption.txt の生成完了`);

    await dataBrowser.close();
    await renderBrowser.close();
    fs.unlinkSync(tempHtmlPath);

    // 5. ZIP圧縮
    console.log(`\n[ステップ5] 納品用ZIPの作成`);
    try {
        const outZipDir = path.join(__dirname, 'ready_to_post_zips');
        if (!fs.existsSync(outZipDir)) fs.mkdirSync(outZipDir, { recursive: true });

        const zipOutPath = path.join(outZipDir, `${areaData.area}_TikTok投稿セット_完成版.zip`);
        const zip = new AdmZip();
        zip.addLocalFolder(libraryDir);
        zip.writeZip(zipOutPath);

        console.log(`\n🎉🎉 全工程完了！ ${zipOutPath} に最高の成果物が納品されました。 🎉🎉`);
    } catch (e) {
        console.error(`\n❌ ZIP化エラー: ${e.message}`);
    }
}

run().catch(e => {
    console.error("❌ 予期せぬエラー:", e);
    process.exit(1);
});
