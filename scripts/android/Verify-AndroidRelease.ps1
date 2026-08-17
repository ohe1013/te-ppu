[CmdletBinding()]
param(
    [switch]$ValidateOnly,
    [string]$ProjectRoot,
    [string]$Apk,
    [string]$AndroidSdk
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AndroidRelease.Common.ps1')

$root = Resolve-TeppuProjectRoot -ProjectRoot $ProjectRoot -ScriptRoot $PSScriptRoot
$artifactDirectory = Assert-TeppuPathWithin -Path (Join-Path $root 'artifacts\android') -Root $root -Label 'Android artifact directory'
$expectedApk = Join-Path $artifactDirectory 'teppu-1.0.0-release.apk'
$apkPath = if ([string]::IsNullOrWhiteSpace($Apk)) { $expectedApk } else { [IO.Path]::GetFullPath($Apk) }
$apkPath = Assert-TeppuPathWithin -Path $apkPath -Root $artifactDirectory -Label 'Android release APK'
if (-not (Test-Path -LiteralPath $apkPath -PathType Leaf)) {
    throw '[TEPPU_ANDROID_APK_MISSING] Release APK was not found.'
}
if (-not [string]::Equals([IO.Path]::GetFileName($apkPath), 'teppu-1.0.0-release.apk', [StringComparison]::Ordinal)) {
    throw '[TEPPU_ANDROID_APK_NAME_INVALID] Release APK filename is not versioned as expected.'
}

$checksumPath = "$apkPath.sha256"
if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
    throw '[TEPPU_ANDROID_CHECKSUM_MISSING] APK checksum file was not found.'
}
$sdk = Resolve-TeppuAndroidSdk -AndroidSdk $AndroidSdk
$apksigner = Join-Path $sdk 'build-tools\36.0.0\apksigner.bat'
$aapt = Join-Path $sdk 'build-tools\36.0.0\aapt.exe'
if (-not (Test-Path -LiteralPath $apksigner -PathType Leaf)) {
    throw '[TEPPU_APKSIGNER_MISSING] Android apksigner 36.0.0 was not found.'
}
if (-not (Test-Path -LiteralPath $aapt -PathType Leaf)) {
    throw '[TEPPU_AAPT_MISSING] Android aapt 36.0.0 was not found.'
}

if ($ValidateOnly.IsPresent) {
    Write-Output 'TEPPU_ANDROID_VERIFY_VALIDATION_OK'
    return
}

$checksumText = [IO.File]::ReadAllText($checksumPath)
$checksumMatch = [regex]::Match($checksumText, '(?i)^\s*([0-9a-f]{64})\b')
if (-not $checksumMatch.Success) {
    throw '[TEPPU_ANDROID_CHECKSUM_INVALID] Checksum file has an invalid format.'
}
$actualHash = (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not [string]::Equals($actualHash, $checksumMatch.Groups[1].Value.ToLowerInvariant(), [StringComparison]::Ordinal)) {
    throw '[TEPPU_ANDROID_CHECKSUM_MISMATCH] APK SHA-256 does not match its checksum file.'
}

$signatureOutput = Invoke-TeppuProcessCapture -Executable $apksigner -Arguments @(
    'verify',
    '--verbose',
    '--print-certs',
    $apkPath
) -FailureCode 'TEPPU_ANDROID_SIGNATURE_INVALID'
$signatureText = $signatureOutput -join "`n"
if ($signatureText -notmatch '(?im)^Verified using v[2-9] scheme[^:]*:\s*true\s*$') {
    throw '[TEPPU_ANDROID_SIGNATURE_SCHEME_INVALID] APK does not have a verified v2 or newer signature.'
}
$certificateMatch = [regex]::Match(
    $signatureText,
    '(?im)^Signer #1 certificate SHA-256 digest:\s*([0-9a-f]+)\s*$'
)
if (-not $certificateMatch.Success) {
    throw '[TEPPU_ANDROID_CERTIFICATE_FINGERPRINT_MISSING] APK certificate SHA-256 was not reported.'
}
$certificateFingerprint = $certificateMatch.Groups[1].Value.ToUpperInvariant()

$badgingOutput = Invoke-TeppuProcessCapture -Executable $aapt -Arguments @(
    'dump',
    'badging',
    $apkPath
) -FailureCode 'TEPPU_ANDROID_BADGING_FAILED'
$badgingText = $badgingOutput -join "`n"
$packageMatch = [regex]::Match(
    $badgingText,
    "(?m)^package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'"
)
if (-not $packageMatch.Success) {
    throw '[TEPPU_ANDROID_PACKAGE_BADGING_MISSING] APK package metadata was not found.'
}
$packageName = $packageMatch.Groups[1].Value
$versionCode = $packageMatch.Groups[2].Value
$versionName = $packageMatch.Groups[3].Value
if ($packageName -ne 'io.github.ohe1013.teppu') {
    throw '[TEPPU_ANDROID_PACKAGE_ID_MISMATCH] APK package ID is incorrect.'
}
if ($versionCode -ne '1' -or $versionName -ne '1.0.0') {
    throw '[TEPPU_ANDROID_VERSION_MISMATCH] APK version is incorrect.'
}

$sdkMatch = [regex]::Match($badgingText, "(?m)^sdkVersion:'([^']+)'$")
$targetMatch = [regex]::Match($badgingText, "(?m)^targetSdkVersion:'([^']+)'$")
if (-not $sdkMatch.Success -or $sdkMatch.Groups[1].Value -ne '24') {
    throw '[TEPPU_ANDROID_MIN_SDK_MISMATCH] APK minimum SDK is incorrect.'
}
if (-not $targetMatch.Success -or $targetMatch.Groups[1].Value -ne '36') {
    throw '[TEPPU_ANDROID_TARGET_SDK_MISMATCH] APK target SDK is incorrect.'
}

$expectedLabel = Get-TeppuAndroidLabel
$labelMatches = [regex]::Matches($badgingText, "(?m)^application-label(?:-[^:]*)?:'([^']*)'$")
$labels = @($labelMatches | ForEach-Object { $_.Groups[1].Value })
if ($labels -notcontains $expectedLabel) {
    throw '[TEPPU_ANDROID_LABEL_MISMATCH] APK application label is incorrect.'
}

$reportPath = Assert-TeppuPathWithin -Path (Join-Path $artifactDirectory 'verification.txt') -Root $artifactDirectory -Label 'Android verification report'
$temporaryReport = Assert-TeppuPathWithin -Path (Join-Path $artifactDirectory ('.teppu-verification-{0}-{1}.tmp' -f $PID, [guid]::NewGuid().ToString('N'))) -Root $artifactDirectory -Label 'Temporary Android verification report'
$report = @(
    'Teppu Android release verification'
    "Verified (UTC): $([DateTime]::UtcNow.ToString('o'))"
    "APK: $([IO.Path]::GetFileName($apkPath))"
    "APK SHA-256: $actualHash"
    "Package: $packageName"
    "Label: $expectedLabel"
    "Version code: $versionCode"
    "Version name: $versionName"
    "Minimum SDK: $($sdkMatch.Groups[1].Value)"
    "Target SDK: $($targetMatch.Groups[1].Value)"
    'Signature scheme: verified v2 or newer'
    "Certificate SHA-256: $certificateFingerprint"
) -join [Environment]::NewLine
try {
    [IO.File]::WriteAllText($temporaryReport, $report + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
    Publish-TeppuFileAtomically -Source $temporaryReport -Destination $reportPath
} finally {
    if (Test-Path -LiteralPath $temporaryReport -PathType Leaf) {
        Remove-Item -LiteralPath $temporaryReport -Force
    }
}

Write-Output 'TEPPU_ANDROID_RELEASE_VERIFIED'
Write-Output $report
