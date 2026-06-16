@echo off
echo Installing pgvector v0.8.2 for PostgreSQL 18...

copy /Y "%TEMP%\pgvector_ext\lib\vector.dll" "C:\Program Files\PostgreSQL\18\lib\"
xcopy /Y /S "%TEMP%\pgvector_ext\share\extension\vector*" "C:\Program Files\PostgreSQL\18\share\extension\"
xcopy /Y /S /I "%TEMP%\pgvector_ext\include\server\extension\vector" "C:\Program Files\PostgreSQL\18\include\server\extension\vector"

echo.
echo pgvector installed! Now restarting PostgreSQL...
net stop postgresql-x64-18
net start postgresql-x64-18

echo.
echo Done! You can delete this file now.
pause
