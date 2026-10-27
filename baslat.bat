@echo off
title RoWorld - Yerel Ag Sunucusu
color 0b
cls

echo ================================================================
echo           ROWORLD - WEB / OKUL / YEREL AG BASLATICI
echo ================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Node.js bulunamadi!
    echo Lutfen https://nodejs.org adresinden Node.js kurun.
    pause
    exit /b
)

echo [1/2] Sunucu baslatiliyor...
start "RoWorld Sunucusu" cmd /k "node server.js"

echo [2/2] Tarayicida aciliyor...
timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
echo ================================================================
echo  Oyun basariyla acildi!
echo  Okulda internetsiz oynamak icin biriniz Hotspot acsin,
echo  arkadaslariniz o Wi-Fi'ye baglanip konsoldaki IP adresini girsin!
echo ================================================================
echo.
pause
