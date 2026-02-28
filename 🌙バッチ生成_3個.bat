@echo off
chcp 65001 > nul
title 🌙 バッチ生成【3個】実行中...
cd /d "%~dp0"
echo.
echo  未生成エリアを自動検出して【3個】生成します。
echo  ウィンドウを閉じないでください！（約60〜90分）
echo.
node night_batch.js --count 3 --push
echo.
echo  ✅ 完了！ https://taiyoimmt-ops.github.io/tiktok-growth-director/
echo.
pause
