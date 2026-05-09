@echo off

set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"

%CHROME% ^
--user-data-dir="C:\temp\chrome_bench" ^
--profile-directory="Default" ^
--no-first-run ^
--no-default-browser-check ^
--disable-background-networking ^
--disable-extensions ^
--start-maximized ^
--auto-open-devtools-for-tabs ^
http://localhost:8088


@rem --disable-gpu-vsync ^
@rem --disable-frame-rate-limit ^
@rem --disable-features=VsyncAlignedPresent ^
