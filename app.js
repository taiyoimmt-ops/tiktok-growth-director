/* ==========================================
   TikTok Growth Hacker - App Logic
   Content Automation Dashboard
   ========================================== */

// ===== State Management =====
const AppState = {
    currentSection: 'dashboard',
    currentSlide: 1,
    totalSlides: 10,
    researchData: null,
    isResearching: false,
    spots: [],
    selectedArea: null,
};

// ===== Navigation =====
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        switchSection(section);
    });
});

function switchSection(sectionId) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-section="${sectionId}"]`)?.classList.add('active');

    // Update sections
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${sectionId}`)?.classList.add('active');

    // Update title
    const titles = {
        dashboard: 'ダッシュボード',
        research: 'トレンド・ディープリサーチ',
        generator: '画像生成エンジン',
        caption: 'キャプション生成',
        analytics: '成長分析',
    };
    document.getElementById('pageTitle').textContent = titles[sectionId] || sectionId;
    AppState.currentSection = sectionId;

    // Init analytics if switching to it
    if (sectionId === 'analytics') {
        initAnalytics();
    }
}

// ===== Mobile Menu =====
document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// ===== Area Research =====
function startResearch(area) {
    AppState.selectedArea = area;
    document.getElementById('researchArea').value = area;
    switchSection('research');
    setTimeout(() => executeResearch(), 300);
}

function showCustomArea() {
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

function addCustomArea() {
    const name = document.getElementById('customAreaName').value.trim();
    const tag = document.getElementById('customAreaTag').value.trim();
    const emoji = document.getElementById('customAreaEmoji').value.trim() || '📍';

    if (!name) {
        showToast('エリア名を入力してください', 'warning');
        return;
    }

    // Add to grid
    const grid = document.getElementById('areaGrid');
    const customBtn = grid.querySelector('.area-card-custom');
    const newCard = document.createElement('button');
    newCard.className = 'area-card';
    newCard.dataset.area = name;
    newCard.onclick = () => startResearch(name);
    newCard.innerHTML = `
        <div class="area-emoji">${emoji}</div>
        <span class="area-name">${name}</span>
        <span class="area-tag">${tag || 'カスタム'}</span>
    `;
    grid.insertBefore(newCard, customBtn);

    closeModal();
    showToast(`${emoji} ${name} を追加しました`, 'success');
    startResearch(name);
}

// ===== Research Engine =====
async function executeResearch() {
    const area = document.getElementById('researchArea').value.trim();
    if (!area) {
        showToast('エリアを入力してください', 'warning');
        return;
    }

    AppState.selectedArea = area;
    AppState.isResearching = true;

    // Show loading
    document.getElementById('researchResults').style.display = 'none';
    document.getElementById('researchLoading').style.display = 'block';

    // Update pipeline on dashboard
    updatePipeline(area, 'researching');

    // Simulate research steps
    const steps = document.querySelectorAll('#loadingSteps .step');
    for (let i = 0; i < steps.length; i++) {
        steps[i].classList.add('active');
        if (i > 0) steps[i - 1].classList.remove('active');
        if (i > 0) steps[i - 1].classList.add('complete');
        await sleep(1500);
    }
    steps[steps.length - 1].classList.remove('active');
    steps[steps.length - 1].classList.add('complete');

    // Generate mock research data
    const spots = generateResearchData(area);
    AppState.spots = spots;

    // Hide loading, show results
    document.getElementById('researchLoading').style.display = 'none';
    document.getElementById('researchResults').style.display = 'block';

    // Render spots
    renderSpots(spots);

    // Update pipeline
    updatePipeline(area, 'research-complete');

    AppState.isResearching = false;
    showToast(`${area} のリサーチが完了しました！`, 'success');

    // Auto-generate caption
    generateCaption(area, spots);
}

function generateResearchData(area) {
    // 実データベースが利用可能ならそちらを使用
    if (typeof REAL_SPOTS_DB !== 'undefined' && REAL_SPOTS_DB[area]) {
        showToast(`📍 ${area} の実データを読み込みました（Google Maps調査済み）`, 'info');
        return REAL_SPOTS_DB[area];
    }

    // フォールバック: 未調査エリア用デフォルトデータ
    const defaultSpots = [
        {
            name: `${area} 隠れ家カフェ MOCHA`,
            address: `${area}エリア中心部`,
            budget: '¥600〜¥1,200',
            budgetMin: 600,
            budgetMax: 1200,
            rating: 4.5,
            reviewCount: '未調査',
            category: 'カフェ',
            merits: ['地元民しか知らない隠れ家的存在', 'オリジナルドリンクが映える', '落ち着いた雰囲気で長居OK'],
            demerit: '席数が少なく満席率が高い',
            secret: 'このエリアはまだ未調査です。Google Mapsリサーチを実行してください。',
            source: '未調査',
            verified: false,
        },
    ];

    showToast(`⚠️ ${area} は未調査です。Google Mapsリサーチが必要です`, 'warning');
    return defaultSpots;
}

function renderSpots(spots) {
    const grid = document.getElementById('spotsGrid');
    grid.innerHTML = '';

    spots.forEach((spot, i) => {
        const card = document.createElement('div');
        card.className = 'spot-card';
        card.style.animationDelay = `${i * 0.1}s`;

        const reviewBadge = spot.reviewCount && spot.reviewCount !== '未調査'
            ? `<span class="review-count">💬 ${spot.reviewCount}件</span>`
            : '';

        const verifiedBadge = spot.verified
            ? `<span class="verified-badge">✅ 実査済み</span>`
            : `<span class="unverified-badge">⚠️ 未調査</span>`;

        const screenshotBtn = spot.screenshotPath
            ? `<button class="btn-screenshot" onclick="showScreenshot('${spot.screenshotPath}', '${spot.name}')">📸 Google Maps表示</button>`
            : '';

        const sourceInfo = spot.source
            ? `<div class="spot-source">📋 ${spot.source}</div>`
            : '';

        card.innerHTML = `
            <div class="spot-image" style="background: linear-gradient(135deg, ${getGradientColor(i)} 0%, ${getGradientColor(i + 2)} 100%);">
                <span class="spot-badge">${spot.category}</span>
                <span class="spot-rating">⭐ ${spot.rating}</span>
                ${reviewBadge}
            </div>
            <div class="spot-body">
                <div class="spot-header-row">
                    <div class="spot-name">${spot.name}</div>
                    ${verifiedBadge}
                </div>
                <div class="spot-address">📍 ${spot.address}</div>
                <div class="spot-meta">
                    <div class="spot-budget">💰 ${spot.budget}</div>
                    ${spot.reviewCount ? `<div class="spot-reviews">💬 口コミ${spot.reviewCount}件</div>` : ''}
                </div>
                <div class="spot-merits">
                    <h5>メリット</h5>
                    <ul class="merit-list">
                        ${spot.merits.map(m => `<li>${m}</li>`).join('')}
                        <li class="demerit">${spot.demerit}</li>
                    </ul>
                </div>
                <div class="spot-secret">
                    <h5>🤫 裏情報</h5>
                    <p>${spot.secret}</p>
                </div>
                ${sourceInfo}
                ${screenshotBtn}
            </div>
        `;
        grid.appendChild(card);
    });
}

// ===== Screenshot Modal =====
function showScreenshot(path, name) {
    const modal = document.getElementById('screenshotModal');
    const img = document.getElementById('screenshotImage');
    const title = document.getElementById('screenshotTitle');

    img.src = path;
    title.textContent = `📸 ${name} - Google Maps`;
    modal.classList.add('active');
}

function closeScreenshotModal() {
    document.getElementById('screenshotModal').classList.remove('active');
}

document.getElementById('screenshotModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'screenshotModal') closeScreenshotModal();
});

function getGradientColor(index) {
    const colors = [
        'rgba(255, 45, 85, 0.6)',
        'rgba(37, 244, 238, 0.6)',
        'rgba(124, 58, 237, 0.6)',
        'rgba(59, 130, 246, 0.6)',
        'rgba(16, 185, 129, 0.6)',
        'rgba(245, 158, 11, 0.6)',
        'rgba(239, 68, 68, 0.6)',
    ];
    return colors[index % colors.length];
}

// ===== Pipeline Update =====
function updatePipeline(area, status) {
    const timeline = document.getElementById('pipelineTimeline');

    if (status === 'researching') {
        timeline.innerHTML = `
            <div class="pipeline-item">
                <span class="pipeline-dot active"></span>
                <div class="pipeline-info">
                    <h4>🔍 ${area} リサーチ中...</h4>
                    <p>TikTokトレンド分析 & Googleマップスポット抽出</p>
                </div>
                <span class="pipeline-time">進行中</span>
            </div>
            <div class="pipeline-item">
                <span class="pipeline-dot pending"></span>
                <div class="pipeline-info">
                    <h4>🎨 画像生成</h4>
                    <p>10枚構成のフォトモード画像</p>
                </div>
                <span class="pipeline-time">待機中</span>
            </div>
            <div class="pipeline-item">
                <span class="pipeline-dot pending"></span>
                <div class="pipeline-info">
                    <h4>✍️ キャプション生成</h4>
                    <p>SEO最適化1000文字キャプション</p>
                </div>
                <span class="pipeline-time">待機中</span>
            </div>
        `;
    } else if (status === 'research-complete') {
        timeline.innerHTML = `
            <div class="pipeline-item">
                <span class="pipeline-dot complete"></span>
                <div class="pipeline-info">
                    <h4>✅ ${area} リサーチ完了</h4>
                    <p>${AppState.spots.length}件のスポットを発見</p>
                </div>
                <span class="pipeline-time">完了</span>
            </div>
            <div class="pipeline-item">
                <span class="pipeline-dot active"></span>
                <div class="pipeline-info">
                    <h4>🎨 画像生成 準備完了</h4>
                    <p>「画像生成」タブで構成を確認してください</p>
                </div>
                <span class="pipeline-time">準備完了</span>
            </div>
            <div class="pipeline-item">
                <span class="pipeline-dot complete"></span>
                <div class="pipeline-info">
                    <h4>✅ キャプション自動生成完了</h4>
                    <p>「キャプション」タブで確認・編集できます</p>
                </div>
                <span class="pipeline-time">完了</span>
            </div>
        `;
    }
}

// ===== Caption Generator =====
function generateCaption(area, spots) {
    const spotNames = spots.map(s => s.name).join('、');
    const hashtags = [
        `#${area}`,
        `#${area}旅行`,
        `#${area}グルメ`,
        '#隠れ家カフェ',
        '#教えたくない場所',
        '#永久保存版',
        '#コスパ最強',
        '#旅行好きな人と繋がりたい',
        '#TikTok旅行',
        '#学生旅行',
        '#国内旅行',
        '#カフェ巡り',
        '#穴場スポット',
        '#週末旅行',
        '#デートスポット',
    ];

    const caption = `【${area}で本当は教えたくない${spots.length}選】

「え、こんな場所あったの？」
地元民が隠してた${area}の穴場を全部暴露します。

${spots.map((s, i) => `${i + 1}. ${s.name}
💰 ${s.budget} ⭐${s.rating}
→ ${s.merits[0]}
🤫 ${s.secret.substring(0, 40)}...`).join('\n\n')}

──────────────

⚠️ ぶっちゃけ${spots[0].name}は予約取れなくなるんで本当は教えたくないです。
でも${spots[1].name}の方がコスパは上かも？
皆はどっち派？コメントで教えて👇

──────────────

📌 保存して次の旅行で行ってみて！
📍 詳しい情報はプロフィールのリンクから

${hashtags.join(' ')}`;

    document.getElementById('captionText').value = caption;
    updateCharCount();

    // Update trigger
    document.getElementById('triggerContent').innerHTML = `
        <p>「ぶっちゃけ${spots[0].name}は予約取れなくなるんで教えたくないです」<br>
        → 「いや、○○の方がいいでしょ」とコメントを誘発</p>
    `;

    // Update BGM
    document.getElementById('bgmList').innerHTML = `
        <div class="bgm-item">
            <span class="bgm-rank">1</span>
            <div class="bgm-info">
                <span class="bgm-name">Cupid (Twin Ver.)</span>
                <span class="bgm-artist">FIFTY FIFTY / 旅行系で使用率1位</span>
            </div>
        </div>
        <div class="bgm-item">
            <span class="bgm-rank">2</span>
            <div class="bgm-info">
                <span class="bgm-name">Beautiful Things</span>
                <span class="bgm-artist">Benson Boone / エモい雰囲気に最適</span>
            </div>
        </div>
        <div class="bgm-item">
            <span class="bgm-rank">3</span>
            <div class="bgm-info">
                <span class="bgm-name">Suzume</span>
                <span class="bgm-artist">RADWIMPS / 日本の風景と相性抜群</span>
            </div>
        </div>
    `;

    // Update hashtags
    document.getElementById('hashtagCloud').innerHTML = hashtags
        .map(h => `<span class="hashtag">${h}</span>`)
        .join('');
}

function updateCharCount() {
    const text = document.getElementById('captionText').value;
    document.getElementById('charCount').textContent = text.length;
}

document.getElementById('captionText')?.addEventListener('input', updateCharCount);

function regenerateCaption() {
    if (!AppState.spots.length) {
        showToast('先にリサーチを実行してください', 'warning');
        return;
    }
    generateCaption(AppState.selectedArea, AppState.spots);
    showToast('キャプションを再生成しました', 'success');
}

function copyCaption() {
    const text = document.getElementById('captionText').value;
    navigator.clipboard.writeText(text).then(() => {
        showToast('キャプションをコピーしました！', 'success');
    }).catch(() => {
        // Fallback
        const textarea = document.getElementById('captionText');
        textarea.select();
        document.execCommand('copy');
        showToast('キャプションをコピーしました！', 'success');
    });
}

// ===== Image Generator =====
function generateImages() {
    switchSection('generator');
    if (AppState.spots.length) {
        updateSlidePreview(1);
    }
}

function generateAllSlides() {
    if (!AppState.spots.length) {
        showToast('先にリサーチを実行してください', 'warning');
        return;
    }

    const items = document.querySelectorAll('.slide-item');
    let current = 0;

    const interval = setInterval(() => {
        if (current >= items.length) {
            clearInterval(interval);
            showToast('全10枚の画像生成が完了しました！🎉', 'success');
            return;
        }

        // Update status
        if (current > 0) {
            items[current - 1].querySelector('.slide-status').className = 'slide-status complete';
            items[current - 1].querySelector('.slide-status').textContent = '完了';
        }

        items[current].querySelector('.slide-status').className = 'slide-status generating';
        items[current].querySelector('.slide-status').textContent = '生成中...';

        updateSlidePreview(current + 1);
        current++;
    }, 800);
}

function updateSlidePreview(slideNum) {
    AppState.currentSlide = slideNum;
    document.getElementById('currentSlide').textContent = slideNum;

    // Update dots
    document.querySelectorAll('.slide-nav-dots .dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === slideNum - 1);
    });

    // Update slide items
    document.querySelectorAll('.slide-item').forEach((item, i) => {
        item.classList.toggle('active', i === slideNum - 1);
    });

    // Update preview content
    const screen = document.querySelector('.mockup-screen');
    const area = AppState.selectedArea || '箱根';
    const spots = AppState.spots;

    const slideContents = {
        1: `
            <div style="width:100%;height:100%;background:linear-gradient(135deg,#1a1a2e,#16213e);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;">
                <div style="font-size:14px;color:#ff2d55;font-weight:800;margin-bottom:8px;letter-spacing:2px;">⚠️ 永久保存版 ⚠️</div>
                <div style="font-size:28px;font-weight:900;color:white;line-height:1.3;margin-bottom:12px;">本当は<br>教えたくない<br><span style="color:#25f4ee;">${area}</span>の<br>穴場${spots.length}選</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:16px;">知ったら最後、行きたくなる...</div>
                <div style="position:absolute;bottom:100px;left:0;right:0;display:flex;justify-content:center;gap:8px;">
                    ${spots.slice(0, 5).map((_, i) => `<div style="width:40px;height:40px;border-radius:8px;background:${getGradientColor(i)};"></div>`).join('')}
                </div>
            </div>
        `,
        7: `
            <div style="width:100%;height:100%;background:#1a1a2e;padding:24px;display:flex;flex-direction:column;">
                <div style="font-size:16px;font-weight:800;color:white;margin-bottom:16px;text-align:center;">📊 徹底比較表</div>
                <table style="width:100%;border-collapse:collapse;font-size:10px;color:white;">
                    <tr style="background:rgba(255,45,85,0.2);">
                        <th style="padding:8px 4px;text-align:left;">店名</th>
                        <th style="padding:8px 4px;">予算</th>
                        <th style="padding:8px 4px;">評価</th>
                        <th style="padding:8px 4px;">おすすめ</th>
                    </tr>
                    ${spots.map((s, i) => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:8px 4px;font-weight:600;">${s.name.substring(0, 10)}</td>
                            <td style="padding:8px 4px;text-align:center;color:#25f4ee;">${s.budget}</td>
                            <td style="padding:8px 4px;text-align:center;">⭐${s.rating}</td>
                            <td style="padding:8px 4px;text-align:center;">${'★'.repeat(Math.floor(s.rating))}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `,
        9: `
            <div style="width:100%;height:100%;background:linear-gradient(135deg,#ff2d55,#7c3aed);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;">
                <div style="font-size:48px;margin-bottom:16px;">🔖</div>
                <div style="font-size:28px;font-weight:900;color:white;line-height:1.4;">ここに行きたい人は<br>今すぐ<span style="text-decoration:underline;">保存</span>！</div>
                <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:16px;">保存しておけば旅行計画に役立ちます 📌</div>
            </div>
        `,
        10: `
            <div style="width:100%;height:100%;background:#0a0a0f;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;">
                <div style="font-size:20px;font-weight:800;color:white;margin-bottom:12px;">もっと詳しい情報は...</div>
                <div style="font-size:16px;color:#25f4ee;font-weight:700;margin-bottom:24px;">👆 プロフィールのリンクから 👆</div>
                <div style="width:80px;height:80px;background:linear-gradient(135deg,#25f4ee,#ff2d55);border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:16px;">🔗</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.5);">フォローで最新の穴場情報をGET</div>
            </div>
        `,
    };

    // For spot detail slides (2-6)
    if (slideNum >= 2 && slideNum <= 6) {
        const spotIdx = slideNum - 2;
        if (spots[spotIdx]) {
            const spot = spots[spotIdx];
            screen.innerHTML = `
                <div style="width:100%;height:100%;background:linear-gradient(180deg,${getGradientColor(spotIdx)} 0%,#1a1a2e 60%);display:flex;flex-direction:column;padding:24px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:auto;">
                        <span style="background:rgba(0,0,0,0.5);color:white;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">${spot.category}</span>
                        <span style="background:rgba(255,45,85,0.9);color:white;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">⭐ ${spot.rating}</span>
                    </div>
                    <div style="margin-top:auto;color:white;">
                        <div style="font-size:10px;color:rgba(255,255,255,0.6);margin-bottom:4px;">#${spotIdx + 1}</div>
                        <div style="font-size:22px;font-weight:900;margin-bottom:8px;">${spot.name}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-bottom:12px;">📍 ${spot.address}</div>
                        <div style="background:rgba(37,244,238,0.15);color:#25f4ee;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:700;display:inline-block;margin-bottom:12px;">💰 ${spot.budget}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.9);line-height:1.6;">
                            ${spot.merits.map(m => `✓ ${m}`).join('<br>')}
                        </div>
                        <div style="background:rgba(255,45,85,0.1);border-left:3px solid #ff2d55;padding:8px 10px;margin-top:10px;border-radius:0 6px 6px 0;">
                            <div style="font-size:9px;color:#ff2d55;font-weight:700;margin-bottom:2px;">🤫 裏情報</div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.8);line-height:1.4;">${spot.secret.substring(0, 60)}...</div>
                        </div>
                    </div>
                </div>
            `;
            return;
        }
    }

    // For map slide
    if (slideNum === 8) {
        screen.innerHTML = `
            <div style="width:100%;height:100%;background:#1a1a2e;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;">
                <div style="font-size:16px;font-weight:800;color:white;margin-bottom:16px;">📍 おすすめルートマップ</div>
                <div style="width:90%;aspect-ratio:1;background:rgba(255,255,255,0.05);border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative;">
                    <div style="font-size:48px;opacity:0.3;">🗺️</div>
                    ${spots.map((_, i) => {
            const angle = (i / spots.length) * Math.PI * 2;
            const x = 50 + Math.cos(angle) * 30;
            const y = 50 + Math.sin(angle) * 30;
            return `<div style="position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);width:24px;height:24px;background:#ff2d55;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:800;">${i + 1}</div>`;
        }).join('')}
                </div>
                <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:12px;">効率よく回れるルートを表示</div>
            </div>
        `;
        return;
    }

    screen.innerHTML = slideContents[slideNum] || `
        <div style="width:100%;height:100%;background:#1a1a2e;display:flex;align-items:center;justify-content:center;">
            <div style="text-align:center;color:rgba(255,255,255,0.3);">
                <div style="font-size:48px;margin-bottom:16px;">📸</div>
                <div style="font-size:14px;">スライド ${slideNum}</div>
            </div>
        </div>
    `;
}

// Slide navigation
document.getElementById('prevSlide')?.addEventListener('click', () => {
    if (AppState.currentSlide > 1) {
        updateSlidePreview(AppState.currentSlide - 1);
    }
});

document.getElementById('nextSlide')?.addEventListener('click', () => {
    if (AppState.currentSlide < AppState.totalSlides) {
        updateSlidePreview(AppState.currentSlide + 1);
    }
});

// Slide list click
document.querySelectorAll('.slide-item').forEach(item => {
    item.addEventListener('click', () => {
        const slideNum = parseInt(item.dataset.slide);
        updateSlidePreview(slideNum);
    });
});

// ===== Export to Sheets =====
function exportToSheets() {
    if (!AppState.spots.length) {
        showToast('先にリサーチを実行してください', 'warning');
        return;
    }

    // Generate CSV data
    const headers = ['エリア', '名称', '住所', '予算', 'カテゴリ', '評価', 'メリット1', 'メリット2', 'メリット3', 'デメリット', '裏情報'];
    const rows = AppState.spots.map(s => [
        AppState.selectedArea,
        s.name,
        s.address,
        s.budget,
        s.category,
        s.rating,
        s.merits[0] || '',
        s.merits[1] || '',
        s.merits[2] || '',
        s.demerit,
        s.secret
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TikTok_Content_DB_${AppState.selectedArea}_${getDateStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('CSVファイルをダウンロードしました（Google Sheetsで開けます）', 'success');
}

// ===== Analytics =====
function initAnalytics() {
    drawGrowthChart();
    drawPerformanceChart();
    generateCalendar();
}

function drawGrowthChart() {
    const canvas = document.getElementById('growthCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    const w = rect.width;
    const h = rect.height;

    // Target growth curve (exponential)
    const days = 30;
    const target = 10000;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartH / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();

        // Labels
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '10px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(target - (target / 5) * i).toLocaleString(), padding.left - 8, y + 4);
    }

    // X labels
    ctx.textAlign = 'center';
    for (let i = 0; i <= 6; i++) {
        const day = Math.round((days / 6) * i);
        const x = padding.left + (chartW / 6) * i;
        ctx.fillText(`Day ${day}`, x, h - 8);
    }

    // Target line (exponential)
    ctx.beginPath();
    const gradient = ctx.createLinearGradient(padding.left, 0, w - padding.right, 0);
    gradient.addColorStop(0, '#25f4ee');
    gradient.addColorStop(1, '#ff2d55');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    for (let i = 0; i <= days; i++) {
        const x = padding.left + (chartW / days) * i;
        const followers = target * Math.pow(i / days, 2.5);
        const y = padding.top + chartH - (followers / target) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Current progress (first few days)
    ctx.beginPath();
    ctx.strokeStyle = '#25f4ee';
    ctx.lineWidth = 3;
    const currentDay = 1;
    for (let i = 0; i <= currentDay; i++) {
        const x = padding.left + (chartW / days) * i;
        const followers = 0;
        const y = padding.top + chartH - (followers / target) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    ctx.fillStyle = 'rgba(37, 244, 238, 0.8)';
    ctx.font = 'bold 11px Inter';
    ctx.textAlign = 'left';
    ctx.fillText('目標ライン', w - padding.right - 60, padding.top + 15);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px Noto Sans JP';
    ctx.fillText('現在: Day 1', padding.left + 10, h - padding.bottom - 10);
}

function drawPerformanceChart() {
    const canvas = document.getElementById('performanceCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 20, right: 20, bottom: 40, left: 20 };

    // Placeholder bars
    const labels = ['投稿1', '投稿2', '投稿3', '投稿4', '投稿5'];
    const barWidth = ((w - padding.left - padding.right) / labels.length) * 0.6;
    const gap = ((w - padding.left - padding.right) / labels.length) * 0.4;

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px Noto Sans JP';
    ctx.textAlign = 'center';

    labels.forEach((label, i) => {
        const x = padding.left + (barWidth + gap) * i + gap / 2;
        const barH = 20;
        const y = h - padding.bottom - barH;

        // Bar
        const barGrad = ctx.createLinearGradient(0, y, 0, y + barH);
        barGrad.addColorStop(0, 'rgba(37, 244, 238, 0.3)');
        barGrad.addColorStop(1, 'rgba(255, 45, 85, 0.3)');
        ctx.fillStyle = barGrad;
        ctx.fillRect(x, y, barWidth, barH);

        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(label, x + barWidth / 2, h - 15);
    });

    // Center message
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '14px Noto Sans JP';
    ctx.textAlign = 'center';
    ctx.fillText('投稿後にデータが表示されます', w / 2, h / 2);
}

function generateCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const days = ['月', '火', '水', '木', '金', '土', '日'];
    days.forEach(d => {
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = d;
        grid.appendChild(header);
    });

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = now.getDate();

    // Adjust for Monday start
    const startOffset = (firstDay + 6) % 7;

    // Empty days
    for (let i = 0; i < startOffset; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        grid.appendChild(empty);
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
        const day = document.createElement('div');
        day.className = 'calendar-day';
        if (d === today) day.classList.add('today');
        day.textContent = d;
        grid.appendChild(day);
    }
}

// ===== Utility Functions =====
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getDateStr() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    // Animate KPI counters
    animateCounter('kpiFollowers', 0, 0, 1000);
    animateCounter('kpiSaves', 0, 0, 1000);
    animateCounter('kpiPosts', 0, 0, 1000);

    // Caption char count
    updateCharCount();
});

function animateCounter(elementId, start, end, duration) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const range = end - start;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + range * eased);
        element.textContent = current.toLocaleString();

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

// Editor toolbar
document.querySelectorAll('.toolbar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.toolbar-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// Close modal on overlay click
document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});
