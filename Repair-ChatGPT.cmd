@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Fix ChatGPT Window Not Showing

set "REPAIR_SCRIPT=%~dp0Repair-ChatGPT-Windows.mjs"
set "NODE_EXE="

for /f "delims=" %%I in ('where.exe node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"

if not exist "%REPAIR_SCRIPT%" (
  echo [ERROR] Repair-ChatGPT-Windows.mjs was not found.
  echo Keep the CMD and MJS files in the same folder.
  if /I not "%CI%"=="true" pause
  exit /b 1
)

if not defined NODE_EXE (
  echo [ERROR] Node.js was not found.
  echo Install Node.js 18 or newer and make sure node.exe is available on PATH.
  if /I not "%CI%"=="true" pause
  exit /b 1
)

echo Repairing the formal ChatGPT Windows app. Beta processes and files will not be touched.
echo.
"%NODE_EXE%" "%REPAIR_SCRIPT%" %*
set "RESULT=%ERRORLEVEL%"
echo.

if "%RESULT%"=="0" (
  echo Operation completed.
) else if "%RESULT%"=="2" (
  echo Read-only check found an item to repair. Run again without --check.
) else (
  echo Repair did not complete. See Repair-ChatGPT-Windows.log in this folder.
)

if /I not "%CI%"=="true" pause
exit /b %RESULT%
