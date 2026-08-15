[CmdletBinding()]
param(
    [switch]$ValidateOnly,
    [string]$UserProfileRoot,
    [string]$JavaHome
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AndroidRelease.Common.ps1')

$Alias = 'teppu-upload'
$ApplicationId = 'io.github.ohe1013.teppu'
$DistinguishedName = 'CN=Teppu Android Upload, OU=Teppu, O=Teppu, L=Seoul, C=KR'
$ValidityDays = 9125

$profileRoot = Resolve-TeppuUserProfileRoot -UserProfileRoot $UserProfileRoot -AllowOverride:$ValidateOnly.IsPresent
$paths = Get-TeppuSigningPaths -UserProfileRoot $profileRoot
$null = Assert-TeppuPathWithin -Path $paths.Directory -Root $profileRoot -Label 'Signing directory'
$state = Get-TeppuSigningState -Paths $paths

if ($state -eq 'Partial') {
    throw '[TEPPU_SIGNING_SETUP_PARTIAL] Signing files are incomplete. Do not replace or delete an existing key without recovery review.'
}
if ($state -eq 'Missing' -and $ValidateOnly.IsPresent) {
    throw '[TEPPU_SIGNING_SETUP_MISSING] Permanent Android signing has not been initialized.'
}

$java = Resolve-TeppuJavaHome -JavaHome $JavaHome

if ($state -eq 'Complete') {
    $credential = Import-TeppuSigningCredential -CredentialPath $paths.Credential -ExpectedAlias $Alias
    $certificate = Get-TeppuCertificateInfo -Paths $paths -Credential $credential -Keytool $java.Keytool -Alias $Alias
    Write-Output 'TEPPU_SIGNING_OK'
    Write-Output "Alias: $Alias"
    Write-Output "Application ID: $ApplicationId"
    Write-Output "Certificate SHA-256: $($certificate.FingerprintSha256)"
    Write-Output "Expires (UTC): $($certificate.NotAfterUtc)"
    return
}

New-Item -ItemType Directory -Path $paths.Directory -Force | Out-Null
$temporaryId = [guid]::NewGuid().ToString('N')
$temporaryKeystore = Assert-TeppuPathWithin -Path (Join-Path $paths.Directory ".teppu-upload-$temporaryId.jks") -Root $paths.Directory -Label 'Temporary keystore'
$temporaryCredential = Assert-TeppuPathWithin -Path (Join-Path $paths.Directory ".teppu-signing-$temporaryId.xml") -Root $paths.Directory -Label 'Temporary credential'
$temporaryMetadata = Assert-TeppuPathWithin -Path (Join-Path $paths.Directory ".teppu-readme-$temporaryId.txt") -Root $paths.Directory -Label 'Temporary metadata'

$randomBytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($randomBytes)
} finally {
    $rng.Dispose()
}
$password = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
[Array]::Clear($randomBytes, 0, $randomBytes.Length)
$previousStorePassword = [Environment]::GetEnvironmentVariable('TEPPU_KEYTOOL_STORE_PASSWORD', 'Process')
$previousKeyPassword = [Environment]::GetEnvironmentVariable('TEPPU_KEYTOOL_KEY_PASSWORD', 'Process')
$securePassword = $null
$credential = $null

try {
    [Environment]::SetEnvironmentVariable('TEPPU_KEYTOOL_STORE_PASSWORD', $password, 'Process')
    [Environment]::SetEnvironmentVariable('TEPPU_KEYTOOL_KEY_PASSWORD', $password, 'Process')
    $null = Invoke-TeppuProcessCapture -Executable $java.Keytool -Arguments @(
        '-genkeypair',
        '-alias', $Alias,
        '-keyalg', 'RSA',
        '-keysize', '4096',
        '-sigalg', 'SHA256withRSA',
        '-validity', $ValidityDays.ToString(),
        '-dname', $DistinguishedName,
        '-keystore', $temporaryKeystore,
        '-storetype', 'JKS',
        '-storepass:env', 'TEPPU_KEYTOOL_STORE_PASSWORD',
        '-keypass:env', 'TEPPU_KEYTOOL_KEY_PASSWORD',
        '-noprompt'
    ) -FailureCode 'TEPPU_SIGNING_KEY_GENERATION_FAILED'

    $securePassword = ConvertTo-SecureString $password -AsPlainText -Force
    $credential = New-Object Management.Automation.PSCredential($Alias, $securePassword)
    $credential | Export-Clixml -LiteralPath $temporaryCredential
    $temporaryPaths = [pscustomobject]@{
        Directory = $paths.Directory
        Keystore = $temporaryKeystore
    }
    $certificate = Get-TeppuCertificateInfo -Paths $temporaryPaths -Credential $credential -Keytool $java.Keytool -Alias $Alias

    $metadata = @(
        'Teppu Android upload signing key'
        "Application ID: $ApplicationId"
        "Alias: $Alias"
        'Store type: JKS'
        'Key algorithm: RSA 4096'
        'Signature algorithm: SHA256withRSA'
        "Certificate SHA-256: $($certificate.FingerprintSha256)"
        "Created (UTC): $($certificate.NotBeforeUtc)"
        "Expires (UTC): $($certificate.NotAfterUtc)"
        ''
        'BACKUP REQUIRED BEFORE STORE PUBLICATION'
        'Back up teppu-upload.jks and teppu-signing.credential.xml together.'
        'The credential XML is protected by Windows DPAPI for this user and machine context.'
        'Keep backup copies outside Git. Never paste either file or its contents into chat.'
        'Losing this key can prevent future updates to the published Android application.'
    ) -join [Environment]::NewLine
    [IO.File]::WriteAllText($temporaryMetadata, $metadata + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))

    [IO.File]::Move($temporaryCredential, $paths.Credential)
    [IO.File]::Move($temporaryKeystore, $paths.Keystore)
    [IO.File]::Move($temporaryMetadata, $paths.Metadata)
} finally {
    $password = $null
    $securePassword = $null
    $credential = $null
    [Environment]::SetEnvironmentVariable('TEPPU_KEYTOOL_STORE_PASSWORD', $previousStorePassword, 'Process')
    [Environment]::SetEnvironmentVariable('TEPPU_KEYTOOL_KEY_PASSWORD', $previousKeyPassword, 'Process')
    foreach ($temporaryPath in @($temporaryKeystore, $temporaryCredential, $temporaryMetadata)) {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
}

$finalCredential = Import-TeppuSigningCredential -CredentialPath $paths.Credential -ExpectedAlias $Alias
$finalCertificate = Get-TeppuCertificateInfo -Paths $paths -Credential $finalCredential -Keytool $java.Keytool -Alias $Alias
Write-Output 'TEPPU_SIGNING_CREATED'
Write-Output "Directory: $($paths.Directory)"
Write-Output "Alias: $Alias"
Write-Output "Application ID: $ApplicationId"
Write-Output "Certificate SHA-256: $($finalCertificate.FingerprintSha256)"
Write-Output "Expires (UTC): $($finalCertificate.NotAfterUtc)"
Write-Output 'Back up the JKS, credential XML, and README before publication.'
