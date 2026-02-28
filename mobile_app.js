const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const qrcode = require('qrcode-terminal');
const { auditSpots } = require('./spot_auditor');

const PORT = 3002;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let activeTask = null;

// IP取得
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function callGemini(location, theme, custom) {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return reject(new Error('GEMINI_API_KEY環境変数が設定されていません。（Windowsの環境変数に設定して再起動するか、コマンドプロンプトからセットしてください）'));

        let prompt = `あなたは「TikTokディレクターエージェント」です。TikTokでバズる"穴場スポットまとめ"の台本データを1エリア作成してください。
        必ず、指示されたルールと出力JSONフォーマットを厳守してください。
        
        【指示内容】
        地名: ${location || 'おまかせ（今話題のニッチな観光地や若者にウケる場所）'}
        テーマ: ${theme || 'おまかせ（デート、グルメ、絶景などバズる切り口）'}
        カスタム指示: ${custom || '特になし'}
        
        【絶対ルール】
        1. spotsは必ず「5件」作成。
        2. 各スポットのnameは実際にある店舗や施設名（捏造厳禁）。
        3. search は画像検索用の適切な単語。
        4. merits は必ず3つの配列。
        5. demerit は1つの短い注意点。
        6. secret は「知る人ぞ知るTikTokでドヤれる裏情報」。
        7. 実際の評価数値やレビュー数はシステム側でGoogleからリアルタイム取得するため、AIは「妥当な予測値」を入力して良いが、店舗名が間違っているとエラーになるため注意すること。
        8. 余計なマークダウンや説明は一切含めず、「以下のJSONデータのみ」を出力すること。\`\`\`json などのタグも不要。

        【必須JSONフォーマット】
        {
            "area": "地名の短い名前（例: 渋谷）",
            "title": "サムネイルに入るタイトル（例: 渋谷の圧倒的穴場5選）",
            "folder": "000_shibuya_anaba (先頭に000_をつけ英語で)",
            "landmark": "地名を表す有名な場所（例: 渋谷スクランブル交差点）",
            "landmark_search": "渋谷 スクランブル交差点 夜景",
            "category_focus": "カフェ・絶景 などまとめ",
            "spots": [
                {
                    "name": "店舗名または施設名",
                    "search": "店舗名 地名 料理 映え",
                    "category": "カテゴリ名（例: 隠れ家カフェ）",
                    "rating": 4.5,
                    "reviews": 1200,
                    "price": "〜¥2,000",
                    "merits": ["メリット1", "メリット2", "メリット3"],
                    "demerit": "デメリット（例: 席数が少ないなど）",
                    "secret": "裏情報"
                }
            ]
        }
        `;

        const reqBody = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7 }
        });

        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(reqBody)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error('OpenAI APIエラー: ' + body));
                }
                try {
                    const data = JSON.parse(body);
                    if (data.error) {
                        return reject(new Error('Gemini APIエラー: ' + data.error.message));
                    }
                    let content = data.candidates[0].content.parts[0].text.trim();
                    if (content.startsWith('```json')) content = content.replace(/^```json\n/, '').replace(/\n```$/, '');
                    if (content.startsWith('```')) content = content.replace(/^```\n/, '').replace(/\n```$/, '');
                    resolve(JSON.parse(content));
                } catch (e) {
                    reject(new Error('JSONパースエラー: ' + e.message + ' / 戻り値: ' + body.substring(0, 100)));
                }
            });
        });
        req.on('error', (e) => reject(e));
        req.write(reqBody);
        req.end();
    });
}

function processTask(location, theme, custom, resClient) {
    if (activeTask) {
        resClient.write('data: ' + JSON.stringify({ type: 'error', msg: '別の生成タスクが実行中です。' }) + '\n\n');
        return resClient.end();
    }
    activeTask = true;

    resClient.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const sendMsg = (msg, isDone = false) => {
        resClient.write('data: ' + JSON.stringify({ type: isDone ? 'done' : 'log', msg }) + '\n\n');
    };

    (async () => {
        try {
            // === Step 1: Gemini AI で企画を考案 ===
            sendMsg('🤖 1. Gemini AI に企画を考案させています...（約20秒）');
            const aiData = await callGemini(location, theme, custom);
            sendMsg(`✅ 企画ドラフト完成！ エリア: ${aiData.area} / タイトル: ${aiData.title}`);
            sendMsg(`   提案スポット: ${aiData.spots.map(s => s.name).join('、')}`);

            // === Step 2: 監査ループ（最大3回まで試みる） ===
            sendMsg('🕵️ 2. 監査システム起動中。GoogleマップでAIの提案を一件ずつ検証します...');

            const MAX_AUDIT_ROUNDS = 3;
            let approvedSpots = [];
            let remainingSpots = [...aiData.spots];
            let round = 0;

            while (approvedSpots.length < 5 && round < MAX_AUDIT_ROUNDS) {
                round++;
                sendMsg(`   [第${round}回監査] ${remainingSpots.length}件を検証中...`);

                const { approved, rejected } = await auditSpots(remainingSpots, aiData.area, null);
                approvedSpots = [...approvedSpots, ...approved];

                if (rejected.length > 0) {
                    const rejectedNames = rejected.map(r => `${r.spot.name}（${r.reason}）`).join('、');
                    sendMsg(`   ⚠️ 不合格 ${rejected.length}件を除外: ${rejectedNames}`);

                    if (approvedSpots.length < 5 && round < MAX_AUDIT_ROUNDS) {
                        const need = 5 - approvedSpots.length;
                        sendMsg(`   🔄 代替スポットを${need}件 Gemini に追加依頼中...`);
                        const extraCustom = `「${rejected.map(r => r.spot.name).join('、')}」は${r.reason}で不合格。代わりに${aiData.area}に実在する別の${need}件を必ず追加して。`;
                        const refill = await callGeminiExtra(aiData.area, aiData.category_focus, extraCustom, need);
                        remainingSpots = refill;
                    }
                } else {
                    break; // 全員合格
                }
            }

            // 最低3件ないとコンテンツが成立しないため中断
            if (approvedSpots.length < 3) {
                throw new Error(`監査の結果、合格スポットが${approvedSpots.length}件しかありませんでした。別のエリアやテーマで再試行してください。`);
            }

            // 5件に満たない場合は警告だけ出して続行
            if (approvedSpots.length < 5) {
                sendMsg(`   ⚠️ 合格スポットが${approvedSpots.length}件のみのためそのまま続行します。`);
            }
            aiData.spots = approvedSpots.slice(0, 5); // 最大5件
            sendMsg(`✅ 監査完了！ 合格スポット: ${aiData.spots.map(s => s.name).join('、')}`);

            // === Step 3: DB登録 ===
            sendMsg('📝 3. データベース（batch_areas.json）に登録中...');
            const batchPath = path.join(__dirname, 'batch_areas.json');
            const db = JSON.parse(fs.readFileSync(batchPath, 'utf8'));

            const lastIdStr = db.areas.length > 0 ? db.areas[db.areas.length - 1].id : '000';
            const newIdNum = parseInt(lastIdStr, 10) + 1;
            const newIdStr = String(newIdNum).padStart(3, '0');

            aiData.id = newIdStr;
            aiData.folder = aiData.folder.replace(/^000_/, `${newIdStr}_`);

            db.areas.push(aiData);
            fs.writeFileSync(batchPath, JSON.stringify(db, null, 4), 'utf8');

            // === Step 4: 生成エンジン起動 ===
            sendMsg(`🚀 4. TikTokスライド全自動生成エンジンを起動します（ID: ${newIdStr}）...`);

            const child = spawn('node', ['night_batch.js', '--count', '1', '--push'], { cwd: __dirname });

            child.stdout.on('data', (d) => {
                const text = d.toString().trim();
                if (text && (text.includes('✅') || text.includes('⚠️') || text.includes('🔍') || text.includes('🎉') || text.includes('ステップ') || text.includes('完了'))) {
                    sendMsg('  ' + text);
                }
            });

            child.stderr.on('data', (d) => {
                const text = d.toString().trim();
                if (text) sendMsg('  ⚠️ ' + text);
            });

            child.on('close', (code) => {
                if (code === 0) {
                    sendMsg(`🎉 自動生成 ＆ GitHubデプロイが完全に終了しました！`, true);
                } else {
                    sendMsg(`❌ 生成スクリプトがエラーコード ${code} で終了しました。`, true);
                }
                activeTask = null;
                resClient.end();
            });

        } catch (e) {
            console.error(e);
            resClient.write('data: ' + JSON.stringify({ type: 'error', msg: e.message }) + '\n\n');
            activeTask = null;
            resClient.end();
        }
    })();
}

/**
 * 追加スポットだけを指定件数Geminiに依頼する（監査失敗時の補充用）
 */
function callGeminiExtra(areaName, theme, exclusionNote, count) {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.GEMINI_API_KEY;
        const prompt = `あなたはTikTok向けスポット情報の専門家です。
「${areaName}」エリアのテーマ「${theme}」に合った、実在するスポットを必ず${count}件選んでください。
【重要】${exclusionNote}
出力形式: JSONの配列のみ。マークダウン不要。
[
  {
    "name": "店名",
    "search": "検索ワード 映え",
    "category": "カテゴリ",
    "rating": 4.0,
    "reviews": 500,
    "price": "〜¥2,000",
    "merits": ["merit1", "merit2", "merit3"],
    "demerit": "デメリット",
    "secret": "裏情報"
  }
]`;

        const reqBody = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.9 }
        });

        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(reqBody) }
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    let content = data.candidates[0].content.parts[0].text.trim();
                    content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '');
                    resolve(JSON.parse(content));
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(reqBody);
        req.end();
    });
}


const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>スマホ遠隔ジェネレーター</title>
    <style>
        body { background: #0a0a0f; color: #fff; font-family: -apple-system, sans-serif; padding: 20px; }
        h1 { font-size: 22px; color: #25f4ee; margin-bottom: 20px; text-align: center; }
        .card { background: rgba(255,255,255,0.05); padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1); }
        label { display: block; margin-bottom: 8px; font-size: 13px; color: #bbb; }
        input, textarea { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.5); color: #fff; font-size: 16px; margin-bottom: 16px; box-sizing: border-box; }
        button { width: 100%; padding: 16px; border-radius: 12px; border: none; background: linear-gradient(135deg, #25f4ee, #fe2c55); color: #fff; font-size: 18px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(37,244,238,0.3); transition: transform 0.2s; }
        button:active { transform: scale(0.96); }
        #logs { display: none; background: #000; font-family: monospace; font-size: 12px; padding: 16px; border-radius: 8px; white-space: pre-wrap; height: 300px; overflow-y: auto; color: #0f0; margin-bottom:20px; }
        
        .toggle-switch { display: inline-block; width: 50px; height: 24px; background: #333; border-radius: 12px; position: relative; cursor: pointer; vertical-align: middle; }
        .toggle-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: #fff; border-radius: 50%; transition: 0.2s; }
        .toggle-switch.active { background: #25f4ee; }
        .toggle-switch.active::after { left: 28px; }
        
        .result-btn { display:none; background: #333; margin-top:10px; text-align:center; text-decoration:none; color:#fff; display:block; padding:16px; border-radius:12px; border:1px solid #555; }
    </style>
</head>
<body>
    <h1>📱 スマホ遠隔ジェネレーター</h1>
    
    <div class="card" id="formCard">
        <p style="font-size:12px; color:#888; margin-bottom:15px; text-align:center;">
            何も入力せずに「おまかせ生成」も可能です。
        </p>

        <label>📍 地名（例: 福岡、江ノ島）</label>
        <input type="text" id="inpLoc" placeholder="空白でAIおまかせ">

        <label>🎭 テーマ・特徴（例: カフェ、海鮮、夜景）</label>
        <input type="text" id="inpTheme" placeholder="空白でAIおまかせ">

        <label>💡 カスタム指示（オプション）</label>
        <textarea id="inpCustom" rows="2" placeholder="絶対に海沿いのスポットを3つ入れてほしい など"></textarea>

        <button id="btnGen" onclick="startGeneration()">🚀 生成スタート</button>
    </div>

    <div id="logs"></div>
    <a href="https://taiyoimmt-ops.github.io/tiktok-growth-director/" target="_blank" class="result-btn" id="resBtn" style="display:none;">📤 GitHub Pages ギャラリーを開く</a>

    <script>
        // キャッシュパージ用URLを動的に生成
        function getGalleryUrl() {
            return "https://taiyoimmt-ops.github.io/tiktok-growth-director/?v=" + new Date().getTime();
        }
        document.getElementById('resBtn').href = getGalleryUrl();
        function startGeneration() {
            if(!confirm('TikTok素材の全自動生成を開始しますか？\\n※途中でPCを閉じないでください')) return;
            
            document.getElementById('formCard').style.display = 'none';
            const logs = document.getElementById('logs');
            logs.style.display = 'block';
            logs.innerText = '📡 サーバーにリクエスト送信中...\\n';
            
            const loc = encodeURIComponent(document.getElementById('inpLoc').value);
            const theme = encodeURIComponent(document.getElementById('inpTheme').value);
            const custom = encodeURIComponent(document.getElementById('inpCustom').value);
            
            const evtSource = new EventSource('/run?loc='+loc+'&theme='+theme+'&custom='+custom);
            
            evtSource.onmessage = function(e) {
                const data = JSON.parse(e.data);
                if (data.type === 'log') {
                    logs.innerText += data.msg + '\\n';
                    logs.scrollTop = logs.scrollHeight;
                } else if (data.type === 'error') {
                    logs.innerText += '❌ エラー: ' + data.msg + '\\n';
                    evtSource.close();
                } else if (data.type === 'done') {
                    logs.innerText += '\\n' + data.msg + '\\n';
                    evtSource.close();
                    document.getElementById('resBtn').style.display = 'block';
                }
            };
            
            evtSource.onerror = function() {
                logs.innerText += '\\n⚠️ サーバー接続が切れました。PC側の画面を確認してください。\\n';
                evtSource.close();
            };
        }
    </script>
</body>
</html>`);
        return;
    }

    if (req.method === 'GET' && req.url.startsWith('/run')) {
        const query = new URL(req.url, `http://${req.headers.host}`).searchParams;
        processTask(query.get('loc') || '', query.get('theme') || '', query.get('custom') || '', res);
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

const ip = getLocalIP();
let currentPort = PORT;

function startServer() {
    server.listen(currentPort, '0.0.0.0', () => {
        console.log('\n' + '━'.repeat(55));
        console.log(`📱 スマホ遠隔ジェネレーター 起動！`);
        console.log(`📡 URL: http://${ip}:${currentPort}`);
        console.log('\n🔲 スマホでQRコードを読み取ってください:\n');
        qrcode.generate(`http://${ip}:${currentPort}`, { small: true });

        if (!GEMINI_API_KEY) {
            console.log('\n⚠️ 注意: 環境変数 GEMINI_API_KEY が見つかりません。');
            console.log('AI自動考案機能を利用するにはコマンドプロンプト等でAPIキーを設定する必要があります。');
        }
        console.log('\n終了するには Ctrl+C を押してください...');
        console.log('━'.repeat(55) + '\n');
    });
}

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log(`⚠️ ポート ${currentPort} は使用中のため、別のポートを試します...`);
        currentPort++;
        setTimeout(startServer, 500);
    } else {
        console.error('致命的なサーバーエラー:', e);
    }
});

startServer();
