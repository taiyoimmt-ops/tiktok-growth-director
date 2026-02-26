/**
 * 🌙 night_batch.js — 未生成エリアを自動でN個選んで生成 & GitHub Pagesに公開
 *
 * 使い方:
 *   node night_batch.js --count 1          ← 未生成エリアを1個自動選択して生成
 *   node night_batch.js --count 3 --push   ← 未生成エリアを3個生成してGitHub公開
 *   node night_batch.js 012 013 --push     ← IDを直接指定することも可能
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const doPush = args.includes('--push');
const countIdx = args.indexOf('--count');
const count = countIdx >= 0 ? parseInt(args[countIdx + 1], 10) : 0;
const specifiedIds = args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a) === false && a !== String(count));

// --count 指定時は未生成エリアを自動選択
function pickNextAreas(n) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'batch_areas.json'), 'utf8'));
    const libraryDir = path.join(__dirname, 'content_library');
    const generated = fs.existsSync(libraryDir)
        ? fs.readdirSync(libraryDir).filter(f => f.match(/^\d{3}_/))
        : [];

    const pending = data.areas.filter(a => {
        // フォルダが存在しない or スライドが1枚もない = 未生成
        const folder = path.join(libraryDir, a.folder);
        if (!fs.existsSync(folder)) return true;
        const slides = fs.readdirSync(folder).filter(f => f.match(/^slide_\d+\.png$/));
        return slides.length === 0;
    });

    if (pending.length === 0) {
        console.log('✅ 全エリアが生成済みです！batch_areas.json に新しいエリアを追加してください。');
        process.exit(0);
    }

    const picked = pending.slice(0, n);
    console.log(`\n📋 未生成エリア ${pending.length}件 → 今回 ${picked.length}件を処理:`);
    picked.forEach(a => console.log(`   • [${a.id}] ${a.area} (${a.folder})`));
    console.log();
    return picked.map(a => a.id);
}

const finalIds = count > 0 ? pickNextAreas(count) : specifiedIds;

if (finalIds.length === 0) {
    console.error('❌ エリアIDか --count N を指定してください。');
    console.error('   例: node night_batch.js --count 3 --push');
    process.exit(1);
}

const startTime = Date.now();
const results = [];

function log(msg) {
    const ts = new Date().toLocaleTimeString('ja-JP');
    console.log(`[${ts}] ${msg}`);
}

async function runArea(id) {
    return new Promise((resolve) => {
        log(`🚀 エリア ${id} の生成を開始...`);
        const child = spawn('node', ['generate_post.js', id], {
            cwd: __dirname,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let lastLine = '';
        child.stdout.on('data', (d) => {
            const lines = d.toString().split('\n').filter(l => l.trim());
            lines.forEach(l => {
                if (l.includes('✅') || l.includes('🔍') || l.includes('🎉') || l.includes('ステップ')) {
                    log(`  [${id}] ${l.trim()}`);
                }
                lastLine = l.trim();
            });
        });

        child.stderr.on('data', (d) => {
            const msg = d.toString().trim();
            if (msg) log(`  ⚠️ [${id}] ${msg}`);
        });

        child.on('close', (code) => {
            if (code === 0) {
                log(`✅ エリア ${id} 完了！`);
                results.push({ id, status: 'success' });
            } else {
                log(`❌ エリア ${id} 失敗 (exit: ${code})`);
                results.push({ id, status: 'failed', code });
            }
            resolve();
        });
    });
}

function buildGitHubPages() {
    log('\n📄 GitHub Pages ギャラリーを構築中...');

    const docsDir = path.join(__dirname, 'docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    // content_library 内の全エリアを走査
    const libraryDir = path.join(__dirname, 'content_library');
    const areaFolders = fs.readdirSync(libraryDir)
        .filter(f => fs.statSync(path.join(libraryDir, f)).isDirectory() && f.match(/^\d{3}_/))
        .sort();

    const areaCards = areaFolders.map(folder => {
        const areaDir = path.join(libraryDir, folder);
        const slides = fs.readdirSync(areaDir).filter(f => f.match(/^slide_\d+\.png$/)).sort();
        const captionPath = path.join(areaDir, 'caption.txt');
        const hasCaption = fs.existsSync(captionPath);
        const areaName = folder.replace(/^\d{3}_/, '').replace(/_/g, ' ');
        const firstSlide = slides[0] || '';

        // スライドをdocsエリアにコピー
        const destDir = path.join(docsDir, folder);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        slides.forEach(s => {
            const src = path.join(areaDir, s);
            const dst = path.join(destDir, s);
            fs.copyFileSync(src, dst);
        });
        if (hasCaption) {
            fs.copyFileSync(captionPath, path.join(destDir, 'caption.txt'));
        }

        const thumb = firstSlide ? `<img src="${folder}/${firstSlide}" class="thumb">` : '<div class="no-thumb">No Image</div>';
        return `
        <a href="viewer.html?area=${folder}" class="area-card">
            ${thumb}
            <div class="card-info">
                <div class="card-name">${areaName}</div>
                <div class="card-meta">${slides.length}枚のスライド${hasCaption ? ' · キャプション有' : ''}</div>
            </div>
        </a>`;
    }).join('');

    // ビューアページを生成
    const viewerHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TikTokスライドビューア</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#fff;font-family:-apple-system,system-ui,sans-serif;min-height:100vh}
.header{background:linear-gradient(135deg,#1a0030,#0a0a0f);padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.1)}
.header h1{font-size:16px;color:#25f4ee}
.back{display:inline-block;color:#888;font-size:13px;margin-bottom:10px;text-decoration:none}
.slides{padding:12px;display:flex;flex-direction:column;gap:10px}
.slide-item{width:100%;border-radius:10px;overflow:hidden;position:relative}
.slide-item img{width:100%;display:block}
.slide-num{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);font-size:11px;padding:6px;text-align:center}
.caption-section{padding:16px}
.caption-title{font-size:13px;color:#25f4ee;margin-bottom:8px;font-weight:700}
.caption-body{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px;font-size:12px;line-height:1.7;color:#ddd;white-space:pre-wrap;word-break:break-all}
</style>
</head>
<body>
<div class="header"><h1>📱 TikTokスライドビューア</h1></div>
<div id="content" style="padding:16px"><p style="color:#888">読み込み中...</p></div>
<script>
const p = new URLSearchParams(location.search);
const area = p.get('area') || '';
const base = area ? area + '/' : '';
fetch(base + 'caption.txt').then(r=>r.ok?r.text():null).catch(()=>null).then(caption => {
    const imgs = [];
    function tryNext(i) {
        const n = String(i+1).padStart(2,'0');
        const img = new Image();
        img.onload = () => {
            imgs.push({src: base+'slide_'+n+'.png', i});
            tryNext(i+1);
        };
        img.onerror = () => {
            if(i===0) {
                document.getElementById('content').innerHTML = '<p style="color:#888">スライドが見つかりません</p>';
                return;
            }
            const slides = imgs.map((img,j)=>\`<div class="slide-item"><img src="\${img.src}" loading="lazy"><div class="slide-num">スライド \${j+1}/\${imgs.length} · 長押し→写真に追加</div></div>\`).join('');
            const cap = caption ? \`<div class="caption-section"><div class="caption-title">📝 キャプション（コピーして使用）</div><div class="caption-body">\${caption.replace(/</g,'&lt;')}</div></div>\` : '';
            document.getElementById('content').innerHTML = \`<a href="index.html" class="back">← 一覧に戻る</a><div class="slides">\${slides}</div>\${cap}\`;
        };
        img.src = base + 'slide_' + n + '.png';
    }
    tryNext(0);
});
</script>
</body></html>`;

    fs.writeFileSync(path.join(docsDir, 'viewer.html'), viewerHtml, 'utf8');

    // インデックスページ
    const indexHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TikTok コンテンツライブラリ</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#fff;font-family:-apple-system,system-ui,sans-serif;min-height:100vh}
.header{background:linear-gradient(135deg,#1a0030,#0a0a0f);padding:16px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1)}
.header h1{font-size:20px;color:#25f4ee;margin-bottom:4px}
.header p{font-size:12px;color:#888}
.grid{padding:12px;display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.area-card{display:block;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);text-decoration:none;color:#fff;background:rgba(255,255,255,0.03);transition:border-color 0.2s}
.area-card:hover{border-color:rgba(37,244,238,0.4)}
.thumb,.no-thumb{width:100%;aspect-ratio:4/5;object-fit:cover;display:block;background:#111}
.no-thumb{display:flex;align-items:center;justify-content:center;color:#555;font-size:12px}
.card-info{padding:8px 10px 10px}
.card-name{font-size:13px;font-weight:700;text-transform:capitalize;margin-bottom:3px}
.card-meta{font-size:10px;color:#888}
</style>
</head>
<body>
<div class="header">
    <h1>📱 TikTok コンテンツライブラリ</h1>
    <p>スライドをタップして保存・キャプションを取得</p>
</div>
<div class="grid">
    ${areaCards}
</div>
</body>
</html>`;

    fs.writeFileSync(path.join(docsDir, 'index.html'), indexHtml, 'utf8');
    log(`📄 GitHub Pages ビルド完了 → docs/ (${areaFolders.length}エリア)`);
}

function pushToGitHub() {
    log('\n🚀 GitHub にプッシュ中...');
    try {
        execSync('git add docs/', { cwd: __dirname, stdio: 'inherit' });
        execSync(`git commit -m "🌙 夜間バッチ生成: ${finalIds.join(', ')} (${new Date().toLocaleDateString('ja-JP')})"`, { cwd: __dirname, stdio: 'inherit' });
        execSync('git push origin main', { cwd: __dirname, stdio: 'inherit' });
        log('✅ GitHub Pages へのデプロイ完了！');

        // GitHub Pagesのデフォルトから推定されるURL表示
        try {
            const remote = execSync('git remote get-url origin', { cwd: __dirname }).toString().trim();
            const match = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
            if (match) {
                const user = match[1];
                const repo = match[2];
                log(`\n🌐 公開URL: https://${user}.github.io/${repo}/`);
                log('   ※ GitHub → Settings → Pages → Branch: main / /docs を設定してください（初回のみ）');
            }
        } catch (_) { }
    } catch (e) {
        log(`❌ プッシュ失敗: ${e.message}`);
    }
}

async function main() {
    console.log('\n' + '━'.repeat(55));
    console.log(`🌙 夜間バッチ生成 開始`);
    console.log(`   対象エリア: ${finalIds.join(', ')}`);
    console.log(`   GitHub Push: ${doPush ? 'あり' : 'なし (--push を付けると有効)'}`);
    console.log('━'.repeat(55) + '\n');

    for (const id of finalIds) {
        await runArea(id);
        await new Promise(r => setTimeout(r, 3000));
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);
    console.log('\n' + '━'.repeat(55));
    console.log(`🎉 全エリア生成完了！（所要時間: 約${elapsed}分）`);
    results.forEach(r => {
        const icon = r.status === 'success' ? '✅' : '❌';
        console.log(`   ${icon} エリア ${r.id}: ${r.status}`);
    });

    buildGitHubPages();

    if (doPush) {
        pushToGitHub();
    } else {
        log('\n💡 GitHub Pagesに公開するには:');
        log('   node night_batch.js --count 3 --push');
    }
    console.log('━'.repeat(55) + '\n');
}

main().catch(e => {
    console.error('❌ 致命的エラー:', e);
    process.exit(1);
});
