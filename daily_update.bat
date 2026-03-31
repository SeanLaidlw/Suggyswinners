@echo off
:: ============================================================
:: SuggysWinners - Daily Auto Update
:: Runs scraper, fixes distances, exports data, uploads to GitHub
:: ============================================================

set PROJECT_DIR=C:\Users\seanw\Documents\Horse Racing Project
set GITHUB_REPO=seanlaidlw/Suggyswinners
set LOG_FILE=%PROJECT_DIR%\update_log.txt
set PYTHON=python3

:: Log start time
echo. >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo Started: %DATE% %TIME% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

echo [1/5] Moving to project folder...
cd /d "%PROJECT_DIR%"
if errorlevel 1 (
    echo ERROR: Could not find project folder >> "%LOG_FILE%"
    exit /b 1
)

:: ---- Step 1: Run scraper ----
echo [2/5] Running scraper...
echo Running scraper... >> "%LOG_FILE%"
%PYTHON% scraper.py >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo ERROR: Scraper failed >> "%LOG_FILE%"
    echo Scraper failed - check update_log.txt for details
    exit /b 1
)
echo Scraper complete >> "%LOG_FILE%"

:: ---- Step 2: Fix distances ----
echo [3/5] Fixing missing distances...
echo Fixing distances... >> "%LOG_FILE%"
%PYTHON% fix_distances.py >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo WARNING: fix_distances had issues - continuing anyway >> "%LOG_FILE%"
)
echo Distance fix complete >> "%LOG_FILE%"

:: ---- Step 3: Export data ----
echo [4/5] Exporting database to data.js...
echo Exporting data... >> "%LOG_FILE%"
%PYTHON% export_data.py >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo ERROR: Export failed >> "%LOG_FILE%"
    echo Export failed - check update_log.txt for details
    exit /b 1
)
echo Export complete >> "%LOG_FILE%"

:: ---- Step 4: Upload to GitHub ----
echo [5/5] Uploading to GitHub...
echo Uploading to GitHub... >> "%LOG_FILE%"

:: Check git is available
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git not found. Install from https://git-scm.com >> "%LOG_FILE%"
    echo Git not found - see update_log.txt
    exit /b 1
)

:: Stage and commit data.js
git add data.js >> "%LOG_FILE%" 2>&1
git commit -m "Auto update: %DATE% %TIME%" >> "%LOG_FILE%" 2>&1
git push >> "%LOG_FILE%" 2>&1

if errorlevel 1 (
    echo WARNING: Git push may have failed - check update_log.txt
    echo Git push warning >> "%LOG_FILE%"
) else (
    echo Upload complete >> "%LOG_FILE%"
)

echo.
echo ============================================
echo  SuggysWinners updated successfully!
echo  Check update_log.txt for details
echo ============================================
echo Finished: %DATE% %TIME% >> "%LOG_FILE%"
