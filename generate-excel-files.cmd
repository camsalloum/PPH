@echo off
echo Starting Excel generation...
cd /d "D:\PPH 26.01"
node server\scripts\generate-batch-excel.js > exports\excel-generation-log.txt 2>&1
echo.
echo Excel generation completed!
echo Check: D:\PPH 26.01\exports\excel-generation-log.txt for results
echo.
echo Files should be at:
echo - Riad_Nidal_Customer_Review.xlsx
echo - Sofiane_Team_Customer_Review.xlsx
echo - Sojy_Hisham_DirectSales_Customer_Review.xlsx
pause
