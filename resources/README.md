# Resources Directory

Place your secure eraser executable and other resources in this directory.

## Required Files

1. **eraser.exe** - Your secure device eraser executable
   - Must support command-line arguments: `/drive:<letter> /method:<method> /verify`
   - Should return appropriate exit codes (0=success, 1=error, 2=permission denied, 3=device not found)
   - Must handle UAC elevation gracefully

## Optional Files

- **config.json** - Default configuration settings
- **certificates/** - Code signing certificates (do not commit to version control)
- **docs/** - User documentation and manuals

## Security Notes

- Do not commit sensitive files (certificates, keys) to version control
- Ensure eraser.exe is from a trusted source and properly signed
- Test thoroughly on different Windows versions and hardware configurations

## Integration with Electron

The Electron backend (`electron/backend/server.js`) will:
1. Locate eraser.exe in this directory
2. Execute with UAC elevation using `sudo-prompt`
3. Stream stdout/stderr to the UI via WebSockets
4. Log all operations for audit purposes

## Example eraser.exe Usage

```bash
# Basic erasure
eraser.exe /drive:E /method:dod /verify

# Quiet mode (no prompts)
eraser.exe /drive:F /method:random /verify /quiet

# Crypto-erase (for encrypted devices)
eraser.exe /drive:G /method:crypto /verify
```

Replace this placeholder with your actual secure eraser implementation.