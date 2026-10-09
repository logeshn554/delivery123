param([string]$DeviceSerial = '', [string]$JdkPath = '')
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$javaDirectories = @(
    if ($JdkPath) { Get-Item -LiteralPath $JdkPath -ErrorAction SilentlyContinue }
    foreach ($configuredHome in @($env:JAVA_HOME, [Environment]::GetEnvironmentVariable('JAVA_HOME','User'), [Environment]::GetEnvironmentVariable('JAVA_HOME','Machine'))) {
        if ($configuredHome) { Get-Item -LiteralPath $configuredHome.Trim('"') -ErrorAction SilentlyContinue }
    }
    Get-ChildItem 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue
    Get-ChildItem 'C:\Program Files\Java' -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue
    Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue
    if ($env:USERPROFILE) { Get-ChildItem (Join-Path $env:USERPROFILE 'AppData\Local\Programs\Eclipse Adoptium') -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue }
    Get-Item 'C:\Program Files\Android\Android Studio\jbr' -ErrorAction SilentlyContinue
    Get-ChildItem 'C:\Program Files\Amazon Corretto' -Directory -ErrorAction SilentlyContinue
    Get-ChildItem 'C:\Program Files\Zulu' -Directory -ErrorAction SilentlyContinue
    if ($env:USERPROFILE) {
        Get-ChildItem (Join-Path $env:USERPROFILE '.jdks') -Directory -ErrorAction SilentlyContinue
        Get-ChildItem (Join-Path $env:USERPROFILE 'scoop\apps\openjdk21') -Directory -ErrorAction SilentlyContinue
    }
    $javaOnPath = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($javaOnPath) { Get-Item (Split-Path -Parent (Split-Path -Parent $javaOnPath.Source)) -ErrorAction SilentlyContinue }
)
$selectedJava = $null
foreach ($candidate in $javaDirectories) {
    $javaExecutable = Join-Path $candidate.FullName 'bin\java.exe'
    if (!(Test-Path -LiteralPath $javaExecutable) -or !(Test-Path -LiteralPath (Join-Path $candidate.FullName 'bin\javac.exe'))) { continue }
    $savedErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $versionOutput = & $javaExecutable -version 2>&1 | Out-String
    $ErrorActionPreference = $savedErrorPreference
    if ($versionOutput -match 'version "21(?:\.|"|-)') { $selectedJava = $candidate.FullName; break }
}
if (!$selectedJava) { throw 'A Java 21 JDK was not found. Install https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.msi, then rerun. For a custom install location, add -JdkPath "C:\path\to\jdk-21".' }
$env:JAVA_HOME = $selectedJava
$env:Path = "$selectedJava\bin;$env:Path"
Write-Host "Using Java 21 from $selectedJava"
if (!(Get-Command adb -ErrorAction SilentlyContinue)) { throw 'adb was not found. Add Android SDK platform-tools to PATH.' }
$deviceArguments = @()
if ($DeviceSerial) { $deviceArguments = @('-s', $DeviceSerial) }
$deviceState = & adb @deviceArguments get-state 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $deviceState.Trim() -ne 'device') { throw 'ADB cannot use the selected phone. Run adb devices, unlock the phone and accept the USB debugging prompt. If multiple phones are connected, pass -DeviceSerial.' }
$previousAndroidSerial = $env:ANDROID_SERIAL
if ($DeviceSerial) { $env:ANDROID_SERIAL = $DeviceSerial }
Push-Location $projectDirectory
try {
    & npm.cmd run android:sync
    if ($LASTEXITCODE -ne 0) { throw 'Android sync failed.' }
    Push-Location (Join-Path $projectDirectory 'android')
    try {
        & .\gradlew.bat --stop
        & .\gradlew.bat installDebug
        if ($LASTEXITCODE -ne 0) { throw 'Android installation failed. Review the Gradle error above.' }
    } finally { Pop-Location }
    & adb @deviceArguments reverse tcp:3004 tcp:3004
    if ($LASTEXITCODE -ne 0) { throw 'USB forwarding failed. Unlock the phone and enable USB debugging.' }
    & adb @deviceArguments shell am force-stop in.allgo.app
    & adb @deviceArguments shell monkey -p in.allgo.app 1
    if ($LASTEXITCODE -ne 0) { throw 'AllGo could not be opened on the device.' }
    Write-Host 'AllGo installed and opened. Keep npm run dev:api running in another terminal for USB development.'
} finally { Pop-Location; $env:ANDROID_SERIAL = $previousAndroidSerial }
