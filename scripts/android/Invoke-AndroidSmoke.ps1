[CmdletBinding()]
param(
    [switch]$ValidateOnly,
    [string]$ProjectRoot,
    [string]$Apk,
    [string]$AndroidSdk,
    [string]$AvdName = 'Teppu_API_36',
    [ValidateRange(60, 900)][int]$BootTimeoutSeconds = 300,
    [ValidateRange(10, 120)][int]$UiTimeoutSeconds = 45
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AndroidRelease.Common.ps1')

$ExpectedAvdName = 'Teppu_API_36'
$SystemImage = 'system-images;android-36;google_apis;x86_64'
$Component = 'io.github.ohe1013.teppu/.MainActivity'
$PackageName = 'io.github.ohe1013.teppu'

function New-TeppuText {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][int[]]$CodePoints)

    return -join @($CodePoints | ForEach-Object { [char]$_ })
}

function Invoke-TeppuNativeResult {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string[]]$Responses = @()
    )

    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
        throw "[TEPPU_ANDROID_SMOKE_TOOL_MISSING] Executable was not found: $Executable"
    }
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        if ($Responses.Count -gt 0) {
            $output = @($Responses | & $Executable @Arguments 2>&1)
        } else {
            $output = @(& $Executable @Arguments 2>&1)
        }
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    return [pscustomobject]@{
        ExitCode = $exitCode
        Lines = @($output | ForEach-Object { $_.ToString() })
    }
}

function Assert-TeppuNativeSuccess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Result,
        [Parameter(Mandatory = $true)][string]$FailureCode
    )

    if ($Result.ExitCode -ne 0) {
        $detail = $Result.Lines -join [Environment]::NewLine
        throw "[$FailureCode] Native command failed with exit code $($Result.ExitCode).$([Environment]::NewLine)$detail"
    }
}

function Write-TeppuEvidenceText {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$EvidenceRoot
    )

    $destinationPath = Assert-TeppuPathWithin -Path $Destination -Root $EvidenceRoot -Label 'Android smoke text evidence'
    $temporary = Assert-TeppuPathWithin -Path (Join-Path $EvidenceRoot ('.smoke-text-{0}-{1}.tmp' -f $PID, [guid]::NewGuid().ToString('N'))) -Root $EvidenceRoot -Label 'Temporary Android smoke text evidence'
    try {
        [IO.File]::WriteAllText(
            $temporary,
            $Content + [Environment]::NewLine,
            (New-Object Text.UTF8Encoding($false))
        )
        Publish-TeppuFileAtomically -Source $temporary -Destination $destinationPath
    } finally {
        [IO.File]::Delete($temporary)
    }
}

function Get-TeppuUiTarget {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$XmlPath,
        [Parameter(Mandatory = $true)][string]$Text,
        [switch]$Contains
    )

    [xml]$document = [IO.File]::ReadAllText($XmlPath)
    $matches = @()
    foreach ($node in @($document.SelectNodes('//node'))) {
        if ($node -isnot [System.Xml.XmlElement]) { continue }
        $nodeText = $node.GetAttribute('text')
        $description = $node.GetAttribute('content-desc')
        $matched = if ($Contains.IsPresent) {
            $nodeText.Contains($Text) -or $description.Contains($Text)
        } else {
            [string]::Equals($nodeText, $Text, [StringComparison]::Ordinal) -or
            [string]::Equals($description, $Text, [StringComparison]::Ordinal)
        }
        if ($matched -and $node.GetAttribute('enabled') -ne 'false') {
            $matches += $node
        }
    }
    if ($matches.Count -eq 0) { return $null }

    $clickableMatches = @($matches | Where-Object { $_.GetAttribute('clickable') -eq 'true' })
    $selected = if ($clickableMatches.Count -gt 0) { $clickableMatches[0] } else { $matches[0] }
    if ($selected.GetAttribute('clickable') -ne 'true') {
        $ancestor = $selected.ParentNode
        while ($null -ne $ancestor -and $ancestor -is [System.Xml.XmlElement]) {
            if ($ancestor.GetAttribute('clickable') -eq 'true') {
                $selected = $ancestor
                break
            }
            $ancestor = $ancestor.ParentNode
        }
    }

    $bounds = $selected.GetAttribute('bounds')
    $match = [regex]::Match($bounds, '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$')
    if (-not $match.Success) {
        throw "[TEPPU_ANDROID_UI_BOUNDS_INVALID] UI node has invalid bounds: $bounds"
    }
    $left = [int]$match.Groups[1].Value
    $top = [int]$match.Groups[2].Value
    $right = [int]$match.Groups[3].Value
    $bottom = [int]$match.Groups[4].Value
    if ($right -le $left -or $bottom -le $top) {
        throw "[TEPPU_ANDROID_UI_BOUNDS_INVALID] UI node has empty bounds: $bounds"
    }
    return [pscustomobject]@{
        Bounds = $bounds
        CenterX = [int][Math]::Floor(($left + $right) / 2)
        CenterY = [int][Math]::Floor(($top + $bottom) / 2)
    }
}

function Export-TeppuCurrentUi {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$LocalPath
    )

    $remotePath = "/sdcard/teppu-current-ui-$PID.xml"
    [IO.File]::Delete($LocalPath)
    $dump = Invoke-TeppuNativeResult -Executable $Adb -Arguments @(
        '-s', $Serial, 'shell', 'uiautomator', 'dump', '--compressed', $remotePath
    )
    if ($dump.ExitCode -ne 0) { return $false }
    $pull = Invoke-TeppuNativeResult -Executable $Adb -Arguments @(
        '-s', $Serial, 'pull', $remotePath, $LocalPath
    )
    $null = Invoke-TeppuNativeResult -Executable $Adb -Arguments @(
        '-s', $Serial, 'shell', 'rm', '-f', $remotePath
    )
    return $pull.ExitCode -eq 0 -and (Test-Path -LiteralPath $LocalPath -PathType Leaf)
}

function Wait-TeppuUiTarget {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$WorkingXml,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [switch]$Contains
    )

    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        if (Export-TeppuCurrentUi -Adb $Adb -Serial $Serial -LocalPath $WorkingXml) {
            try {
                $target = Get-TeppuUiTarget -XmlPath $WorkingXml -Text $Text -Contains:$Contains.IsPresent
                if ($null -ne $target) { return $target }
            } catch {
                Write-Verbose $_.Exception.Message
            }
        }
        Start-Sleep -Milliseconds 1000
    }
    throw "[TEPPU_ANDROID_UI_TIMEOUT] Timed out waiting for required UI text after $TimeoutSeconds seconds."
}

function Invoke-TeppuSwipeUp {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial
    )

    $result = Invoke-TeppuNativeResult -Executable $Adb -Arguments @(
        '-s', $Serial, 'shell', 'input', 'swipe',
        '540', '1500', '540', '650', '350'
    )
    Assert-TeppuNativeSuccess -Result $result -FailureCode 'TEPPU_ANDROID_UI_SWIPE_FAILED'
}

function Wait-TeppuScrollableUiTarget {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$WorkingXml,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [ValidateRange(1, 10)][int]$MaxSwipes = 6,
        [switch]$Contains
    )

    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    $swipeCount = 0
    while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $targetIsClipped = $false
        if (Export-TeppuCurrentUi -Adb $Adb -Serial $Serial -LocalPath $WorkingXml) {
            try {
                $target = Get-TeppuUiTarget -XmlPath $WorkingXml -Text $Text -Contains:$Contains.IsPresent
                if ($null -ne $target) { return $target }
            } catch {
                if ($_.Exception.Message.StartsWith('[TEPPU_ANDROID_UI_BOUNDS_INVALID]', [StringComparison]::Ordinal)) {
                    $targetIsClipped = $true
                } else {
                    Write-Verbose $_.Exception.Message
                }
            }
        }
        if ($targetIsClipped -and $swipeCount -lt $MaxSwipes) {
            Invoke-TeppuSwipeUp -Adb $Adb -Serial $Serial
            $swipeCount += 1
            Write-Verbose "Scrolled toward the clipped UI target ($swipeCount/$MaxSwipes)."
            Start-Sleep -Milliseconds 700
            continue
        }
        Start-Sleep -Milliseconds 1000
    }
    throw "[TEPPU_ANDROID_UI_SCROLL_TIMEOUT] Timed out waiting for a visible UI target after $swipeCount swipe(s) and $TimeoutSeconds seconds."
}

function Invoke-TeppuTap {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)]$Target
    )

    $result = Invoke-TeppuNativeResult -Executable $Adb -Arguments @(
        '-s', $Serial, 'shell', 'input', 'tap',
        $Target.CenterX.ToString(), $Target.CenterY.ToString()
    )
    Assert-TeppuNativeSuccess -Result $result -FailureCode 'TEPPU_ANDROID_UI_TAP_FAILED'
}

function Save-TeppuDeviceFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$RemotePath,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string]$EvidenceRoot
    )

    $destinationPath = Assert-TeppuPathWithin -Path $Destination -Root $EvidenceRoot -Label 'Android smoke binary evidence'
    $temporary = Assert-TeppuPathWithin -Path (Join-Path $EvidenceRoot ('.smoke-pull-{0}-{1}.tmp' -f $PID, [guid]::NewGuid().ToString('N'))) -Root $EvidenceRoot -Label 'Temporary Android smoke binary evidence'
    try {
        $pull = Invoke-TeppuNativeResult -Executable $Adb -Arguments @(
            '-s', $Serial, 'pull', $RemotePath, $temporary
        )
        Assert-TeppuNativeSuccess -Result $pull -FailureCode 'TEPPU_ANDROID_EVIDENCE_PULL_FAILED'
        if ((Get-Item -LiteralPath $temporary).Length -le 0) {
            throw '[TEPPU_ANDROID_EVIDENCE_EMPTY] Pulled emulator evidence is empty.'
        }
        Publish-TeppuFileAtomically -Source $temporary -Destination $destinationPath
    } finally {
        [IO.File]::Delete($temporary)
    }
}

function Save-TeppuScreenEvidence {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Screenshot,
        [Parameter(Mandatory = $true)][string]$UiXml,
        [Parameter(Mandatory = $true)][string]$EvidenceRoot,
        [string]$ExistingUiXml
    )

    $remoteScreenshot = "/sdcard/teppu-$Name-$PID.png"
    $remoteUi = "/sdcard/teppu-$Name-$PID.xml"
    try {
        $capture = Invoke-TeppuNativeResult -Executable $Adb -Arguments @(
            '-s', $Serial, 'shell', 'screencap', '-p', $remoteScreenshot
        )
        Assert-TeppuNativeSuccess -Result $capture -FailureCode 'TEPPU_ANDROID_SCREENSHOT_FAILED'
        Save-TeppuDeviceFile -Adb $Adb -Serial $Serial -RemotePath $remoteScreenshot -Destination $Screenshot -EvidenceRoot $EvidenceRoot
        if ([string]::IsNullOrWhiteSpace($ExistingUiXml)) {
            $dump = Invoke-TeppuNativeResult -Executable $Adb -Arguments @(
                '-s', $Serial, 'shell', 'uiautomator', 'dump', '--compressed', $remoteUi
            )
            Assert-TeppuNativeSuccess -Result $dump -FailureCode 'TEPPU_ANDROID_UI_DUMP_FAILED'
            Save-TeppuDeviceFile -Adb $Adb -Serial $Serial -RemotePath $remoteUi -Destination $UiXml -EvidenceRoot $EvidenceRoot
        } else {
            $sourceUi = Assert-TeppuPathWithin -Path $ExistingUiXml -Root $EvidenceRoot -Label 'Existing Android UI evidence'
            if (-not (Test-Path -LiteralPath $sourceUi -PathType Leaf)) {
                throw "[TEPPU_ANDROID_UI_EVIDENCE_MISSING] Existing UI evidence was not found: $sourceUi"
            }
            $destinationUi = Assert-TeppuPathWithin -Path $UiXml -Root $EvidenceRoot -Label 'Android UI evidence destination'
            $temporaryUi = Assert-TeppuPathWithin -Path (Join-Path $EvidenceRoot ('.smoke-ui-{0}-{1}.tmp' -f $PID, [guid]::NewGuid().ToString('N'))) -Root $EvidenceRoot -Label 'Temporary Android UI evidence'
            try {
                [IO.File]::Copy($sourceUi, $temporaryUi, $false)
                if ((Get-Item -LiteralPath $temporaryUi).Length -le 0) {
                    throw '[TEPPU_ANDROID_EVIDENCE_EMPTY] Existing UI evidence is empty.'
                }
                Publish-TeppuFileAtomically -Source $temporaryUi -Destination $destinationUi
            } finally {
                [IO.File]::Delete($temporaryUi)
            }
        }
    } finally {
        $null = Invoke-TeppuNativeResult -Executable $Adb -Arguments @(
            '-s', $Serial, 'shell', 'rm', '-f', $remoteScreenshot, $remoteUi
        )
    }
}

function Save-TeppuLogcat {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string]$EvidenceRoot
    )

    $result = Invoke-TeppuNativeResult -Executable $Adb -Arguments @(
        '-s', $Serial, 'logcat', '-d', '-v', 'threadtime'
    )
    Assert-TeppuNativeSuccess -Result $result -FailureCode 'TEPPU_ANDROID_LOGCAT_FAILED'
    $fullText = $result.Lines -join [Environment]::NewLine
    $filtered = @($result.Lines | Where-Object {
        $_ -match 'io\.github\.ohe1013\.teppu|Capacitor|AndroidRuntime|FATAL EXCEPTION|ActivityTaskManager|ActivityNotFoundException|chromium'
    })
    $filteredText = if ($filtered.Count -eq 0) {
        'No matching application log lines were emitted.'
    } else {
        $filtered -join [Environment]::NewLine
    }
    Write-TeppuEvidenceText -Destination $Destination -Content $filteredText -EvidenceRoot $EvidenceRoot
    return $fullText
}

function Test-TeppuFatalLog {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Text)

    return $Text -match '(?im)FATAL EXCEPTION|AndroidRuntime[^\r\n]*(?:FATAL|Unable to start activity)|Unable to start activity|ActivityNotFoundException|\bam_crash\b'
}

function Assert-TeppuAvdImage {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$ConfigPath,
        [Parameter(Mandatory = $true)][string]$ExpectedImage
    )

    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
        throw '[TEPPU_ANDROID_AVD_CONFIG_MISSING] AVD config.ini was not found.'
    }
    $imageLine = Get-Content -LiteralPath $ConfigPath | Where-Object { $_ -match '^image\.sysdir\.1=' } | Select-Object -First 1
    if ($null -eq $imageLine) {
        throw '[TEPPU_ANDROID_AVD_IMAGE_MISSING] AVD system image is not configured.'
    }
    $actual = ($imageLine -replace '^image\.sysdir\.1=', '').Replace('/', '\').TrimEnd([char[]]'\/')
    $expected = $ExpectedImage.Replace(';', '\')
    if (-not [string]::Equals($actual, $expected, [StringComparison]::OrdinalIgnoreCase)) {
        throw "[TEPPU_ANDROID_AVD_IMAGE_MISMATCH] Expected $expected but received $actual."
    }
}

function Get-TeppuEmulatorPort {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Adb)

    $devices = Invoke-TeppuNativeResult -Executable $Adb -Arguments @('devices')
    Assert-TeppuNativeSuccess -Result $devices -FailureCode 'TEPPU_ANDROID_ADB_DEVICES_FAILED'
    $used = New-Object 'Collections.Generic.HashSet[int]'
    foreach ($line in $devices.Lines) {
        $match = [regex]::Match($line, '^emulator-(\d+)\s')
        if ($match.Success) { $null = $used.Add([int]$match.Groups[1].Value) }
    }
    try {
        foreach ($endpoint in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()) {
            $null = $used.Add($endpoint.Port)
        }
    } catch {
        Write-Verbose 'TCP listener discovery was unavailable; adb device ports remain protected.'
    }
    for ($port = 5554; $port -le 5682; $port += 2) {
        if (-not $used.Contains($port) -and -not $used.Contains($port + 1)) { return $port }
    }
    throw '[TEPPU_ANDROID_EMULATOR_PORT_MISSING] No free emulator port pair was found.'
}

$root = Resolve-TeppuProjectRoot -ProjectRoot $ProjectRoot -ScriptRoot $PSScriptRoot
if (-not [string]::Equals($AvdName, $ExpectedAvdName, [StringComparison]::Ordinal)) {
    throw '[TEPPU_ANDROID_AVD_NAME_INVALID] AVD name must be exactly Teppu_API_36.'
}
$evidenceRoot = Assert-TeppuPathWithin -Path (Join-Path $root 'artifacts\android\emulator') -Root $root -Label 'Android emulator evidence directory'
$evidencePaths = [pscustomobject]@{
    TitleScreenshot = Join-Path $evidenceRoot 'title.png'
    TitleUi = Join-Path $evidenceRoot 'title.xml'
    TowerScreenshot = Join-Path $evidenceRoot 'tower.png'
    TowerUi = Join-Path $evidenceRoot 'tower.xml'
    BattleScreenshot = Join-Path $evidenceRoot 'battle.png'
    BattleUi = Join-Path $evidenceRoot 'battle.xml'
    Logcat = Join-Path $evidenceRoot 'logcat.txt'
    Report = Join-Path $evidenceRoot 'smoke.txt'
    Stage = Join-Path $evidenceRoot 'stage.txt'
    FailureUi = Join-Path $evidenceRoot 'failure.xml'
    FailureReport = Join-Path $evidenceRoot 'failure.txt'
}
$expectedApk = Join-Path $root 'artifacts\android\teppu-1.0.0-release.apk'
$apkPath = if ([string]::IsNullOrWhiteSpace($Apk)) { $expectedApk } else { [IO.Path]::GetFullPath($Apk) }
$apkRoot = Assert-TeppuPathWithin -Path (Join-Path $root 'artifacts\android') -Root $root -Label 'Android APK artifact directory'
$apkPath = Assert-TeppuPathWithin -Path $apkPath -Root $apkRoot -Label 'Android smoke APK'
if (-not [string]::Equals([IO.Path]::GetFileName($apkPath), 'teppu-1.0.0-release.apk', [StringComparison]::Ordinal)) {
    throw '[TEPPU_ANDROID_SMOKE_APK_NAME_INVALID] Smoke APK filename is not the approved release artifact.'
}

if ($ValidateOnly.IsPresent) {
    Write-Output 'TEPPU_ANDROID_SMOKE_VALIDATION_OK'
    Write-Output "AVD: $ExpectedAvdName"
    Write-Output "Component: $Component"
    Write-Output "Evidence: $evidenceRoot"
    return
}

if (-not (Test-Path -LiteralPath $apkPath -PathType Leaf)) {
    throw '[TEPPU_ANDROID_SMOKE_APK_MISSING] Signed release APK was not found.'
}
$sdk = Resolve-TeppuAndroidSdk -AndroidSdk $AndroidSdk
$java = Resolve-TeppuJavaHome
$emulator = Join-Path $sdk 'emulator\emulator.exe'
$emulatorCheck = Join-Path $sdk 'emulator\emulator-check.exe'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$avdManager = Join-Path $sdk 'cmdline-tools\latest\bin\avdmanager.bat'
$systemImageProperties = Join-Path $sdk 'system-images\android-36\google_apis\x86_64\source.properties'
foreach ($tool in @($emulator, $emulatorCheck, $adb, $avdManager, $systemImageProperties)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
        throw "[TEPPU_ANDROID_SMOKE_TOOL_MISSING] Required emulator file was not found: $tool"
    }
}

New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
[IO.File]::Delete($evidencePaths.FailureUi)
[IO.File]::Delete($evidencePaths.FailureReport)
$workingUi = Assert-TeppuPathWithin -Path (Join-Path $evidenceRoot ('.current-ui-{0}.xml' -f $PID)) -Root $evidenceRoot -Label 'Current emulator UI dump'
$emulatorStdout = Assert-TeppuPathWithin -Path (Join-Path $evidenceRoot 'emulator-stdout.log') -Root $evidenceRoot -Label 'Emulator stdout log'
$emulatorStderr = Assert-TeppuPathWithin -Path (Join-Path $evidenceRoot 'emulator-stderr.log') -Root $evidenceRoot -Label 'Emulator stderr log'
$emulatorProcess = $null
$serial = $null
$startedEmulator = $false
$logcatSaved = $false
$previousJavaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Process')
$previousAndroidHome = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'Process')
$previousAndroidSdkRoot = [Environment]::GetEnvironmentVariable('ANDROID_SDK_ROOT', 'Process')
$currentStage = 'initializing'

try {
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    [Environment]::SetEnvironmentVariable('JAVA_HOME', $java.Home, 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdk, 'Process')

    & (Join-Path $PSScriptRoot 'Verify-AndroidRelease.ps1') -ProjectRoot $root -Apk $apkPath -AndroidSdk $sdk | Write-Output

    $acceleration = Invoke-TeppuNativeResult -Executable $emulatorCheck -Arguments @('accel')
    $accelerationText = $acceleration.Lines -join [Environment]::NewLine
    if ($acceleration.ExitCode -ne 0 -or $accelerationText -notmatch '(?i)installed and usable') {
        throw "[TEPPU_ANDROID_EMULATOR_ACCELERATION_BLOCKED] Emulator acceleration is unavailable.$([Environment]::NewLine)$accelerationText"
    }
    Write-Output 'TEPPU_ANDROID_EMULATOR_ACCELERATION_OK'
    $acceleration.Lines | ForEach-Object { Write-Output $_ }

    $profileRoot = Resolve-TeppuUserProfileRoot
    $avdRoot = Join-Path (Join-Path $profileRoot '.android') 'avd'
    $avdDirectory = Join-Path $avdRoot "$ExpectedAvdName.avd"
    $avdConfig = Join-Path $avdDirectory 'config.ini'
    $avdList = Invoke-TeppuNativeResult -Executable $emulator -Arguments @('-list-avds')
    Assert-TeppuNativeSuccess -Result $avdList -FailureCode 'TEPPU_ANDROID_AVD_LIST_FAILED'
    $avdExists = @($avdList.Lines | Where-Object { $_.Trim() -eq $ExpectedAvdName }).Count -gt 0
    if (-not $avdExists) {
        if (Test-Path -LiteralPath $avdDirectory) {
            throw '[TEPPU_ANDROID_AVD_PARTIAL] AVD directory exists but the emulator does not list it.'
        }
        $created = Invoke-TeppuNativeResult -Executable $avdManager -Arguments @(
            'create', 'avd',
            '--name', $ExpectedAvdName,
            '--package', $SystemImage,
            '--device', 'pixel_2'
        ) -Responses @('no')
        Assert-TeppuNativeSuccess -Result $created -FailureCode 'TEPPU_ANDROID_AVD_CREATE_FAILED'
        Write-Output 'TEPPU_ANDROID_AVD_CREATED'
    }
    Assert-TeppuAvdImage -ConfigPath $avdConfig -ExpectedImage $SystemImage
    Write-Output "TEPPU_ANDROID_AVD_READY $ExpectedAvdName"

    $currentStage = 'starting-emulator'
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    $port = Get-TeppuEmulatorPort -Adb $adb
    $serial = "emulator-$port"
    [IO.File]::Delete($emulatorStdout)
    [IO.File]::Delete($emulatorStderr)
    $emulatorProcess = Start-Process -FilePath $emulator -ArgumentList @(
        '-avd', $ExpectedAvdName,
        '-port', $port.ToString(),
        '-no-snapshot',
        '-no-boot-anim',
        '-no-audio',
        '-no-window',
        '-no-metrics',
        '-gpu', 'swiftshader_indirect'
    ) -PassThru -WindowStyle Hidden -RedirectStandardOutput $emulatorStdout -RedirectStandardError $emulatorStderr
    $startedEmulator = $true
    Write-Output "TEPPU_ANDROID_EMULATOR_STARTED $serial"

    $currentStage = 'waiting-for-boot'
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    $bootStopwatch = [Diagnostics.Stopwatch]::StartNew()
    $booted = $false
    while ($bootStopwatch.Elapsed.TotalSeconds -lt $BootTimeoutSeconds) {
        if ($emulatorProcess.HasExited) {
            throw "[TEPPU_ANDROID_EMULATOR_EXITED] Emulator process exited with code $($emulatorProcess.ExitCode)."
        }
        $boot = Invoke-TeppuNativeResult -Executable $adb -Arguments @(
            '-s', $serial, 'shell', 'getprop', 'sys.boot_completed'
        )
        if ($boot.ExitCode -eq 0 -and (($boot.Lines -join '').Trim() -eq '1')) {
            $booted = $true
            break
        }
        Start-Sleep -Milliseconds 2000
    }
    if (-not $booted) {
        throw "[TEPPU_ANDROID_EMULATOR_BOOT_TIMEOUT] Emulator did not boot within $BootTimeoutSeconds seconds."
    }
    Write-Output 'TEPPU_ANDROID_EMULATOR_BOOTED'

    $preparationCommands = @(
        ,@('shell', 'input', 'keyevent', '82')
        ,@('shell', 'wm', 'dismiss-keyguard')
        ,@('shell', 'settings', 'put', 'global', 'window_animation_scale', '0')
        ,@('shell', 'settings', 'put', 'global', 'transition_animation_scale', '0')
        ,@('shell', 'settings', 'put', 'global', 'animator_duration_scale', '0')
    )
    foreach ($command in $preparationCommands) {
        $result = Invoke-TeppuNativeResult -Executable $adb -Arguments (@('-s', $serial) + $command)
        Assert-TeppuNativeSuccess -Result $result -FailureCode 'TEPPU_ANDROID_EMULATOR_PREPARE_FAILED'
    }

    $currentStage = 'installing-apk'
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    $installation = Invoke-TeppuNativeResult -Executable $adb -Arguments @(
        '-s', $serial, 'install', '-r', $apkPath
    )
    Assert-TeppuNativeSuccess -Result $installation -FailureCode 'TEPPU_ANDROID_APK_INSTALL_FAILED'
    if (($installation.Lines -join "`n") -notmatch '(?m)^Success\s*$') {
        throw '[TEPPU_ANDROID_APK_INSTALL_UNCONFIRMED] adb did not report installation success.'
    }
    $clearData = Invoke-TeppuNativeResult -Executable $adb -Arguments @(
        '-s', $serial, 'shell', 'pm', 'clear', $PackageName
    )
    Assert-TeppuNativeSuccess -Result $clearData -FailureCode 'TEPPU_ANDROID_APP_DATA_CLEAR_FAILED'
    if (($clearData.Lines -join "`n") -notmatch '(?m)^Success\s*$') {
        throw '[TEPPU_ANDROID_APP_DATA_CLEAR_UNCONFIRMED] Package manager did not confirm app data clearing.'
    }
    $clearLog = Invoke-TeppuNativeResult -Executable $adb -Arguments @(
        '-s', $serial, 'logcat', '-c'
    )
    Assert-TeppuNativeSuccess -Result $clearLog -FailureCode 'TEPPU_ANDROID_LOGCAT_CLEAR_FAILED'
    $launch = Invoke-TeppuNativeResult -Executable $adb -Arguments @(
        '-s', $serial, 'shell', 'am', 'start', '-W', '-n', $Component
    )
    Assert-TeppuNativeSuccess -Result $launch -FailureCode 'TEPPU_ANDROID_ACTIVITY_LAUNCH_FAILED'
    $launchText = $launch.Lines -join "`n"
    if (
        $launchText -match '(?im)^Error:|ActivityNotFoundException' -or
        $launchText -notmatch '(?im)^Status:\s*ok\s*$'
    ) {
        throw "[TEPPU_ANDROID_ACTIVITY_LAUNCH_UNCONFIRMED] Activity launch was not successful.$([Environment]::NewLine)$launchText"
    }
    Write-Output 'TEPPU_ANDROID_APP_LAUNCHED'

    $challengeStart = New-TeppuText -CodePoints @(0xB3C4, 0xC804, 0x20, 0xC2DC, 0xC791)
    $rivet = New-TeppuText -CodePoints @(0xB9AC, 0xBCB3)
    $floorOne = New-TeppuText -CodePoints @(0x31, 0xCE35, 0x20, 0xC120, 0xD0DD)
    $matchStart = New-TeppuText -CodePoints @(0xB300, 0xC804, 0x20, 0xC2DC, 0xC791)
    $matchPlaying = New-TeppuText -CodePoints @(0xB300, 0xC804, 0x20, 0xC9C4, 0xD589, 0x20, 0xC911)

    $currentStage = 'waiting-title'
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    $target = Wait-TeppuUiTarget -Adb $adb -Serial $serial -Text $challengeStart -WorkingXml $workingUi -TimeoutSeconds $UiTimeoutSeconds
    Save-TeppuScreenEvidence -Adb $adb -Serial $serial -Name 'title' -Screenshot $evidencePaths.TitleScreenshot -UiXml $evidencePaths.TitleUi -EvidenceRoot $evidenceRoot -ExistingUiXml $workingUi
    Write-Output 'TEPPU_ANDROID_TITLE_CAPTURED'
    Invoke-TeppuTap -Adb $adb -Serial $serial -Target $target

    foreach ($initial in @('R', 'V', 'T', 'END')) {
        $currentStage = "waiting-initial-$initial"
        Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
        $initialTarget = Wait-TeppuUiTarget -Adb $adb -Serial $serial -Text $initial -WorkingXml $workingUi -TimeoutSeconds $UiTimeoutSeconds
        Invoke-TeppuTap -Adb $adb -Serial $serial -Target $initialTarget
        Start-Sleep -Milliseconds 150
    }

    $currentStage = 'waiting-rivet'
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    $rivetTarget = Wait-TeppuUiTarget -Adb $adb -Serial $serial -Text $rivet -WorkingXml $workingUi -TimeoutSeconds $UiTimeoutSeconds -Contains
    Invoke-TeppuTap -Adb $adb -Serial $serial -Target $rivetTarget
    $currentStage = 'waiting-select'
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    $selectTarget = Wait-TeppuUiTarget -Adb $adb -Serial $serial -Text 'SELECT' -WorkingXml $workingUi -TimeoutSeconds $UiTimeoutSeconds
    Invoke-TeppuTap -Adb $adb -Serial $serial -Target $selectTarget

    $currentStage = 'waiting-floor-one'
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    $floorTarget = Wait-TeppuScrollableUiTarget -Adb $adb -Serial $serial -Text $floorOne -WorkingXml $workingUi -TimeoutSeconds $UiTimeoutSeconds -Contains
    Save-TeppuScreenEvidence -Adb $adb -Serial $serial -Name 'tower' -Screenshot $evidencePaths.TowerScreenshot -UiXml $evidencePaths.TowerUi -EvidenceRoot $evidenceRoot -ExistingUiXml $workingUi
    Write-Output 'TEPPU_ANDROID_TOWER_CAPTURED'
    Invoke-TeppuTap -Adb $adb -Serial $serial -Target $floorTarget

    $currentStage = 'waiting-match-start'
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    $matchTarget = Wait-TeppuUiTarget -Adb $adb -Serial $serial -Text $matchStart -WorkingXml $workingUi -TimeoutSeconds $UiTimeoutSeconds -Contains
    Invoke-TeppuTap -Adb $adb -Serial $serial -Target $matchTarget
    $currentStage = 'waiting-match-playing'
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    $null = Wait-TeppuUiTarget -Adb $adb -Serial $serial -Text $matchPlaying -WorkingXml $workingUi -TimeoutSeconds $UiTimeoutSeconds -Contains
    Start-Sleep -Milliseconds 1500
    Save-TeppuScreenEvidence -Adb $adb -Serial $serial -Name 'battle' -Screenshot $evidencePaths.BattleScreenshot -UiXml $evidencePaths.BattleUi -EvidenceRoot $evidenceRoot -ExistingUiXml $workingUi
    Write-Output 'TEPPU_ANDROID_BATTLE_CAPTURED'

    $currentStage = 'checking-logcat'
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    $logText = Save-TeppuLogcat -Adb $adb -Serial $serial -Destination $evidencePaths.Logcat -EvidenceRoot $evidenceRoot
    $logcatSaved = $true
    if (Test-TeppuFatalLog -Text $logText) {
        throw '[TEPPU_ANDROID_FATAL_LOG] Fatal Android application log was detected.'
    }

    $apkHash = (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $report = @(
        'Teppu Android emulator smoke verification'
        "Verified (UTC): $([DateTime]::UtcNow.ToString('o'))"
        "AVD: $ExpectedAvdName"
        "Serial: $serial"
        "Component: $Component"
        "APK: $([IO.Path]::GetFileName($apkPath))"
        "APK SHA-256: $apkHash"
        'Install: success'
        'Launch: success'
        'Title screen: captured'
        'Tower screen: captured'
        'Battle screen: captured'
        'Fatal application log: none detected'
    ) -join [Environment]::NewLine
    Write-TeppuEvidenceText -Destination $evidencePaths.Report -Content $report -EvidenceRoot $evidenceRoot
    $currentStage = 'complete'
    Write-TeppuEvidenceText -Destination $evidencePaths.Stage -Content $currentStage -EvidenceRoot $evidenceRoot
    Write-Output 'TEPPU_ANDROID_SMOKE_OK'
    Write-Output $report
} catch {
    $failure = $_
    try {
        $failureText = @(
            'Teppu Android emulator smoke failure'
            "Failed (UTC): $([DateTime]::UtcNow.ToString('o'))"
            "Stage: $currentStage"
            "Exception: $($failure.Exception.GetType().FullName)"
            "Message: $($failure.Exception.Message)"
            "Script stack: $($failure.ScriptStackTrace)"
        ) -join [Environment]::NewLine
        Write-TeppuEvidenceText -Destination $evidencePaths.FailureReport -Content $failureText -EvidenceRoot $evidenceRoot
        if (Test-Path -LiteralPath $workingUi -PathType Leaf) {
            $temporaryFailureUi = Assert-TeppuPathWithin -Path (Join-Path $evidenceRoot ('.failure-ui-{0}-{1}.tmp' -f $PID, [guid]::NewGuid().ToString('N'))) -Root $evidenceRoot -Label 'Temporary failure UI evidence'
            try {
                [IO.File]::Copy($workingUi, $temporaryFailureUi, $false)
                Publish-TeppuFileAtomically -Source $temporaryFailureUi -Destination $evidencePaths.FailureUi
            } finally {
                [IO.File]::Delete($temporaryFailureUi)
            }
        }
    } catch {
        Write-Warning "Failed to preserve smoke failure evidence: $($_.Exception.Message)"
    }
    throw $failure
} finally {
    if ($startedEmulator -and -not $logcatSaved -and $null -ne $serial) {
        try {
            $null = Save-TeppuLogcat -Adb $adb -Serial $serial -Destination $evidencePaths.Logcat -EvidenceRoot $evidenceRoot
        } catch {
            Write-Warning "Failed to preserve logcat during cleanup: $($_.Exception.Message)"
        }
    }
    [IO.File]::Delete($workingUi)
    if ($startedEmulator -and $null -ne $serial) {
        try {
            $null = Invoke-TeppuNativeResult -Executable $adb -Arguments @('-s', $serial, 'emu', 'kill')
        } catch {
            Write-Warning "Failed to request emulator shutdown: $($_.Exception.Message)"
        }
        if ($null -ne $emulatorProcess) {
            $null = $emulatorProcess.WaitForExit(10000)
            if (-not $emulatorProcess.HasExited) {
                Stop-Process -Id $emulatorProcess.Id -Force
            }
            $emulatorProcess.Dispose()
        }
        Write-Output "TEPPU_ANDROID_EMULATOR_STOPPED $serial"
    }
    [Environment]::SetEnvironmentVariable('JAVA_HOME', $previousJavaHome, 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_HOME', $previousAndroidHome, 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $previousAndroidSdkRoot, 'Process')
}
