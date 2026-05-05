@echo off
echo ============================================================
echo  360 Viewer — Local Server
echo  Open http://localhost:8000 in Chrome or Edge after launch
echo ============================================================
echo.

:: Try Python 3 first
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Starting with Python...
    python -m http.server 8000
    goto :end
)

:: Try python3 explicitly
python3 --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Starting with python3...
    python3 -m http.server 8000
    goto :end
)

:: Try npx serve
where npx >nul 2>&1
if %errorlevel% equ 0 (
    echo Starting with npx serve...
    npx serve . -p 8000
    goto :end
)

echo ERROR: Could not find Python or Node/npx.
echo Install Python from https://python.org or Node from https://nodejs.org
echo Then re-run this file.
pause

:end
