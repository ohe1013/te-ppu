Set-StrictMode -Version Latest

function Resolve-TeppuUserProfileRoot {
    [CmdletBinding()]
    param(
        [string]$UserProfileRoot,
        [switch]$AllowOverride
    )

    $actualRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
    if ([string]::IsNullOrWhiteSpace($actualRoot)) {
        throw '[TEPPU_USER_PROFILE_MISSING] Windows user profile could not be resolved.'
    }
    $actualRoot = [IO.Path]::GetFullPath($actualRoot)
    $candidate = if ([string]::IsNullOrWhiteSpace($UserProfileRoot)) {
        $actualRoot
    } else {
        [IO.Path]::GetFullPath($UserProfileRoot)
    }
    if (
        -not $AllowOverride.IsPresent -and
        -not [string]::Equals($candidate, $actualRoot, [StringComparison]::OrdinalIgnoreCase)
    ) {
        throw '[TEPPU_SIGNING_ROOT_REJECTED] Production signing must use the current Windows user profile.'
    }
    return $candidate
}

function Get-TeppuSigningPaths {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$UserProfileRoot)

    $directory = Join-Path (Join-Path $UserProfileRoot '.teppu') 'android-signing'
    return [pscustomobject]@{
        Directory = [IO.Path]::GetFullPath($directory)
        Keystore = [IO.Path]::GetFullPath((Join-Path $directory 'teppu-upload.jks'))
        Credential = [IO.Path]::GetFullPath((Join-Path $directory 'teppu-signing.credential.xml'))
        Metadata = [IO.Path]::GetFullPath((Join-Path $directory 'README.txt'))
    }
}

function Assert-TeppuPathWithin {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $resolvedPath = [IO.Path]::GetFullPath($Path)
    $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]'\/')
    $prefix = $resolvedRoot + [IO.Path]::DirectorySeparatorChar
    if (
        -not [string]::Equals($resolvedPath, $resolvedRoot, [StringComparison]::OrdinalIgnoreCase) -and
        -not $resolvedPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
    ) {
        throw "[TEPPU_PATH_ESCAPE] $Label escaped its approved root."
    }
    return $resolvedPath
}

function Publish-TeppuFileAtomically {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $resolvedSource = [IO.Path]::GetFullPath($Source)
    $resolvedDestination = [IO.Path]::GetFullPath($Destination)
    if (-not (Test-Path -LiteralPath $resolvedSource -PathType Leaf)) {
        throw '[TEPPU_ATOMIC_SOURCE_MISSING] Temporary file was not found.'
    }
    if (-not [string]::Equals(
        [IO.Path]::GetDirectoryName($resolvedSource),
        [IO.Path]::GetDirectoryName($resolvedDestination),
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw '[TEPPU_ATOMIC_DIRECTORY_MISMATCH] Atomic publication requires one directory and volume.'
    }
    if (Test-Path -LiteralPath $resolvedDestination -PathType Leaf) {
        [IO.File]::Replace($resolvedSource, $resolvedDestination, $null)
    } else {
        [IO.File]::Move($resolvedSource, $resolvedDestination)
    }
}

function Get-TeppuSigningState {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)]$Paths)

    $present = @(
        Test-Path -LiteralPath $Paths.Keystore -PathType Leaf
        Test-Path -LiteralPath $Paths.Credential -PathType Leaf
        Test-Path -LiteralPath $Paths.Metadata -PathType Leaf
    )
    $count = @($present | Where-Object { $_ }).Count
    if ($count -eq 0) { return 'Missing' }
    if ($count -eq 3) { return 'Complete' }
    return 'Partial'
}

function Resolve-TeppuProjectRoot {
    [CmdletBinding()]
    param(
        [string]$ProjectRoot,
        [Parameter(Mandatory = $true)][string]$ScriptRoot
    )

    $candidate = if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
        Join-Path $ScriptRoot '..\..'
    } else {
        $ProjectRoot
    }
    $resolved = [IO.Path]::GetFullPath($candidate)
    if (
        -not (Test-Path -LiteralPath (Join-Path $resolved 'package.json') -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $resolved 'capacitor.config.json') -PathType Leaf)
    ) {
        throw '[TEPPU_PROJECT_ROOT_INVALID] Teppu project files were not found.'
    }
    return $resolved
}

function Invoke-TeppuProcessCapture {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$FailureCode
    )

    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
        throw "[$FailureCode] Executable was not found: $Executable"
    }
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $Executable @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    $text = @($output | ForEach-Object { $_.ToString() })
    if ($exitCode -ne 0) {
        $detail = $text -join [Environment]::NewLine
        throw "[$FailureCode] Native command failed with exit code $exitCode.$([Environment]::NewLine)$detail"
    }
    return ,$text
}

function Resolve-TeppuJavaHome {
    [CmdletBinding()]
    param([string]$JavaHome)

    $candidate = if ([string]::IsNullOrWhiteSpace($JavaHome)) {
        $env:JAVA_HOME
    } else {
        $JavaHome
    }
    if ([string]::IsNullOrWhiteSpace($candidate)) {
        throw '[TEPPU_JAVA_HOME_MISSING] JAVA_HOME is not configured.'
    }
    $resolved = [IO.Path]::GetFullPath($candidate)
    $java = Join-Path $resolved 'bin\java.exe'
    $keytool = Join-Path $resolved 'bin\keytool.exe'
    if (
        -not (Test-Path -LiteralPath $java -PathType Leaf) -or
        -not (Test-Path -LiteralPath $keytool -PathType Leaf)
    ) {
        throw '[TEPPU_JAVA_HOME_INVALID] Java and keytool were not found under JAVA_HOME.'
    }
    $version = (Invoke-TeppuProcessCapture -Executable $java -Arguments @('-version') -FailureCode 'TEPPU_JAVA_VERSION_FAILED') -join "`n"
    if ($version -notmatch '(?:openjdk|java) version "21\.') {
        throw '[TEPPU_JAVA_VERSION_UNSUPPORTED] JDK 21 is required.'
    }
    return [pscustomobject]@{
        Home = $resolved
        Java = $java
        Keytool = $keytool
    }
}

function Import-TeppuSigningCredential {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$CredentialPath,
        [Parameter(Mandatory = $true)][string]$ExpectedAlias
    )

    try {
        $credential = Import-Clixml -LiteralPath $CredentialPath
    } catch {
        throw '[TEPPU_SIGNING_CREDENTIAL_UNREADABLE] DPAPI credential could not be decrypted for this Windows user.'
    }
    if ($credential -isnot [Management.Automation.PSCredential]) {
        throw '[TEPPU_SIGNING_CREDENTIAL_INVALID] Signing credential has an invalid shape.'
    }
    if (-not [string]::Equals($credential.UserName, $ExpectedAlias, [StringComparison]::Ordinal)) {
        throw '[TEPPU_SIGNING_ALIAS_MISMATCH] Signing credential alias does not match teppu-upload.'
    }
    return $credential
}

function Get-TeppuCertificateInfo {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Paths,
        [Parameter(Mandatory = $true)][Management.Automation.PSCredential]$Credential,
        [Parameter(Mandatory = $true)][string]$Keytool,
        [Parameter(Mandatory = $true)][string]$Alias
    )

    $temporaryCertificate = Join-Path $Paths.Directory ('.teppu-cert-{0}-{1}.cer' -f $PID, [guid]::NewGuid().ToString('N'))
    $temporaryCertificate = Assert-TeppuPathWithin -Path $temporaryCertificate -Root $Paths.Directory -Label 'Temporary certificate'
    $previousPassword = [Environment]::GetEnvironmentVariable('TEPPU_KEYTOOL_STORE_PASSWORD', 'Process')
    $password = $Credential.GetNetworkCredential().Password
    try {
        [Environment]::SetEnvironmentVariable('TEPPU_KEYTOOL_STORE_PASSWORD', $password, 'Process')
        $null = Invoke-TeppuProcessCapture -Executable $Keytool -Arguments @(
            '-exportcert',
            '-alias', $Alias,
            '-keystore', $Paths.Keystore,
            '-storetype', 'JKS',
            '-storepass:env', 'TEPPU_KEYTOOL_STORE_PASSWORD',
            '-file', $temporaryCertificate
        ) -FailureCode 'TEPPU_SIGNING_KEY_INVALID'
        $certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($temporaryCertificate)
        try {
            $sha256 = [Security.Cryptography.SHA256]::Create()
            try {
                $digest = $sha256.ComputeHash($certificate.RawData)
            } finally {
                $sha256.Dispose()
            }
            $fingerprint = ($digest | ForEach-Object { $_.ToString('X2') }) -join ':'
            return [pscustomobject]@{
                FingerprintSha256 = $fingerprint
                NotBeforeUtc = $certificate.NotBefore.ToUniversalTime().ToString('o')
                NotAfterUtc = $certificate.NotAfter.ToUniversalTime().ToString('o')
                Subject = $certificate.Subject
            }
        } finally {
            $certificate.Dispose()
        }
    } finally {
        $password = $null
        [Environment]::SetEnvironmentVariable('TEPPU_KEYTOOL_STORE_PASSWORD', $previousPassword, 'Process')
        if (Test-Path -LiteralPath $temporaryCertificate -PathType Leaf) {
            Remove-Item -LiteralPath $temporaryCertificate -Force
        }
    }
}

function Resolve-TeppuAndroidSdk {
    [CmdletBinding()]
    param([string]$AndroidSdk)

    $candidate = if ([string]::IsNullOrWhiteSpace($AndroidSdk)) {
        if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
            throw '[TEPPU_ANDROID_SDK_ROOT_MISSING] LOCALAPPDATA is unavailable.'
        }
        Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    } else {
        $AndroidSdk
    }
    return [IO.Path]::GetFullPath($candidate)
}

function Resolve-TeppuNodeToolchain {
    [CmdletBinding()]
    param([string]$NodeRoot)

    $candidate = if ([string]::IsNullOrWhiteSpace($NodeRoot)) {
        if ([string]::IsNullOrWhiteSpace($env:APPDATA)) {
            throw '[TEPPU_NODE_ROOT_MISSING] APPDATA is unavailable.'
        }
        Join-Path $env:APPDATA 'nvm\v24.15.0'
    } else {
        $NodeRoot
    }
    $resolved = [IO.Path]::GetFullPath($candidate)
    $node = Join-Path $resolved 'node.exe'
    $npm = Join-Path $resolved 'npm.cmd'
    if (
        -not (Test-Path -LiteralPath $node -PathType Leaf) -or
        -not (Test-Path -LiteralPath $npm -PathType Leaf)
    ) {
        throw '[TEPPU_NODE_TOOLCHAIN_MISSING] Node 24.15.0 toolchain was not found.'
    }
    $version = ((Invoke-TeppuProcessCapture -Executable $node -Arguments @('--version') -FailureCode 'TEPPU_NODE_VERSION_FAILED') -join '').Trim()
    if ($version -ne 'v24.15.0') {
        throw "[TEPPU_NODE_VERSION_UNSUPPORTED] Expected v24.15.0, received $version."
    }
    return [pscustomobject]@{
        Root = $resolved
        Node = $node
        Npm = $npm
    }
}
