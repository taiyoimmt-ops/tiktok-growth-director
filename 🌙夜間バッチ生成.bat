@echo off
chcp 65001 > nul
title 🌙 夜間バッチ生成中...
cd /d "%~dp0"

echo.
echo =====================================================
echo   🌙 TikTok 夜間バッチ生成 + GitHub Pages公開
echo   対象: 京都嵐山(009) 大阪なんば(010) 箱根(011)
echo =====================================================
echo.
echo ⚠️  このウィンドウを閉じないでください！
echo     生成完了まで約60〜90分かかります。
echo     寝てる間に全部終わります。
echo.

node night_batch.js 009 010 011 --push

echo.
echo =====================================================
echo   ✅ 全て完了！
echo   👉 https://taiyoimmt-ops.github.io/tiktok-growth-director/
echo   を iPhoneで開いてスライドを保存してください。
echo =====================================================
echo.
pause
