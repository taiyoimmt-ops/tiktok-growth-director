'use strict';

/**
 * ================================================
 * spot_auditor.js — スポット品質監査システム
 * ================================================
 * 役割: AI（Gemini）が提案したスポットリストを
 *   1. Google Mapsで実在確認
 *   2. エリア内に本当にあるか（距離検証）
 *   3. 本物の評価・レビュー数を取得
 * し、不合格スポットを自動除外する。
 */

const puppeteer = require('puppeteer');

// ==================== 設定 ====================
const MAX_DISTANCE_KM = 15; // エリア中心から何kmまで許容するか

// ==================== メイン監査ループ ====================
/**
 * auditorにスポットリストを渡すと、全スポットの検証済みデータが返る。
 * 不合格スポットはリストから除外され、"rejectedSpots"に入る。
 *
 * @param {Array} spots   - Gemini が生成したスポット配列
 * @param {string} areaName - エリア名（例: "葉山"）
 * @param {object} areaCoords - エリア中心の緯度経度 { lat, lng }（省略可）
 * @returns {Promise<{ approved: Array, rejected: Array }>}
 */
async function auditSpots(spots, areaName, areaCoords = null) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const approved = [];
    const rejected = [];

    console.log(`\n🕵️ 監査開始: ${areaName} エリアの ${spots.length}件を確認中...\n`);

    for (const spot of spots) {
        const result = await auditOneSpot(page, spot, areaName, areaCoords, sleep);
        if (result.passed) {
            // 本物の評価・レビュー数に上書き
            if (result.rating !== null) spot.rating = result.rating;
            if (result.reviews !== null) spot.reviews = result.reviews;
            approved.push(spot);
            console.log(`  ✅ [合格] ${spot.name} — ★${spot.rating} (${spot.reviews}件)`);
        } else {
            rejected.push({ spot, reason: result.reason });
            console.log(`  ❌ [不合格] ${spot.name} — 理由: ${result.reason}`);
        }
    }

    await browser.close();
    return { approved, rejected };
}

/**
 * 1スポットをGoogleマップで調べ、合否判定する
 */
async function auditOneSpot(page, spot, areaName, areaCoords, sleep) {
    const query = encodeURIComponent(`${spot.name} ${areaName}`);
    const url = `https://www.google.co.jp/maps/search/${query}?hl=ja`;

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 12000 });
        await sleep(1500);

        const data = await page.evaluate((areaName) => {
            const html = document.body.innerHTML;
            const text = document.body.innerText;

            // --- 評価取得 ---
            const rMatch = html.match(/aria-label="([\d\.]+)\s+つ星"/);
            const vMatch = html.match(/aria-label="([\d,]+)\s+件のクチコミ"/);

            // --- 住所取得（座標推定用） ---
            // Google Mapsはページ内URLに座標が含まれることがある
            const coordMatch = location.href.match(/@([\-\d\.]+),([\-\d\.]+)/);

            // --- "件の結果" → 複数件ヒット＝あいまいさあり ---
            const multipleResults = /件の結果/.test(text);

            // --- 「営業中」「営業時間」の有無（実在店舗確認手がかり）---
            const hasBusinessInfo = /営業中|営業時間|定休日|電話番号/.test(text);

            // --- "見つかりませんでした" 判定 ---
            const notFound = /一致する情報は見つかりませんでした|地図に情報が見つかりません/.test(text);

            return {
                rating: rMatch ? parseFloat(rMatch[1]) : null,
                reviews: vMatch ? parseInt(vMatch[1].replace(/,/g, '')) : null,
                lat: coordMatch ? parseFloat(coordMatch[1]) : null,
                lng: coordMatch ? parseFloat(coordMatch[2]) : null,
                multipleResults,
                hasBusinessInfo,
                notFound,
                fullText: text.substring(0, 400)
            };
        }, areaName);

        // ---- 判定ロジック ----

        // 1. 見つからなかった
        if (data.notFound) {
            return { passed: false, reason: 'Googleマップに該当店舗なし（実在しない可能性）' };
        }

        // 2. 店舗の基本情報が一切ない
        if (!data.hasBusinessInfo && !data.rating && !data.multipleResults) {
            return { passed: false, reason: '営業情報なし（実在不明）' };
        }

        // 3. 【絶対ルール】レビュー数が取得できた場合、10件未満は「データの裏付けが弱い」として不合格にする
        // これがないと、後の生成プロセス (generate_post.js) で10件未満による致命的エラーで止まってしまう。
        if (data.reviews !== null && data.reviews < 10) {
            return { passed: false, reason: `レビュー数が10件未満（${data.reviews}件）のため、信頼データ不足で除外` };
        }

        // 4. 座標が取得できた場合 → エリアから離れすぎていないか確認
        if (data.lat && data.lng && areaCoords) {
            const dist = haversineKm(data.lat, data.lng, areaCoords.lat, areaCoords.lng);
            if (dist > MAX_DISTANCE_KM) {
                return {
                    passed: false,
                    reason: `エリア外の店舗（${areaName}中心から${dist.toFixed(1)}km 離れている）`
                };
            }
        }

        // 4. 合格
        return {
            passed: true,
            rating: data.rating,
            reviews: data.reviews,
            reason: null
        };

    } catch (e) {
        return { passed: false, reason: `取得エラー: ${e.message}` };
    }
}

/**
 * 2点間の距離をKmで返す（Haversine公式）
 */
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// テスト実行モード（直接 node spot_auditor.js と実行したとき）
if (require.main === module) {
    const testSpots = [
        { name: 'CABAN', category: 'カフェ', search: 'CABAN 葉山 海カフェ', price: '¥2,000〜', merits: [], demerit: '', secret: '' },
        { name: '新宿御苑', category: '公園', search: '新宿御苑', price: '無料', merits: [], demerit: '', secret: '' }
    ];
    const testAreaCoords = { lat: 35.2727, lng: 139.5839 }; // 葉山の中心

    auditSpots(testSpots, '葉山', testAreaCoords).then(res => {
        console.log('\n--- 監査結果 ---');
        console.log('合格:', res.approved.map(s => s.name));
        console.log('不合格:', res.rejected.map(r => `${r.spot.name}（${r.reason}）`));
    });
}

module.exports = { auditSpots };
