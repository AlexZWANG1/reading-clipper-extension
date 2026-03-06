@echo off

echo Creating desktop shortcut...

set SCRIPT="%TEMP%\create_shortcut.vbs"

echo Set oWS = WScript.CreateObject("WScript.Shell") > %SCRIPT%
echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\Reading Clipper.lnk" >> %SCRIPT%
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> %SCRIPT%
echo oLink.TargetPath = "%~dp0control-panel.bat" >> %SCRIPT%
echo oLink.WorkingDirectory = "%~dp0" >> %SCRIPT%
echo oLink.Description = "Reading Clipper 2.0 Control Panel" >> %SCRIPT%
echo oLink.IconLocation = "shell32.dll,13" >> %SCRIPT%
echo oLink.Save >> %SCRIPT%

cscript /nologo %SCRIPT%
del %SCRIPT%

echo.
echo Desktop shortcut created successfully!
echo.
echo You can now:
echo 1. Double-click "Reading Clipper" on your desktop
echo 2. Or run control-panel.bat directly
echo.
pause
