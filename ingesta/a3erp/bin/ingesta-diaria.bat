@echo off
REM ============================================================
REM  Ingesta A3ERP - modo DIARIO (ventana movil de 45 dias)
REM  Carga las 3 empresas en serie y avisa por correo si falla.
REM  Programado para las 22:00, de lunes a sabado.
REM ============================================================
setlocal enableextensions enabledelayedexpansion
cd /d "%~dp0.."

if not exist logs mkdir logs

for /f %%i in ('node -e "process.stdout.write(new Date().toISOString().slice(0,10))"') do set "HOY=%%i"
set "LOG=logs\ingesta-diaria-%HOY%.log"
set "FALLOS="

echo. >> "%LOG%"
echo ============================================================ >> "%LOG%"
echo [%DATE% %TIME%] INICIO ingesta DIARIA (SF, FUX, DOT) >> "%LOG%"

call :correr SF  diario:sf
call :correr FUX diario:fux
call :correr DOT diario:dot

if defined FALLOS (
  echo [%DATE% %TIME%] FALLARON:!FALLOS! >> "%LOG%"
  call node --env-file=.env src/notificar.mjs --modo diario --ok false --empresa "!FALLOS!" --detalle "Fallo la ingesta DIARIA en:!FALLOS!. Revisar logs\ingesta-diaria-%HOY%.log en el PC."
) else (
  echo [%DATE% %TIME%] OK: las 3 empresas cargadas sin errores. >> "%LOG%"
)

echo [%DATE% %TIME%] FIN ingesta DIARIA. >> "%LOG%"
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
