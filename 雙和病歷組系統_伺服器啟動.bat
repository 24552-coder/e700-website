@echo off
title SHH EMR E700 System Server (10.97.14.48)
cls
echo ============================================================
echo   SHH Hospital EMR E700 System Server
echo   Host IP: 10.97.14.48
echo   Connecting URL: http://10.97.14.48:8888
echo ============================================================
echo.
echo Starting server... Please keep this window open (minimize is OK).
echo.
python "%~dp0server.py"
pause
