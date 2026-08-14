[CmdletBinding()]
param(
    [switch]$ValidateOnly,
    [switch]$AcceptLicenses,
    [string]$AndroidSdk,
    [string]$Archive,
    [string]$ProjectRoot,
    [string]$JavaHome
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AndroidRelease.Common.ps1')

$ToolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip'
$ToolsSha256 = '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
$Packages = @(
    'platform-tools',
    'platforms;android-36',
    'build-tools;36.0.0',
    'emulator',
    'system-images;android-36;google_apis;x86_64'
)

function Resolve-TeppuApprovedAndroidSdk {
    [CmdletBinding()]
    param([string]$RequestedPath)

    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        throw '[TEPPU_ANDROID_SDK_ROOT_MISSING] LOCALAPPDATA is unavailable.'
    }
    $approved = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Android\Sdk'))
    $candidate = if ([string]::IsNullOrWhiteSpace($RequestedPath)) {
        $approved
    } else {
        [IO.Path]::GetFullPath($RequestedPath)
    }
    if (-not [string]::Equals($candidate, $approved, [StringComparison]::OrdinalIgnoreCase)) {
        throw '[TEPPU_ANDROID_SDK_ROOT_REJECTED] SDK installation is confined to the current user Android SDK directory.'
    }
    return $candidate
}

function Assert-TeppuToolsArchive {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = [IO.Path]::GetFullPath($Path)
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw '[TEPPU_ANDROID_TOOLS_ARCHIVE_MISSING] Android command-line tools archive was not found.'
    }
    $actual = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
    if (-not [string]::Equals($actual, $ToolsSha256, [StringComparison]::Ordinal)) {
        throw "[TEPPU_ANDROID_TOOLS_CHECKSUM_MISMATCH] Expected $ToolsSha256 but received $actual."
    }
    return $resolved
}

function Invoke-TeppuSdkManager {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$SdkManager,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string[]]$Responses = @()
    )

    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        if ($Responses.Count -gt 0) {
            $output = @($Responses | & $SdkManager @Arguments 2>&1)
        } else {
            $output = @(& $SdkManager @Arguments 2>&1)
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

function Assert-TeppuSdkManagerSuccess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Result,
        [Parameter(Mandatory = $true)][string]$FailureCode
    )

    if ($Result.ExitCode -ne 0) {
        $detail = $Result.Lines -join [Environment]::NewLine
        throw "[$FailureCode] sdkmanager failed with exit code $($Result.ExitCode).$([Environment]::NewLine)$detail"
    }
}

function Assert-TeppuInstalledPackages {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$SdkManager,
        [Parameter(Mandatory = $true)][string]$SdkRoot
    )

    $result = Invoke-TeppuSdkManager -SdkManager $SdkManager -Arguments @(
        "--sdk_root=$SdkRoot",
        '--list_installed'
    )
    Assert-TeppuSdkManagerSuccess -Result $result -FailureCode 'TEPPU_ANDROID_SDK_LIST_FAILED'
    $text = $result.Lines -join "`n"
    foreach ($package in $Packages) {
        $pattern = '(?m)^\s*' + [regex]::Escape($package) + '\s+\|'
        if ($text -notmatch $pattern) {
            throw "[TEPPU_ANDROID_SDK_PACKAGE_MISSING] Required package is not installed: $package"
        }
    }
    return $result.Lines
}

function Write-TeppuLocalProperties {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$SdkRoot
    )

    $androidRoot = Assert-TeppuPathWithin -Path (Join-Path $Root 'android') -Root $Root -Label 'Android project directory'
    $destination = Assert-TeppuPathWithin -Path (Join-Path $androidRoot 'local.properties') -Root $androidRoot -Label 'Gradle local properties'
    $temporary = Assert-TeppuPathWithin -Path (Join-Path $androidRoot ('.local-properties-{0}-{1}.tmp' -f $PID, [guid]::NewGuid().ToString('N'))) -Root $androidRoot -Label 'Temporary Gradle local properties'
    $escapedSdk = $SdkRoot.Replace('\', '\\').Replace(':', '\:')
    try {
        [IO.File]::WriteAllText(
            $temporary,
            "sdk.dir=$escapedSdk$([Environment]::NewLine)",
            (New-Object Text.UTF8Encoding($false))
        )
        Publish-TeppuFileAtomically -Source $temporary -Destination $destination
    } finally {
        if (Test-Path -LiteralPath $temporary -PathType Leaf) {
            Remove-Item -LiteralPath $temporary -Force
        }
    }
}

$root = Resolve-TeppuProjectRoot -ProjectRoot $ProjectRoot -ScriptRoot $PSScriptRoot
$sdk = Resolve-TeppuApprovedAndroidSdk -RequestedPath $AndroidSdk
$providedArchive = $null
if (-not [string]::IsNullOrWhiteSpace($Archive)) {
    $providedArchive = Assert-TeppuToolsArchive -Path $Archive
}

if ($ValidateOnly.IsPresent -and $null -ne $providedArchive) {
    Write-Output 'TEPPU_ANDROID_SDK_ARCHIVE_VALID'
    Write-Output "Archive SHA-256: $ToolsSha256"
    return
}

$java = Resolve-TeppuJavaHome -JavaHome $JavaHome
$sdkManager = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
$latestRoot = Join-Path $sdk 'cmdline-tools\latest'
$temporaryRoot = $null
$stagingRoot = $null

if ($ValidateOnly.IsPresent) {
    if (-not (Test-Path -LiteralPath $sdkManager -PathType Leaf)) {
        throw '[TEPPU_ANDROID_SDK_TOOLS_MISSING] Verified Android command-line tools are not installed.'
    }
    $previousJavaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Process')
    $previousAndroidHome = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'Process')
    $previousAndroidSdkRoot = [Environment]::GetEnvironmentVariable('ANDROID_SDK_ROOT', 'Process')
    try {
        [Environment]::SetEnvironmentVariable('JAVA_HOME', $java.Home, 'Process')
        [Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'Process')
        [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdk, 'Process')
        $null = Assert-TeppuInstalledPackages -SdkManager $sdkManager -SdkRoot $sdk
    } finally {
        [Environment]::SetEnvironmentVariable('JAVA_HOME', $previousJavaHome, 'Process')
        [Environment]::SetEnvironmentVariable('ANDROID_HOME', $previousAndroidHome, 'Process')
        [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $previousAndroidSdkRoot, 'Process')
    }
    $localProperties = Join-Path $root 'android\local.properties'
    if (-not (Test-Path -LiteralPath $localProperties -PathType Leaf)) {
        throw '[TEPPU_ANDROID_LOCAL_PROPERTIES_MISSING] Gradle SDK location is not configured.'
    }
    $expectedSdk = "sdk.dir=$($sdk.Replace('\', '\\').Replace(':', '\:'))"
    if (-not [string]::Equals([IO.File]::ReadAllText($localProperties).Trim(), $expectedSdk, [StringComparison]::Ordinal)) {
        throw '[TEPPU_ANDROID_LOCAL_PROPERTIES_INVALID] Gradle SDK location is incorrect.'
    }
    Write-Output 'TEPPU_ANDROID_SDK_VALID'
    Write-Output "SDK: $sdk"
    $Packages | ForEach-Object { Write-Output "Package: $_" }
    return
}

try {
    if (-not (Test-Path -LiteralPath $sdkManager -PathType Leaf)) {
        if (Test-Path -LiteralPath $latestRoot) {
            throw '[TEPPU_ANDROID_SDK_TOOLS_PARTIAL] cmdline-tools\latest exists but sdkmanager.bat is missing.'
        }

        $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        $temporaryRoot = Assert-TeppuPathWithin -Path (Join-Path $systemTemp ('teppu-android-sdk-{0}-{1}' -f $PID, [guid]::NewGuid().ToString('N'))) -Root $systemTemp -Label 'Temporary Android SDK directory'
        New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
        $archivePath = if ($null -ne $providedArchive) {
            $providedArchive
        } else {
            $download = Assert-TeppuPathWithin -Path (Join-Path $temporaryRoot 'command-line-tools.zip') -Root $temporaryRoot -Label 'Downloaded Android tools archive'
            $previousProgress = $ProgressPreference
            $previousSecurityProtocol = [Net.ServicePointManager]::SecurityProtocol
            try {
                $ProgressPreference = 'SilentlyContinue'
                [Net.ServicePointManager]::SecurityProtocol = $previousSecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -UseBasicParsing -Uri $ToolsUrl -OutFile $download
            } finally {
                $ProgressPreference = $previousProgress
                [Net.ServicePointManager]::SecurityProtocol = $previousSecurityProtocol
            }
            Assert-TeppuToolsArchive -Path $download
        }

        $extracted = Assert-TeppuPathWithin -Path (Join-Path $temporaryRoot 'extracted') -Root $temporaryRoot -Label 'Extracted Android tools directory'
        New-Item -ItemType Directory -Path $extracted | Out-Null
        if ([string]::IsNullOrWhiteSpace($env:WINDIR)) {
            throw '[TEPPU_WINDOWS_DIRECTORY_MISSING] WINDIR is unavailable.'
        }
        $tar = Join-Path ([IO.Path]::GetFullPath($env:WINDIR)) 'System32\tar.exe'
        $null = Invoke-TeppuProcessCapture -Executable $tar -Arguments @(
            '-xf',
            $archivePath,
            '-C',
            $extracted
        ) -FailureCode 'TEPPU_ANDROID_TOOLS_EXTRACTION_FAILED'
        $extractedTools = Join-Path $extracted 'cmdline-tools'
        if (-not (Test-Path -LiteralPath (Join-Path $extractedTools 'bin\sdkmanager.bat') -PathType Leaf)) {
            throw '[TEPPU_ANDROID_TOOLS_ARCHIVE_INVALID] Verified archive has an unexpected directory layout.'
        }

        $cmdlineParent = Assert-TeppuPathWithin -Path (Join-Path $sdk 'cmdline-tools') -Root $sdk -Label 'Android command-line tools directory'
        New-Item -ItemType Directory -Path $cmdlineParent -Force | Out-Null
        $stagingRoot = Assert-TeppuPathWithin -Path (Join-Path $cmdlineParent ('.latest-{0}-{1}' -f $PID, [guid]::NewGuid().ToString('N'))) -Root $cmdlineParent -Label 'Staged Android command-line tools'
        Copy-Item -LiteralPath $extractedTools -Destination $stagingRoot -Recurse
        if (-not (Test-Path -LiteralPath (Join-Path $stagingRoot 'bin\sdkmanager.bat') -PathType Leaf)) {
            throw '[TEPPU_ANDROID_TOOLS_STAGING_FAILED] sdkmanager.bat was not staged correctly.'
        }
        [IO.Directory]::Move($stagingRoot, $latestRoot)
        $stagingRoot = $null
        $sdkManager = Join-Path $latestRoot 'bin\sdkmanager.bat'
        Write-Output 'TEPPU_ANDROID_TOOLS_INSTALLED'
        Write-Output "Archive SHA-256: $ToolsSha256"
    }

    $previousJavaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Process')
    $previousAndroidHome = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'Process')
    $previousAndroidSdkRoot = [Environment]::GetEnvironmentVariable('ANDROID_SDK_ROOT', 'Process')
    try {
        [Environment]::SetEnvironmentVariable('JAVA_HOME', $java.Home, 'Process')
        [Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'Process')
        [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdk, 'Process')

        if ($AcceptLicenses.IsPresent) {
            $acceptance = Invoke-TeppuSdkManager -SdkManager $sdkManager -Arguments @(
                "--sdk_root=$sdk",
                '--licenses'
            ) -Responses (@('y') * 64)
            Assert-TeppuSdkManagerSuccess -Result $acceptance -FailureCode 'TEPPU_ANDROID_LICENSE_ACCEPTANCE_FAILED'
            Write-Output 'TEPPU_ANDROID_LICENSES_ACCEPTED'
        } else {
            $probe = Invoke-TeppuSdkManager -SdkManager $sdkManager -Arguments @(
                "--sdk_root=$sdk",
                '--licenses'
            ) -Responses (@('n') * 64)
            $probeText = $probe.Lines -join "`n"
            if ($probeText -match '(?i)Accept\?\s*\(y/N\)' -or $probeText -match '(?i)licenses?.*not.*accepted') {
                throw '[TEPPU_ANDROID_LICENSE_APPROVAL_REQUIRED] Google sdkmanager prompt: Accept? (y/N). Re-run with -AcceptLicenses only after explicit user approval.'
            }
            Assert-TeppuSdkManagerSuccess -Result $probe -FailureCode 'TEPPU_ANDROID_LICENSE_CHECK_FAILED'
        }

        $installResponses = if ($AcceptLicenses.IsPresent) { @('y') * 64 } else { @() }
        $installation = Invoke-TeppuSdkManager -SdkManager $sdkManager -Arguments (@(
            "--sdk_root=$sdk"
        ) + $Packages) -Responses $installResponses
        Assert-TeppuSdkManagerSuccess -Result $installation -FailureCode 'TEPPU_ANDROID_SDK_INSTALL_FAILED'
        $installationText = $installation.Lines -join "`n"
        if ($installationText -match '(?i)licenses?.*not.*accepted') {
            throw '[TEPPU_ANDROID_LICENSE_ACCEPTANCE_INCOMPLETE] Required package licenses remain unaccepted.'
        }
        $null = Assert-TeppuInstalledPackages -SdkManager $sdkManager -SdkRoot $sdk
    } finally {
        [Environment]::SetEnvironmentVariable('JAVA_HOME', $previousJavaHome, 'Process')
        [Environment]::SetEnvironmentVariable('ANDROID_HOME', $previousAndroidHome, 'Process')
        [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $previousAndroidSdkRoot, 'Process')
    }

    Write-TeppuLocalProperties -Root $root -SdkRoot $sdk
    Write-Output 'TEPPU_ANDROID_SDK_INSTALLED'
    Write-Output "SDK: $sdk"
    $Packages | ForEach-Object { Write-Output "Package: $_" }
} finally {
    if (-not [string]::IsNullOrWhiteSpace($stagingRoot) -and (Test-Path -LiteralPath $stagingRoot -PathType Container)) {
        $cmdlineParent = [IO.Path]::GetFullPath((Join-Path $sdk 'cmdline-tools'))
        $null = Assert-TeppuPathWithin -Path $stagingRoot -Root $cmdlineParent -Label 'Staged Android command-line tools cleanup'
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force
    }
    if (-not [string]::IsNullOrWhiteSpace($temporaryRoot) -and (Test-Path -LiteralPath $temporaryRoot -PathType Container)) {
        $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        $null = Assert-TeppuPathWithin -Path $temporaryRoot -Root $systemTemp -Label 'Temporary Android SDK cleanup'
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
