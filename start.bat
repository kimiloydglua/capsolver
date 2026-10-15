@echo off
rem Double-click me. Runs setup on first launch, then shows a menu.
setlocal
cd /d "%~dp0"
title CapSolver

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then run this again.
  pause
  exit /b 1
)

if not exist node_modules goto setup
if not exist .env goto setup
goto menu

:setup
node scripts\setup.mjs
if errorlevel 1 (
  pause
  exit /b 1
)

:menu
echo.
echo  ==== CapSolver ====
echo   1. Show balance
echo   2. List modules
echo   3. World of Nations: vote once
echo   4. World of Nations: vote forever (keep this window open)
echo   5. World of Nations: dry run (test, no vote)
echo   6. Run another module
echo   7. Change settings (.env)
echo   0. Quit
echo.
set "choice="
set /p "choice=Choose: "
if "%choice%"=="1" call :cs balance
if "%choice%"=="2" call :cs list
if "%choice%"=="3" call :cs run worldofnations
if "%choice%"=="4" call :cs run worldofnations --loop
if "%choice%"=="5" call :cs run worldofnations --dry-run
if "%choice%"=="6" (
  set "mod="
  set /p "mod=Module name and flags (e.g. my-site --foo=bar): "
  call :runmod
)
if "%choice%"=="7" notepad .env
if "%choice%"=="0" exit /b 0
goto menu

:runmod
if defined mod call :cs run %mod%
exit /b

:cs
node node_modules\tsx\dist\cli.mjs src\cli.ts %*
exit /b
