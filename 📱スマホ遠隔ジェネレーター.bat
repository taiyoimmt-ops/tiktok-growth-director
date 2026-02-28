@echo off
chcp 65001 > nul
title 📱 スマホ遠隔ジェネレーター
cd /d "%~dp0"

echo.
echo =====================================================
echo   📱 スマホ遠隔ジェネレーター 起動...
echo =====================================================
echo.
echo  AI自動考案 ＋ 投稿素材一気通貫バッチ
echo  スマホのブラウザから場所とテーマを入れるだけで
echo  全部自動で作成し、GitHub Pagesにデプロイします。
echo.

if "%GEMINI_API_KEY%"=="" (
    echo [⚠️警告] GEMINI_API_KEY が環境変数に設定されていません！
    echo Gemini APIキーを無料で取得してください： https://aistudio.google.com/app/apikey
    echo.
    set /p GEMINI_API_KEY="取得したGemini APIキーを貼り付けてEnterを押してください: "
    echo.
)

node mobile_app.js

pause
