@echo off
chcp 65001 > nul
title 🌙 バッチ生成【10個】実行中...
cd /d "%~dp0"
echo.
echo  未生成エリアを自動検出して【10個】生成します。
echo  ウィンドウを閉じないでください！（約5〜7時間）
echo  就寝前に起動して朝まで放置推奨です。
echo.
node night_batch.js --count 10 --push
echo.
echo  ✅ 完了！ https://taiyoimmt-ops.github.io/tiktok-growth-director/
echo.
pause
