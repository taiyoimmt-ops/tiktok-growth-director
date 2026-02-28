# 🤖 auto_accept.ps1 — Alt+Enter 自動承認ボット
# VSCodeのAntigravityが表示する承認プロンプトを1秒ごとに自動承認する

Add-Type -AssemblyName System.Windows.Forms

$flagFile = Join-Path $PSScriptRoot ".auto_accept_running"

# フラグファイルを作成（実行中の印）
"running" | Out-File $flagFile -Encoding utf8

Write-Host ""
Write-Host "=================================================="
Write-Host "  🤖 自動承認ボット 起動中"
Write-Host "  Alt+Enter を 1秒ごとに送信します"
Write-Host "  停止するには 🛑自動承認_ストップ.bat を実行"
Write-Host "  または このウィンドウを閉じてください"
Write-Host "=================================================="
Write-Host ""

$count = 0
try {
    while (Test-Path $flagFile) {
        # Alt+Enter を送信
        [System.Windows.Forms.SendKeys]::SendWait("%{ENTER}")
        $count++
        
        # 10回ごとに生存確認
        if ($count % 10 -eq 0) {
            Write-Host "  ✅ 実行中... ($count 回送信済み)"
        }
        
        Start-Sleep -Milliseconds 1000
    }
} finally {
    # フラグファイルを削除
    if (Test-Path $flagFile) { Remove-Item $flagFile -Force }
    Write-Host ""
    Write-Host "  🛑 自動承認ボット 停止しました"
    Start-Sleep -Seconds 2
}
