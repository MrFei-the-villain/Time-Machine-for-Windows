This is the current newest code.
For all files for developement, please go to main.
# Time Machine for Windows

A powerful backup and restore utility for Windows, inspired by macOS Time Machine. Features encryption, compression, hourly backups, and rescue USB creation.

![Version](https://img.shields.io/badge/version-1.0.1-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### Core Features
- **Full System Backup** - Backup any folder or drive with progress tracking
- **Restore Files** - Restore backups to any location
- **Hourly Backups** - Automatic hourly backups with auto-cleanup of old backups
- **Rescue USB** - Create bootable rescue USB drives for disaster recovery

### Security Features
- **AES-256 Encryption** - Password-protect your backups with military-grade encryption
- **App Password Protection** - Prevent unauthorized closing of the application
- **Secure Password Storage** - Passwords are hashed with SHA-256 + salt

### Storage Features
- **Compression Support** - ZIP compression to save storage space
- **Storage Tracking** - Monitor backup storage usage with visual analytics
- **Storage Data Export** - JSON-based storage data in `%APPDATA%\TimeMachine`

### User Interface
- **Modern Dark Theme** - Beautiful, easy-on-the-eyes interface
- **Progress Ring** - Visual progress indicator for all operations
- **System Tray Integration** - Minimize to tray, view progress in tooltip
- **In-App Preview** - Browse backup contents without restoring

## Installation

### Download
Download the latest release from [GitHub Releases](https://github.com/MrFei-the-villain/Time-Machine-for-Windows/releases)

### Requirements
- Windows 10/11
- .NET 8.0 Runtime (for backup engine)

### Install
1. Download `Time Machine Setup 1.0.0.exe`
2. Run the installer
3. Follow the installation wizard

## Usage

### Creating a Backup

1. **Select Source** - Choose the folder you want to backup
2. **Select Destination** - Choose where to store the backup
3. **Choose Options**:
   - Enable compression to save space
   - Enable encryption to password-protect your backup
4. **Click "Start Backup"**

### Restoring Files

1. **Select Backup Source** - Choose the backup folder
2. **Select Restore Destination** - Choose where to restore files
3. **Choose Options**:
   - Check "Compressed backup" if the backup contains `backup.zip`
   - Check "Encrypted backup" if the backup contains `backup.enc`
   - Enter decryption password if encrypted
4. **Click "Restore"**

### Hourly Backups

1. Set up source and destination
2. Click "Hourly Backup"
3. The app will create timestamped backups in `HourlyBackups` folder
4. Old hourly backups are automatically cleaned up (keeps only the most recent)

### Creating a Rescue USB

1. **Select USB Drive** - Choose your USB drive
2. **Select User Profile** - Choose the user folder to backup
3. **Click "Build Rescue USB"** or "Build Rescue USB with Hourly Backup"
4. The USB will contain:
   - Backup engine
   - Your files
   - Rescue scripts for recovery

### Setting App Password

1. Go to **Settings** tab
2. Enter new password and confirm
3. Click "Set Password"
4. Now the app will require password to quit from tray

## Project Structure

```
TimeMachineClone/
├── app/                    # Electron application
│   ├── main.js            # Main process
│   ├── preload.js         # Preload script
│   ├── index.html         # UI
│   ├── package.json       # Dependencies
│   └── dist/              # Built application
├── engine/                 # C# backup engine
│   ├── Program.cs         # Main engine code
│   └── TimeMachineEngine.csproj
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## Technology Stack

- **Frontend**: Electron, HTML, CSS, JavaScript
- **Backend**: C# (.NET 8.0)
- **Encryption**: AES-256 with PBKDF2 key derivation
- **Compression**: ZIP (System.IO.Compression)

## Commands

The C# engine supports the following commands:

| Command | Description |
|---------|-------------|
| `backup` | Standard backup |
| `backup-compressed` | Compressed backup (ZIP) |
| `backup-encrypted` | Encrypted backup (AES-256) |
| `restore` | Standard restore |
| `restore-compressed` | Restore from ZIP |
| `restore-encrypted` | Restore from encrypted backup |
| `hourly` | Hourly backup |
| `hourly-compressed` | Compressed hourly backup |
| `rescue` | Create rescue USB |
| `rescue-hourly` | Rescue USB with hourly backup |
| `storage-info` | Get storage info for a path |
| `storage-all` | Get all storage info |
| `preview-files` | Preview files in a path |
| `set-app-password` | Set app protection password |
| `check-app-password` | Verify app password |

## Development

### Prerequisites
- Node.js 18+
- .NET 8.0 SDK
- npm

### Build from Source

```bash
# Clone the repository
git clone https://github.com/MrFei-the-villain/Time-Machine-for-Windows.git
cd Time-Machine-for-Windows

# Build C# engine
cd engine
dotnet build -c Release

# Install Electron dependencies
cd ../app
npm install

# Build Electron app
npm run build
```

### Development Mode

```bash
cd app
npm start
```

## Security

### Encryption Details
- **Algorithm**: AES-256-CBC
- **Key Derivation**: PBKDF2 with SHA-256
- **Iterations**: 100,000
- **Salt**: 16 bytes random

### Password Storage
- Passwords are hashed with SHA-256
- Unique salt added per installation
- Stored in `%APPDATA%\TimeMachine\app_password.json`

## Known Limitations

- Original location restore not yet implemented
- System files may be skipped due to access permissions
- Large backups (>100GB) may take significant time

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - See [LICENSE](LICENSE) for details.

## Acknowledgments

- Inspired by Apple's Time Machine
- Built with Electron and .NET
- Icons from various open-source projects

## Support

- **Issues**: [GitHub Issues](https://github.com/MrFei-the-villain/Time-Machine-for-Windows/issues)
- **Discussions**: [GitHub Discussions](https://github.com/MrFei-the-villain/Time-Machine-for-Windows/discussions)

---

Made with ❤️ by [MrFei-the-villain](https://github.com/MrFei-the-villain)
