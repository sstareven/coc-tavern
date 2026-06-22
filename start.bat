@echo off
REM ============================================================
REM  深渊档案馆 (Abyssal Archive) 启动脚本
REM  位置: 项目根目录
REM  用法: 双击运行,或 cmd 中执行 start.bat
REM ============================================================

REM 切换 UTF-8 代码页,避免中文乱码
chcp 65001 >nul

REM 切到脚本所在目录(即项目根)
cd /d "%~dp0"

echo.
echo ============================================================
echo   深渊档案馆 启动脚本 (Abyssal Archive)
echo ============================================================
echo.

REM 1. 检查 Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 未检测到 Node.js,请先安装 Node 18+ 并加入 PATH
  echo         下载地址: https://nodejs.org/
  pause
  exit /b 1
)

REM 打印版本便于排查
for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
for /f "delims=" %%v in ('npm -v')  do set NPM_VER=%%v
echo [INFO] Node %NODE_VER% / npm %NPM_VER%
echo.

REM 2. 若缺少依赖,自动安装
if not exist "node_modules\" (
  echo [INFO] 未检测到 node_modules,正在执行 npm install ...
  echo        (首次安装可能需要几分钟)
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install 失败,请检查网络或上方报错信息
    pause
    exit /b 1
  )
  echo.
  echo [OK] 依赖安装完成
  echo.
)

REM 3. 启动 Vite 开发服务器
echo [INFO] 正在启动 Vite 开发服务器 ...
echo        按 Ctrl+C 可终止进程
echo.
call npm run dev
set EXITCODE=%errorlevel%

if not "%EXITCODE%"=="0" (
  echo.
  echo [ERROR] 启动失败,退出码 %EXITCODE%
  pause
  exit /b %EXITCODE%
)

REM 正常退出时(用户 Ctrl+C)暂停,方便看日志
pause
