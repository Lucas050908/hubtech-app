@echo off
rem Start HUBTECH (Windows). Kræver Python 3.8+ ("Add Python to PATH" ved installation).
cd /d "%~dp0"
where py >nul 2>nul && (set PY=py -3) || (set PY=python)
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" || (echo HUBTECH kraever Python 3.8 eller nyere: https://www.python.org & pause & exit /b 1)
start "" http://127.0.0.1:8090
%PY% server\app.py %*
pause
