/**
 * 【超シンプル版】TikTok Growth Hacker - Google Apps Script
 *
 * 1. Google Sheetsを新規作成
 * 2. 拡張機能 → Apps Script を開く
 * 3. このコードをそのままコピペして保存
 * 4. 初回のみ「setupSheet」を実行してシートを作成
 */

// 初回セットアップ：必要なシートとヘッダーを作成する
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'TikTok投稿DB';
  
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  // 指定された5項目だけのシンプルなヘッダー
  const headers = ['エリア', '店名', '口コミ数', '投稿日', 'キャプション'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // 見やすくデザイン
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#2d1b69'); // ダークパープル
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  sheet.setRowHeight(1, 30);
  
  // 列幅を調整
  sheet.setColumnWidth(1, 100);  // エリア
  sheet.setColumnWidth(2, 250);  // 店名
  sheet.setColumnWidth(3, 150);  // 口コミ数
  sheet.setColumnWidth(4, 120);  // 投稿日
  sheet.setColumnWidth(5, 500);  // キャプション（広め）

  // キャプションや複数店名が改行で見えるように「折り返して表示」をオン
  sheet.getRange('A:E').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  
  // 古い不要なシートがあれば削除（シート1など）
  const sheets = ss.getSheets();
  if(sheets.length > 1) {
    sheets.forEach(s => {
      if(s.getName() !== sheetName) ss.deleteSheet(s);
    });
  }
  
  SpreadsheetApp.getUi().alert('✅ セットアップ完了！\n「TikTok投稿DB」シートが作成されました。');
}

// 外部からPOSTリクエストでデータを受け取って追記する関数
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('TikTok投稿DB');
    
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({ error: 'Sheet not found' }));

    // 行データを追加（指定された5項目）
    const row = [
      data.area || '',
      data.storeNames || '', // 複数ある場合は改行で送られてくる
      data.reviewCounts || '', // 複数ある場合は改行で送られてくる
      data.postDate || '',
      data.caption || ''
    ];
    
    sheet.appendRow(row);
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'Data added.' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// スプレッドシートを開いた時に専用メニューを追加
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📱 TikTok管理')
    .addItem('1. シートを初期化（セットアップ）', 'setupSheet')
    .addToUi();
}
