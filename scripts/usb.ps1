Write-Host "==============="
Write-Host "  ShredSafe"
Write-Host "==============="

# Ask user to manually enter drive letter
$driveLetter = Read-Host "Enter the DRIVE LETTER of the USB you want to erase (e.g., E)"

if (-not (Get-Volume -DriveLetter $driveLetter -ErrorAction SilentlyContinue)) {
    Write-Host "Drive $driveLetter`: not found. Please check and try again."
    exit
}

# Safety check (don’t allow system drives)
if ($driveLetter -match "^[CcDd]$") {
    Write-Host "Erasing system drives (${driveLetter}:) is blocked for safety."
    exit
}

# Confirm
Write-Host "`nWARNING: All data on drive $driveLetter`: will be PERMANENTLY deleted!"
$confirm = Read-Host "Type YES to confirm"
if ($confirm -ne "YES") {
    Write-Host "Operation cancelled."
    exit
}

# Erase contents (quick delete – not secure overwrite)
Write-Host "`nErasing drive $driveLetter`: ..."
Remove-Item "$driveLetter`:\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`nWiping free space on drive $driveLetter`: with cipher..."
Start-Process -FilePath "cipher.exe" -ArgumentList "/w:$driveLetter`:" -Wait -NoNewWindow

Write-Host "Erase complete."
Write-Host "You can now safely remove the USB drive."