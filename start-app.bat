@echo off
title FinCollect Pro Server
color 0A
echo ========================================
echo    FinCollect Pro Database Server
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Check MySQL connection
echo Testing MySQL connection...
mysql -u root -p -e "SELECT 1" > nul 2>&1
if errorlevel 1 (
    echo WARNING: MySQL may not be running or password incorrect
    echo Please make sure MySQL is started and password is correct in .env file
    echo.
)

REM Start the server
echo Starting server on port 3000...
echo.
echo Open browser and go to: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

call npm start

pause