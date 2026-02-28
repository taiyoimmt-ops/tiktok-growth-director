@echo off
chcp 65001 > nul
title 🧹 投稿後クリーンアップ
cd /d "%~dp0"

echo.
echo =====================================================
echo   🧹 投稿後クリーンアップ
echo =====================================================
echo.
echo 以下のフォルダ・ファイルを削除します：
echo   ✂️  content_library\ の各エリアフォルダ（画像・スライド）
echo   ✂️  ready_to_post_zips\ の ZIPファイル
echo   ✂️  docs\ の一時コピー
echo   ✂️  テスト残骸ファイル（test_*.js, test_images.json）
echo.
echo ⚠️  スクリプト・設定・テンプレートは消しません！
echo.
set /p confirm="本当に削除しますか？ (y/n): "
if /i not "%confirm%"=="y" (
    echo キャンセルしました。
    pause
    exit /b
)

echo.
echo 🗑️  削除中...

REM content_library の各エリアフォルダを削除（フォルダ自体は残す）
if exist content_library\ (
    for /d %%d in (content_library\*) do (
        echo   - %%d を削除
        rd /s /q "%%d"
    )
    echo   ✅ content_library\ クリア完了
)

REM ready_to_post_zips の ZIP を削除
if exist ready_to_post_zips\ (
    del /q "ready_to_post_zips\*.zip" 2>nul
    echo   ✅ ready_to_post_zips\ クリア完了
)

REM docs フォルダを削除（GitHub に push 済みなら不要）
if exist docs\ (
    rd /s /q docs\
    echo   ✅ docs\ 削除完了
)

REM テスト残骸を削除
del /q "test_*.js" 2>nul
del /q "test_images.json" 2>nul
del /q "error.log" 2>nul
echo   ✅ テスト残骸 削除完了

echo.
echo =====================================================
echo   ✅ クリーンアップ完了！
echo   スクリプト・設定・テンプレートは安全です。
echo   次のバッチ生成の準備ができました！
echo =====================================================
echo.
pause
