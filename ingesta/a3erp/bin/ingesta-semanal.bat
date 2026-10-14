@echo off
REM ============================================================
REM  Ingesta A3ERP - modo RECONCILIACION (historico completo)
REM  Recarga las 3 empresas desde PERIODO_START y avisa si falla.
REM  Programado para los domingos a las 22:00 (red de seguridad).
REM ============================================================
setlocal enableextensions enabledelayedexpansion
cd /d "%~dp0.."

if not exist logs mkdir logs

for /f %%i in ('node -e "process.stdout.write(new Date().toISOString().slice(0,10))"') do set "HOY=%%i"
set "LOG=logs\ingesta-semanal-%HOY%.log"
set "FALLOS="

echo. >> "%LOG%"
echo ============================================================ >> "%LOG%"
echo [%DATE% %TIME%] INICIO reconciliacion SEMANAL (SF, FUX, DOT) >> "%LOG%"

call :correr SF  reconciliacion
call :correr FUX reconciliacion:fux
call :correr DOT reconciliacion:dot

if defined FALLOS (
  echo [%DATE% %TIME%] FALLARON:!FALLOS! >> "%LOG%"
  call node --env-file=.env src/notificar.mjs --modo reconciliacion --ok false --empresa "!FALLOS!" --detalle "Fallo la reconciliacion SEMANAL en:!FALLOS!. Revisar logs\ingesta-semanal-%HOY%.log en el PC."
) else (
  echo [%DATE% %TIME%] OK: las 3 empresas reconciliadas sin errores. >> "%LOG%"
)

echo [%DATE% %TIME%] FIN reconciliacion SEMANAL. >> "%LOG%"
endlocal
exit /b 0

:correr
echo. >> "%LOG%"
echo ----- [%DATE% %TIME%] empresa=%1 modo=%2 ----- >> "%LOG%"
call npm run %2 >> "%LOG%" 2>&1
if errorlevel 1 (
  set "FALLOS=!FALLOS! %1"
  echo [%DATE% %TIME%] ERROR en %1 (%2) >> "%LOG%"
) else (
  echo [%DATE% %TIME%] %1 OK >> "%LOG%"
)
exit /b 0
