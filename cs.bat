@echo off
rem Command-line shortcut for Windows:  cs balance  |  cs list  |  cs run worldofnations --loop
setlocal
cd /d "%~dp0"
if not exist node_modules node scripts\setup.mjs || exit /b 1
node node_modules\tsx\dist\cli.mjs src\cli.ts %*
