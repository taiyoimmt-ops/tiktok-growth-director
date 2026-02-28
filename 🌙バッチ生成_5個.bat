@echo off
chcp 65001 > nul
title 🌙 バッチ生成【5個】実行中...
cd /d "%~dp0"
echo.
echo  未生成エリアを自動検出して【5個】生成します。
echo  ウィンドウを閉じないでください！（約2〜3時間）
echo.
node night_batch.js --count 5 --push
echo.
echo  ✅ 完了！ https://taiyoimmt-ops.github.io/tiktok-growth-director/
echo.
pause
