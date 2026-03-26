using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading;
using Microsoft.Win32;
using System.Collections.Generic;

namespace TimeMachineEngine
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length == 0) return;
            
            // Ensure output is UTF-8 for JSON communication
            Console.OutputEncoding = System.Text.Encoding.UTF8;

            string command = args[0].ToLower();
            
            try
            {
                switch (command)
                {
                    case "backup":
                        // args: backup [source] [dest]
                        RunBackup(args[1], args[2]);
                        break;
                    case "restore":
                        // args: restore [source] [dest]
                        RunRestore(args[1], args[2]);
                        break;
                    case "rescue":
                        // args: rescue [usb_drive_letter] [user_profile_path]
                        CreateRescueUSB(args[1], args[2]);
                        break;
                    case "hourly":
                        // args: hourly [source] [dest]
                        RunHourlyBackup(args[1], args[2]);
                        break;
                    case "rescue-hourly":
                        // args: rescue-hourly [usb_drive_letter] [user_profile_path]
                        CreateRescueUSBWithHourly(args[1], args[2]);
                        break;
                }
            }
            catch (Exception ex)
            {
                SendJson("error", ex.Message);
            }
        }

        static void RunBackup(string source, string dest)
        {
            SendJson("status", "Scanning files...");
            
            // 1. Create Destination
            Directory.CreateDirectory(dest);

            // 2. Copy Files
            CopyDirectory(source, dest);

            // 3. Export System State (Registry, etc.)
            ExportSystemState(dest);

            SendJson("complete", "Backup finished successfully.");
        }

        static void RunHourlyBackup(string source, string dest)
        {
            SendJson("status", "Preparing hourly backup...");
            
            // 1. Create hourly backup directory
            string hourlyDir = Path.Combine(dest, "HourlyBackups");
            Directory.CreateDirectory(hourlyDir);
            
            // 2. Create timestamped backup folder
            string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string backupDir = Path.Combine(hourlyDir, timestamp);
            Directory.CreateDirectory(backupDir);
            
            // 3. Run backup
            SendJson("status", "Scanning files...");
            CopyDirectory(source, backupDir);
            ExportSystemState(backupDir);
            
            // 4. Clean up previous hourly backups
            CleanupPreviousBackups(hourlyDir);
            
            SendJson("complete", "Hourly backup finished successfully.");
        }

        static void CleanupPreviousBackups(string hourlyDir)
        {
            // Get all backup directories
            string[] backupDirs = Directory.GetDirectories(hourlyDir);
            
            // If there are more than 1 backup, delete the oldest one
            if (backupDirs.Length > 1)
            {
                // Sort by creation time
                Array.Sort(backupDirs, (a, b) => Directory.GetCreationTime(a).CompareTo(Directory.GetCreationTime(b)));
                
                // Delete the oldest backup
                try
                {
                    Directory.Delete(backupDirs[0], true);
                    SendJson("status", "Cleaned up previous hourly backup.");
                }
                catch (Exception)
                {
                    // Skip if we can't delete
                }
            }
        }

        static void RunRestore(string source, string dest)
        {
            // Handle ORIGINAL_LOCATION_FLAG
            if (dest == "ORIGINAL_LOCATION_FLAG") {
                SendJson("error", "Original location restore is not yet implemented. Please select a specific destination.");
                return;
            }
            
            SendJson("status", "Restoring files...");
            CopyDirectory(source, dest);
            SendJson("complete", "Restore finished successfully.");
        }

        static void CopyDirectory(string sourceDir, string destinationDir)
        {
            long totalBytes = 0;
            long copiedBytes = 0;
            List<string> allFiles = new List<string>();
            
            // Get list of files recursively, handling access denied errors
            GetFilesRecursively(sourceDir, allFiles);

            if (allFiles.Count == 0) {
                SendJson("error", "No files could be accessed for backup.");
                return;
            }

            // Calculate total size
            foreach (string file in allFiles)
            {
                try {
                    totalBytes += new FileInfo(file).Length;
                } catch { /* Skip files we can't access */ }
            }

            foreach (string file in allFiles)
            {
                try 
                {
                    string relativePath = file.Substring(sourceDir.Length);
                    string destFile = Path.Combine(destinationDir, relativePath.TrimStart(Path.DirectorySeparatorChar));
                    
                    Directory.CreateDirectory(Path.GetDirectoryName(destFile));
                    File.Copy(file, destFile, true);

                    copiedBytes += new FileInfo(file).Length;

                    // Update progress every 100 files or so to keep UI fast
                    if (copiedBytes % (5 * 1024 * 1024) < 5000) // approx every 5MB
                    {
                        int percent = (int)((copiedBytes / (double)totalBytes) * 100);
                        SendJson("progress", percent.ToString());
                        SendJson("status", $"Copying {Path.GetFileName(file)}...");
                    }
                }
                catch (Exception) { /* Skip locked files */ }
            }
        }

        static void GetFilesRecursively(string directory, List<string> files)
        {
            try {
                // Add files in current directory
                files.AddRange(Directory.GetFiles(directory));
                
                // Recurse into subdirectories
                foreach (string subDir in Directory.GetDirectories(directory))
                {
                    GetFilesRecursively(subDir, files);
                }
            } catch (Exception) {
                // Skip directories we can't access
            }
        }

        static void ExportSystemState(string destFolder)
        {
            SendJson("status", "Exporting System State...");
            var state = new Dictionary<string, object> {
                { "timestamp", DateTime.Now.ToString() },
                { "os_version", Environment.OSVersion.ToString() },
                { "machine_name", Environment.MachineName }
            };

            // Try to capture some registry keys
            try {
                string regFile = Path.Combine(destFolder, "backup_registry.reg");
                // Export HKCU (Current User) settings
                Process.Start("reg", $"export \"HKCU\\Software\" \"{regFile}\" /y")?.WaitForExit();
                state.Add("registry_exported", true);
            } catch {
                state.Add("registry_exported", false);
            }

            string jsonPath = Path.Combine(destFolder, "system_state.json");
            File.WriteAllText(jsonPath, JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));
        }

        static void CreateRescueUSB(string driveLetter, string userProfile)
        {
            SendJson("status", "Preparing Rescue USB...");
            
            // 1. Create directories
            string rescueFolder = Path.Combine(driveLetter, "TimeMachineRescue");
            Directory.CreateDirectory(rescueFolder);

            // 2. Copy the engine itself to the USB
            string currentExe = Process.GetCurrentProcess().MainModule.FileName;
            string destExe = Path.Combine(rescueFolder, "TimeMachineEngine.exe");
            File.Copy(currentExe, destExe, true);

            // 3. Create a Batch script to run restore on any machine
            string batContent = $@"
@echo off
title Time Machine Rescue System
echo ==========================================
echo    TIME MACHINE RESCUE MODE
echo ==========================================
echo.
echo This tool will restore your files to this computer.
echo.
set /p DEST=""Enter Restore Destination (e.g. C:\Users\YourName): "" 
echo Restoring from USB to %DEST%...
TimeMachineEngine.exe restore ""Backup"" ""%DEST%""
pause
";
            File.WriteAllText(Path.Combine(rescueFolder, "LaunchRescue.bat"), batContent);

            // 4. Copy User Files to USB (For a true rescue drive)
            string backupOnUsb = Path.Combine(rescueFolder, "Backup");
            SendJson("status", "Backing up user files to USB...");
            CopyDirectory(userProfile, backupOnUsb);

            SendJson("complete", "Rescue USB Created Successfully!");
        }

        static void CreateRescueUSBWithHourly(string driveLetter, string userProfile)
        {
            SendJson("status", "Preparing Rescue USB with Hourly Backup...");
            
            // 1. Create directories
            string rescueFolder = Path.Combine(driveLetter, "TimeMachineRescue");
            Directory.CreateDirectory(rescueFolder);
            string hourlyDir = Path.Combine(rescueFolder, "HourlyBackups");
            Directory.CreateDirectory(hourlyDir);

            // 2. Copy the engine itself to the USB
            string currentExe = Process.GetCurrentProcess().MainModule.FileName;
            string destExe = Path.Combine(rescueFolder, "TimeMachineEngine.exe");
            File.Copy(currentExe, destExe, true);

            // 3. Create a Batch script to run restore on any machine
            string batContent = $@"
@echo off
title Time Machine Rescue System
echo ==========================================
echo    TIME MACHINE RESCUE MODE
echo ==========================================
echo.
echo This tool will restore your files to this computer.
echo.
set /p DEST=""Enter Restore Destination (e.g. C:\Users\YourName): "" 
echo Restoring from USB to %DEST%...
TimeMachineEngine.exe restore ""Backup"" ""%DEST%""
pause
";
            File.WriteAllText(Path.Combine(rescueFolder, "LaunchRescue.bat"), batContent);

            // 4. Create a Batch script for hourly backup
            string hourlyBatContent = @"
@echo off
title Time Machine Hourly Backup
echo ==========================================
echo    TIME MACHINE HOURLY BACKUP
echo ==========================================
echo.
echo This tool will create an hourly backup of your user files.
echo.
set SOURCE=%USERPROFILE%
set DEST=%~d0\TimeMachineRescue

if not exist ""%DEST%"" mkdir ""%DEST%""

echo Running hourly backup from %SOURCE% to %DEST%...
TimeMachineEngine.exe hourly ""%SOURCE%"" ""%DEST%""
echo.
echo Hourly backup completed. Press any key to exit.
pause
";
            File.WriteAllText(Path.Combine(rescueFolder, "RunHourlyBackup.bat"), hourlyBatContent);

            // 5. Copy User Files to USB (For a true rescue drive)
            string backupOnUsb = Path.Combine(rescueFolder, "Backup");
            SendJson("status", "Backing up user files to USB...");
            CopyDirectory(userProfile, backupOnUsb);

            // 6. Create initial hourly backup
            SendJson("status", "Creating initial hourly backup...");
            RunHourlyBackup(userProfile, rescueFolder);

            SendJson("complete", "Rescue USB with Hourly Backup Created Successfully!");
        }

        static void SendJson(string type, string message)
        {
            var obj = new { type, data = message };
            Console.WriteLine(JsonSerializer.Serialize(obj));
        }
    }
}