using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
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
            
            Console.OutputEncoding = System.Text.Encoding.UTF8;

            string command = args[0].ToLower();
            
            try
            {
                switch (command)
                {
                    case "backup":
                        RunBackup(args[1], args[2]);
                        break;
                    case "backup-compressed":
                        RunCompressedBackup(args[1], args[2]);
                        break;
                    case "restore":
                        RunRestore(args[1], args[2]);
                        break;
                    case "restore-compressed":
                        RunCompressedRestore(args[1], args[2]);
                        break;
                    case "rescue":
                        CreateRescueUSB(args[1], args[2]);
                        break;
                    case "hourly":
                        RunHourlyBackup(args[1], args[2]);
                        break;
                    case "hourly-compressed":
                        RunHourlyCompressedBackup(args[1], args[2]);
                        break;
                    case "rescue-hourly":
                        CreateRescueUSBWithHourly(args[1], args[2]);
                        break;
                    case "storage-info":
                        GetStorageInfo(args[1]);
                        break;
                    case "storage-all":
                        GetAllStorageInfo();
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
            Directory.CreateDirectory(dest);
            CopyDirectory(source, dest);
            ExportSystemState(dest);
            UpdateStorageInfo(dest, source);
            SendJson("complete", "Backup finished successfully.");
        }

        static void RunCompressedBackup(string source, string dest)
        {
            SendJson("status", "Scanning files for compressed backup...");
            
            Directory.CreateDirectory(dest);
            string zipPath = Path.Combine(dest, "backup.zip");
            
            List<string> allFiles = new List<string>();
            GetFilesRecursively(source, allFiles);
            
            if (allFiles.Count == 0) {
                SendJson("error", "No files could be accessed for backup.");
                return;
            }

            long totalBytes = 0;
            foreach (string file in allFiles)
            {
                try { totalBytes += new FileInfo(file).Length; } catch { }
            }

            SendJson("status", "Compressing files...");
            
            using (var archive = ZipFile.Open(zipPath, ZipArchiveMode.Create))
            {
                long processedBytes = 0;
                foreach (string file in allFiles)
                {
                    try
                    {
                        string entryName = file.Substring(source.Length).TrimStart(Path.DirectorySeparatorChar);
                        archive.CreateEntryFromFile(file, entryName);
                        processedBytes += new FileInfo(file).Length;
                        
                        if (processedBytes % (10 * 1024 * 1024) < 50000)
                        {
                            int percent = (int)((processedBytes / (double)totalBytes) * 100);
                            SendJson("progress", percent.ToString());
                        }
                    }
                    catch { }
                }
            }

            ExportSystemState(dest);
            UpdateStorageInfo(dest, source);
            SendJson("complete", "Compressed backup finished successfully.");
        }

        static void RunHourlyBackup(string source, string dest)
        {
            SendJson("status", "Preparing hourly backup...");
            
            string hourlyDir = Path.Combine(dest, "HourlyBackups");
            Directory.CreateDirectory(hourlyDir);
            
            string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string backupDir = Path.Combine(hourlyDir, timestamp);
            Directory.CreateDirectory(backupDir);
            
            SendJson("status", "Scanning files...");
            CopyDirectory(source, backupDir);
            ExportSystemState(backupDir);
            
            CleanupPreviousBackups(hourlyDir);
            UpdateStorageInfo(dest, source);
            SendJson("complete", "Hourly backup finished successfully.");
        }

        static void RunHourlyCompressedBackup(string source, string dest)
        {
            SendJson("status", "Preparing compressed hourly backup...");
            
            string hourlyDir = Path.Combine(dest, "HourlyBackups");
            Directory.CreateDirectory(hourlyDir);
            
            string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string backupDir = Path.Combine(hourlyDir, timestamp);
            Directory.CreateDirectory(backupDir);
            
            string zipPath = Path.Combine(backupDir, "backup.zip");
            
            List<string> allFiles = new List<string>();
            GetFilesRecursively(source, allFiles);
            
            if (allFiles.Count == 0) {
                SendJson("error", "No files could be accessed for backup.");
                return;
            }

            long totalBytes = 0;
            foreach (string file in allFiles)
            {
                try { totalBytes += new FileInfo(file).Length; } catch { }
            }

            SendJson("status", "Compressing files...");
            
            using (var archive = ZipFile.Open(zipPath, ZipArchiveMode.Create))
            {
                long processedBytes = 0;
                foreach (string file in allFiles)
                {
                    try
                    {
                        string entryName = file.Substring(source.Length).TrimStart(Path.DirectorySeparatorChar);
                        archive.CreateEntryFromFile(file, entryName);
                        processedBytes += new FileInfo(file).Length;
                        
                        if (processedBytes % (10 * 1024 * 1024) < 50000)
                        {
                            int percent = (int)((processedBytes / (double)totalBytes) * 100);
                            SendJson("progress", percent.ToString());
                        }
                    }
                    catch { }
                }
            }

            CleanupPreviousBackups(hourlyDir);
            UpdateStorageInfo(dest, source);
            SendJson("complete", "Compressed hourly backup finished successfully.");
        }

        static void CleanupPreviousBackups(string hourlyDir)
        {
            string[] backupDirs = Directory.GetDirectories(hourlyDir);
            
            if (backupDirs.Length > 1)
            {
                Array.Sort(backupDirs, (a, b) => Directory.GetCreationTime(a).CompareTo(Directory.GetCreationTime(b)));
                
                try
                {
                    Directory.Delete(backupDirs[0], true);
                    SendJson("status", "Cleaned up previous hourly backup.");
                }
                catch { }
            }
        }

        static void RunRestore(string source, string dest)
        {
            if (dest == "ORIGINAL_LOCATION_FLAG") {
                SendJson("error", "Original location restore is not yet implemented.");
                return;
            }
            
            SendJson("status", "Restoring files...");
            CopyDirectory(source, dest);
            SendJson("complete", "Restore finished successfully.");
        }

        static void RunCompressedRestore(string source, string dest)
        {
            string zipPath = Path.Combine(source, "backup.zip");
            
            if (!File.Exists(zipPath)) {
                SendJson("error", "No compressed backup found.");
                return;
            }
            
            SendJson("status", "Extracting compressed backup...");
            
            using (var archive = ZipFile.OpenRead(zipPath))
            {
                int total = archive.Entries.Count;
                int processed = 0;
                
                foreach (var entry in archive.Entries)
                {
                    try
                    {
                        string destPath = Path.Combine(dest, entry.FullName);
                        Directory.CreateDirectory(Path.GetDirectoryName(destPath));
                        entry.ExtractToFile(destPath, true);
                        processed++;
                        
                        if (processed % 100 == 0)
                        {
                            int percent = (int)((processed / (double)total) * 100);
                            SendJson("progress", percent.ToString());
                        }
                    }
                    catch { }
                }
            }
            
            SendJson("complete", "Compressed restore finished successfully.");
        }

        static void CopyDirectory(string sourceDir, string destinationDir)
        {
            long totalBytes = 0;
            long copiedBytes = 0;
            List<string> allFiles = new List<string>();
            
            GetFilesRecursively(sourceDir, allFiles);

            if (allFiles.Count == 0) {
                SendJson("error", "No files could be accessed for backup.");
                return;
            }

            foreach (string file in allFiles)
            {
                try { totalBytes += new FileInfo(file).Length; } catch { }
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

                    if (copiedBytes % (5 * 1024 * 1024) < 5000)
                    {
                        int percent = (int)((copiedBytes / (double)totalBytes) * 100);
                        SendJson("progress", percent.ToString());
                        SendJson("status", $"Copying {Path.GetFileName(file)}...");
                    }
                }
                catch { }
            }
        }

        static void GetFilesRecursively(string directory, List<string> files)
        {
            try {
                files.AddRange(Directory.GetFiles(directory));
                foreach (string subDir in Directory.GetDirectories(directory))
                {
                    GetFilesRecursively(subDir, files);
                }
            } catch { }
        }

        static void ExportSystemState(string destFolder)
        {
            SendJson("status", "Exporting System State...");
            var state = new Dictionary<string, object> {
                { "timestamp", DateTime.Now.ToString() },
                { "os_version", Environment.OSVersion.ToString() },
                { "machine_name", Environment.MachineName }
            };

            try {
                string regFile = Path.Combine(destFolder, "backup_registry.reg");
                Process.Start("reg", $"export \"HKCU\\Software\" \"{regFile}\" /y")?.WaitForExit();
                state.Add("registry_exported", true);
            } catch {
                state.Add("registry_exported", false);
            }

            string jsonPath = Path.Combine(destFolder, "system_state.json");
            File.WriteAllText(jsonPath, JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));
        }

        static void UpdateStorageInfo(string backupPath, string sourcePath)
        {
            try
            {
                long backupSize = GetDirectorySize(backupPath);
                int fileCount = Directory.GetFiles(backupPath, "*.*", SearchOption.AllDirectories).Length;
                
                var storageInfo = new Dictionary<string, object>
                {
                    { "path", backupPath },
                    { "source", sourcePath },
                    { "size_bytes", backupSize },
                    { "size_formatted", FormatBytes(backupSize) },
                    { "file_count", fileCount },
                    { "last_backup", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") }
                };
                
                string appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                string timeMachinePath = Path.Combine(appDataPath, "TimeMachine");
                Directory.CreateDirectory(timeMachinePath);
                
                string storageFile = Path.Combine(timeMachinePath, "storage.json");
                
                List<Dictionary<string, object>> allBackups = new List<Dictionary<string, object>>();
                
                if (File.Exists(storageFile))
                {
                    try
                    {
                        string existingJson = File.ReadAllText(storageFile);
                        var existing = JsonSerializer.Deserialize<List<Dictionary<string, object>>>(existingJson);
                        if (existing != null) allBackups = existing;
                    } catch { }
                }
                
                int existingIndex = allBackups.FindIndex(b => b["path"].ToString() == backupPath);
                if (existingIndex >= 0)
                {
                    allBackups[existingIndex] = storageInfo;
                }
                else
                {
                    allBackups.Add(storageInfo);
                }
                
                File.WriteAllText(storageFile, JsonSerializer.Serialize(allBackups, new JsonSerializerOptions { WriteIndented = true }));
            }
            catch { }
        }

        static void GetStorageInfo(string backupPath)
        {
            try
            {
                string appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                string storageFile = Path.Combine(appDataPath, "TimeMachine", "storage.json");
                
                if (File.Exists(storageFile))
                {
                    string json = File.ReadAllText(storageFile);
                    var allBackups = JsonSerializer.Deserialize<List<Dictionary<string, object>>>(json);
                    
                    var backup = allBackups?.Find(b => b["path"].ToString() == backupPath);
                    if (backup != null)
                    {
                        SendJson("storage-info", JsonSerializer.Serialize(backup));
                        return;
                    }
                }
                
                SendJson("storage-info", JsonSerializer.Serialize(new { error = "Backup not found" }));
            }
            catch (Exception ex)
            {
                SendJson("error", ex.Message);
            }
        }

        static void GetAllStorageInfo()
        {
            try
            {
                string appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                string storageFile = Path.Combine(appDataPath, "TimeMachine", "storage.json");
                
                if (File.Exists(storageFile))
                {
                    string json = File.ReadAllText(storageFile);
                    SendJson("storage-all", json);
                }
                else
                {
                    SendJson("storage-all", "[]");
                }
            }
            catch (Exception ex)
            {
                SendJson("error", ex.Message);
            }
        }

        static long GetDirectorySize(string path)
        {
            long size = 0;
            try
            {
                string[] files = Directory.GetFiles(path, "*.*", SearchOption.AllDirectories);
                foreach (string file in files)
                {
                    try { size += new FileInfo(file).Length; } catch { }
                }
            } catch { }
            return size;
        }

        static string FormatBytes(long bytes)
        {
            string[] sizes = { "B", "KB", "MB", "GB", "TB" };
            int order = 0;
            double size = bytes;
            
            while (size >= 1024 && order < sizes.Length - 1)
            {
                order++;
                size = size / 1024;
            }
            
            return $"{size:0.##} {sizes[order]}";
        }

        static void CreateRescueUSB(string driveLetter, string userProfile)
        {
            SendJson("status", "Preparing Rescue USB...");
            
            string rescueFolder = Path.Combine(driveLetter, "TimeMachineRescue");
            Directory.CreateDirectory(rescueFolder);

            string currentExe = Process.GetCurrentProcess().MainModule.FileName;
            string destExe = Path.Combine(rescueFolder, "TimeMachineEngine.exe");
            File.Copy(currentExe, destExe, true);

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

            string backupOnUsb = Path.Combine(rescueFolder, "Backup");
            SendJson("status", "Backing up user files to USB...");
            CopyDirectory(userProfile, backupOnUsb);

            SendJson("complete", "Rescue USB Created Successfully!");
        }

        static void CreateRescueUSBWithHourly(string driveLetter, string userProfile)
        {
            SendJson("status", "Preparing Rescue USB with Hourly Backup...");
            
            string rescueFolder = Path.Combine(driveLetter, "TimeMachineRescue");
            Directory.CreateDirectory(rescueFolder);
            string hourlyDir = Path.Combine(rescueFolder, "HourlyBackups");
            Directory.CreateDirectory(hourlyDir);

            string currentExe = Process.GetCurrentProcess().MainModule.FileName;
            string destExe = Path.Combine(rescueFolder, "TimeMachineEngine.exe");
            File.Copy(currentExe, destExe, true);

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

            string backupOnUsb = Path.Combine(rescueFolder, "Backup");
            SendJson("status", "Backing up user files to USB...");
            CopyDirectory(userProfile, backupOnUsb);

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
