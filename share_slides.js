/**
 * 📱 TikTokスライド スマホ転送ビューア
 * 使い方: node share_slides.js [エリアフォルダ名]
 * 例:     node share_slides.js 008_otaru_romantic
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');

const args = process.argv.slice(2);
const folderName = args[0];
const PORT = 3000;

if (!folderName) {
    console.error('❌ フォルダ名を指定してください。例: node share_slides.js 008_otaru_romantic');
    process.exit(1);
}

const slideDir = path.join(__dirname, 'content_library', folderName);
if (!fs.existsSync(slideDir)) {
    console.error(`❌ フォルダが見つかりません: ${slideDir}`);
    process.exit(1);
}

// スライドPNGファイルを番号順に取得
const slides = fs.readdirSync(slideDir)
    .filter(f => f.match(/^slide_\d+\.png$/))
    .sort();

const captionFile = path.join(slideDir, 'caption.txt');
const caption = fs.existsSync(captionFile) ? fs.readFileSync(captionFile, 'utf8') : '';

// PCのローカルIPを取得
function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

const localIP = getLocalIP();
const serverURL = `http://${localIP}:${PORT}`;

// HTMLギャラリー生成
function buildGalleryHTML() {
    const slideItems = slides.map((name, i) => `
        <div class="slide-card" onclick="openFull(${i})">
            <img src="/slide/${name}" alt="スライド${i + 1}" loading="lazy">
            <div class="slide-label">スライド ${i + 1}/${slides.length}</div>
        </div>
    `).join('');

    const fullscreenImgs = slides.map((name, i) => `
        <div class="fullscreen-slide ${i === 0 ? 'active' : ''}" id="full-${i}">
            <img src="/slide/${name}" alt="スライド${i + 1}">
        </div>
    `).join('');

    const escapedCaption = caption.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <title>📱 ${folderName} - スライド転送</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a0f; color: #fff; font-family: -apple-system, system-ui, sans-serif; }

        .header {
            background: linear-gradient(135deg, #1a0030, #0a0a0f);
            padding: 16px;
            text-align: center;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .header h1 { font-size: 18px; color: #25f4ee; margin-bottom: 4px; }
        .header p { font-size: 12px; color: #888; }

        .tabs {
            display: flex;
            background: rgba(255,255,255,0.05);
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .tab {
            flex: 1;
            padding: 12px;
            text-align: center;
            font-size: 13px;
            cursor: pointer;
            color: #888;
            transition: all 0.2s;
        }
        .tab.active { color: #25f4ee; border-bottom: 2px solid #25f4ee; }

        /* ギャラリービュー */
        #gallery-view {
            padding: 12px;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
        }
        #gallery-view.hidden { display: none; }
        .slide-card {
            border-radius: 10px;
            overflow: hidden;
            cursor: pointer;
            border: 1px solid rgba(255,255,255,0.1);
            position: relative;
        }
        .slide-card img { width: 100%; display: block; }
        .slide-label {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0,0,0,0.7);
            font-size: 11px;
            padding: 4px 6px;
            text-align: center;
        }

        /* フルスクリーンビューア */
        #viewer-view { display: none; position: relative; }
        #viewer-view.active { display: block; }
        .fullscreen-slide { display: none; }
        .fullscreen-slide.active { display: block; }
        .fullscreen-slide img { width: 100%; display: block; }
        .viewer-controls {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: rgba(0,0,0,0.6);
        }
        .viewer-btn {
            background: rgba(37,244,238,0.15);
            border: 1px solid rgba(37,244,238,0.4);
            color: #25f4ee;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
        }
        .viewer-btn:disabled { opacity: 0.3; }
        .viewer-counter { font-size: 14px; color: #aaa; }
        .download-btn {
            display: block;
            margin: 12px 16px;
            background: linear-gradient(135deg, #25f4ee, #0d9e9a);
            color: #000;
            text-align: center;
            padding: 12px;
            border-radius: 10px;
            font-weight: 900;
            font-size: 15px;
            text-decoration: none;
        }

        /* キャプションビュー */
        #caption-view { display: none; padding: 16px; }
        #caption-view.active { display: block; }
        .caption-box {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 14px;
            font-size: 13px;
            line-height: 1.7;
            color: #ddd;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .save-all-btn {
            display: block;
            margin: 12px 16px 0;
            background: linear-gradient(135deg, #fe2c55, #c0002a);
            color: #fff;
            text-align: center;
            padding: 16px;
            border-radius: 14px;
            font-weight: 900;
            font-size: 16px;
            cursor: pointer;
            border: none;
            width: calc(100% - 32px);
            box-shadow: 0 4px 20px rgba(254,44,85,0.4);
            letter-spacing: 0.03em;
        }
        .save-all-btn:disabled { opacity: 0.6; }
        .save-note { text-align: center; font-size: 11px; color: #666; margin: 6px 16px 12px; }

        /* 一括保存ビュー */
        #saveall-view { display: none; padding: 12px; }
        #saveall-view.active { display: block; }
        .saveall-img-wrap {
            width: 100%;
            margin-bottom: 10px;
            border-radius: 10px;
            overflow: hidden;
            position: relative;
        }
        .saveall-img-wrap img { width: 100%; display: block; }
        .saveall-label {
            position: absolute;
            bottom: 0; left: 0; right: 0;
            background: rgba(0,0,0,0.7);
            color: #fff;
            font-size: 11px;
            padding: 6px;
            text-align: center;
        }
        .ios-hint {
            background: rgba(37,244,238,0.1);
            border: 1px solid rgba(37,244,238,0.3);
            border-radius: 10px;
            padding: 12px;
            font-size: 13px;
            color: #25f4ee;
            text-align: center;
            margin-bottom: 12px;
            line-height: 1.6;
        }
        /* キャプションのtextarea */
        .caption-textarea {
            width: 100%;
            height: 200px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 10px;
            color: #ddd;
            font-size: 12px;
            padding: 12px;
            line-height: 1.7;
            resize: none;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📱 ${folderName}</h1>
        <p>スマホから画像を長押し → 保存してTikTokへ</p>
    </div>

    <button class="save-all-btn" id="save-all-btn" onclick="saveAllImages()">
        📥 全部まとめて保存（${slides.length}枚）
    </button>
    <p class="save-note">※ iOSは「写真に追加」、Androidは「ダウンロード」を選択してください</p>

    <div class="tabs">
        <div class="tab active" onclick="switchTab('gallery')">🖼 一覧</div>
        <div class="tab" onclick="switchTab('saveall')">📥 保存</div>
        <div class="tab" onclick="switchTab('viewer')">📺 全画面</div>
        <div class="tab" onclick="switchTab('caption')">📝 文章</div>
    </div>

    <div id="gallery-view">${slideItems}</div>

    <div id="saveall-view">
        <div class="ios-hint">👇 各画像を<strong>長押し</strong>して「写真に追加」を選んでください<br>（${slides.length}枚 保存してTikTokへ！）</div>
        ${slides.map((name, i) => `
        <div class="saveall-img-wrap">
            <img src="/slide/${name}" alt="スライド${i + 1}">
            <div class="saveall-label">📌 長押し → 写真に追加 &nbsp;｜&nbsp; スライド ${i + 1}/${slides.length}</div>
        </div>`).join('')}
    </div>

    <div id="viewer-view">
        ${fullscreenImgs}
        <div class="viewer-controls">
            <button class="viewer-btn" id="prev-btn" onclick="changeSlide(-1)">← 前</button>
            <span class="viewer-counter" id="viewer-counter">1 / ${slides.length}</span>
            <button class="viewer-btn" id="next-btn" onclick="changeSlide(1)">次 →</button>
        </div>
        <a class="download-btn" id="dl-link" href="/slide/${slides[0]}" download>📥 この画像を保存</a>
    </div>

    <div id="caption-view">
        <textarea class="caption-textarea" id="caption-ta" readonly>${caption.replace(/`/g, '\\`')}</textarea>
        <button style="display:block;width:100%;background:rgba(37,244,238,0.15);border:1px solid rgba(37,244,238,0.4);color:#25f4ee;padding:14px;border-radius:10px;font-size:15px;cursor:pointer;font-weight:700;" onclick="copyCaption(this)">📋 キャプションをコピー</button>
        <p style="font-size:11px;color:#666;text-align:center;margin-top:8px;">コピーできない場合は上のテキストを全選択→コピーしてください</p>
    </div>

    <script>
        let currentSlide = 0;
        const total = ${slides.length};
        const slideNames = ${JSON.stringify(slides)};
        const TABS = ['gallery', 'saveall', 'viewer', 'caption'];

        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            TABS.forEach(name => {
                const el = document.getElementById(name + '-view');
                if (el) { el.classList.remove('active'); el.style.display = 'none'; }
            });
            const idx = TABS.indexOf(tab);
            if (idx >= 0) document.querySelectorAll('.tab')[idx].classList.add('active');
            const target = document.getElementById(tab + '-view');
            if (!target) return;
            if (tab === 'gallery') target.style.display = 'grid';
            else { target.style.display = 'block'; target.classList.add('active'); }
        }

        function openFull(idx) {
            currentSlide = idx;
            switchTab('viewer');
            updateViewer();
        }

        function changeSlide(dir) {
            currentSlide = Math.max(0, Math.min(total - 1, currentSlide + dir));
            updateViewer();
        }

        function updateViewer() {
            document.querySelectorAll('.fullscreen-slide').forEach((el, i) => el.classList.toggle('active', i === currentSlide));
            document.getElementById('viewer-counter').textContent = (currentSlide + 1) + ' / ' + total;
            document.getElementById('prev-btn').disabled = currentSlide === 0;
            document.getElementById('next-btn').disabled = currentSlide === total - 1;
            document.getElementById('dl-link').href = '/slide/' + slideNames[currentSlide];
            document.getElementById('dl-link').download = slideNames[currentSlide];
        }

        function copyCaption(btn) {
            const ta = document.getElementById('caption-ta');
            ta.select();
            ta.setSelectionRange(0, 99999);
            let ok = false;
            // 方法1: Clipboard API (HTTPS限定)
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(ta.value).then(() => {
                    btn.textContent = '✅ コピー完了！';
                    setTimeout(() => btn.textContent = '📋 キャプションをコピー', 2000);
                }).catch(() => fallbackCopy(btn, ta));
            } else {
                // 方法2: execCommand (HTTP・iOS対応)
                fallbackCopy(btn, ta);
            }
        }

        function fallbackCopy(btn, ta) {
            try {
                const ok = document.execCommand('copy');
                if (ok) {
                    btn.textContent = '✅ コピー完了！';
                    setTimeout(() => btn.textContent = '📋 キャプションをコピー', 2000);
                } else {
                    btn.textContent = '👆 上のテキストを全選択してコピー';
                }
            } catch(e) {
                btn.textContent = '👆 上のテキストを全選択してコピー';
            }
        }
    </script>
</body>
</html>`;
}

// HTTPサーバー
const server = http.createServer(async (req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildGalleryHTML());
    } else if (req.url === '/qr') {
        // 大きなQRコード表示ページ
        const svgQR = await QRCode.toString(serverURL, {
            type: 'svg', width: 400, margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        });
        const qrPage = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QRコード</title>
<style>
body{background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:sans-serif;}
.qr-wrap{padding:20px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);}
svg{width:min(80vw,400px);height:min(80vw,400px);}
p{color:#333;font-size:16px;margin-top:16px;text-align:center;}
small{color:#888;font-size:12px;}
</style></head><body>
<div class="qr-wrap">${svgQR}</div>
<p>📱 スマホのカメラで読み取ってください</p>
<small>${serverURL}</small>
</body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(qrPage);
    } else if (req.url.startsWith('/slide/')) {
        const fileName = decodeURIComponent(req.url.replace('/slide/', ''));
        const filePath = path.join(slideDir, fileName);
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'image/png' });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n');
    console.log('━'.repeat(50));
    console.log(`📱 TikTokスライド スマホ転送ビューア`);
    console.log('━'.repeat(50));
    console.log(`📂 フォルダ: ${folderName}`);
    console.log(`🖼  スライド数: ${slides.length}枚\n`);
    console.log(`📡 サーバー起動中: ${serverURL}`);
    console.log('\n🔲 スマホでQRコードを読み取ってください:\n');

    qrcode.generate(serverURL, { small: true });

    console.log(`\n🌐 URL: ${serverURL}`);
    console.log(`🔲 QRコード専用ページ（PC のブラウザで開いてスキャン）:`);
    console.log(`   👉 http://localhost:${PORT}/qr`);
    console.log('\n💡 使い方:');
    console.log('   1. スマホのカメラでQRコードを読み取る');
    console.log('   2. ブラウザが開く → 画像をタップ');
    console.log('   3. 画像を長押し → 保存');
    console.log('   4. TikTokで画像投稿！');
    console.log('\n⏹  終了するには Ctrl+C を押す\n');
    console.log('━'.repeat(50));
});
