[CmdletBinding()]
param(
    [switch]$ValidateOnly,
    [string]$ProjectRoot,
    [string]$UserProfileRoot,
    [string]$JavaHome,
    [string]$AndroidSdk,
    [string]$NodeRoot,
    [string]$Version = '1.0.0'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AndroidRelease.Common.ps1')

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw '[TEPPU_ANDROID_VERSION_INVALID] Version must use major.minor.patch.'
}

$root = Resolve-TeppuProjectRoot -ProjectRoot $ProjectRoot -ScriptRoot $PSScriptRoot
$profileRoot = Resolve-TeppuUserProfileRoot -UserProfileRoot $UserProfileRoot -AllowOverride:$ValidateOnly.IsPresent
$signingPaths = Get-TeppuSigningPaths -UserProfileRoot $profileRoot
$null = Assert-TeppuPathWithin -Path $signingPaths.Directory -Root $profileRoot -Label 'Signing directory'
$signingState = Get-TeppuSigningState -Paths $signingPaths
if ($signingState -eq 'Partial') {
    throw '[TEPPU_SIGNING_SETUP_PARTIAL] Signing files are incomplete.'
}
if ($signingState -eq 'Missing') {
    throw '[TEPPU_SIGNING_SETUP_MISSING] Run npm run signing:android:init first.'
}

$java = Resolve-TeppuJavaHome -JavaHome $JavaHome
$node = Resolve-TeppuNodeToolchain -NodeRoot $NodeRoot
$sdk = Resolve-TeppuAndroidSdk -AndroidSdk $AndroidSdk
$requiredSdkFiles = @(
    (Join-Path $sdk 'platforms\android-36\android.jar'),
    (Join-Path $sdk 'build-tools\36.0.0\aapt.exe'),
    (Join-Path $sdk 'build-tools\36.0.0\apksigner.bat')
)
foreach ($requiredFile in $requiredSdkFiles) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "[TEPPU_ANDROID_SDK_INCOMPLETE] Required SDK file is missing: $requiredFile"
    }
}
$gradleWrapper = Join-Path $root 'android\gradlew.bat'
if (-not (Test-Path -LiteralPath $gradleWrapper -PathType Leaf)) {
    throw '[TEPPU_GRADLE_WRAPPER_MISSING] Android Gradle wrapper was not found.'
}

$credential = Import-TeppuSigningCredential -CredentialPath $signingPaths.Credential -ExpectedAlias 'teppu-upload'
$certificate = Get-TeppuCertificateInfo -Paths $signingPaths -Credential $credential -Keytool $java.Keytool -Alias 'teppu-upload'

if ($ValidateOnly.IsPresent) {
    Write-Output 'TEPPU_ANDROID_RELEASE_VALIDATION_OK'
    Write-Output "Certificate SHA-256: $($certificate.FingerprintSha256)"
    return
}

Push-Location $root
try {
    $syncOutput = Invoke-TeppuProcessCapture -Executable $node.Npm -Arguments @('run', 'sync:android') -FailureCode 'TEPPU_ANDROID_SYNC_FAILED'
    $syncOutput | ForEach-Object { Write-Output $_ }
} finally {
    Pop-Location
}

$environmentNames = @(
    'JAVA_HOME',
    'ANDROID_HOME',
    'ANDROID_SDK_ROOT',
    'TEPPU_KEYSTORE_PATH',
    'TEPPU_KEYSTORE_PASSWORD',
    'TEPPU_KEY_ALIAS',
    'TEPPU_KEY_PASSWORD'
)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$password = $credential.GetNetworkCredential().Password
try {
    [Environment]::SetEnvironmentVariable('JAVA_HOME', $java.Home, 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdk, 'Process')
    [Environment]::SetEnvironmentVariable('TEPPU_KEYSTORE_PATH', $signingPaths.Keystore, 'Process')
    [Environment]::SetEnvironmentVariable('TEPPU_KEYSTORE_PASSWORD', $password, 'Process')
    [Environment]::SetEnvironmentVariable('TEPPU_KEY_ALIAS', 'teppu-upload', 'Process')
    [Environment]::SetEnvironmentVariable('TEPPU_KEY_PASSWORD', $password, 'Process')
    Push-Location (Join-Path $root 'android')
    try {
        $gradleOutput = Invoke-TeppuProcessCapture -Executable $gradleWrapper -Arguments @(
            '--no-daemon',
            '--console=plain',
            'assembleRelease'
        ) -FailureCode 'TEPPU_ANDROID_GRADLE_FAILED'
        $gradleOutput | ForEach-Object { Write-Output $_ }
    } finally {
        Pop-Location
    }
} finally {
    $password = $null
    $credential = $null
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
}

$sourceApk = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $sourceApk -PathType Leaf)) {
    throw '[TEPPU_ANDROID_GRADLE_OUTPUT_MISSING] Signed Gradle release APK was not produced.'
}
$artifactDirectory = Assert-TeppuPathWithin -Path (Join-Path $root 'artifacts\android') -Root $root -Label 'Android artifact directory'
New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
$artifact = Assert-TeppuPathWithin -Path (Join-Path $artifactDirectory "teppu-$Version-release.apk") -Root $artifactDirectory -Label 'Android release APK'
$temporaryArtifact = Assert-TeppuPathWithin -Path (Join-Path $artifactDirectory ('.teppu-release-{0}-{1}.tmp' -f $PID, [guid]::NewGuid().ToString('N'))) -Root $artifactDirectory -Label 'Temporary Android release APK'
$checksumPath = "$artifact.sha256"
$temporaryChecksum = Assert-TeppuPathWithin -Path (Join-Path $artifactDirectory ('.teppu-checksum-{0}-{1}.tmp' -f $PID, [guid]::NewGuid().ToString('N'))) -Root $artifactDirectory -Label 'Temporary Android checksum'

try {
    [IO.File]::Copy($sourceApk, $temporaryArtifact, $false)
    Publish-TeppuFileAtomically -Source $temporaryArtifact -Destination $artifact
    $hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText(
        $temporaryChecksum,
        "$hash  $([IO.Path]::GetFileName($artifact))$([Environment]::NewLine)",
        (New-Object Text.UTF8Encoding($false))
    )
    Publish-TeppuFileAtomically -Source $temporaryChecksum -Destination $checksumPath
} finally {
    foreach ($temporaryPath in @($temporaryArtifact, $temporaryChecksum)) {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
}

Write-Output 'TEPPU_ANDROID_RELEASE_BUILT'
Write-Output "APK: $artifact"
Write-Output "SHA-256: $hash"
Write-Output "Certificate SHA-256: $($certificate.FingerprintSha256)"
