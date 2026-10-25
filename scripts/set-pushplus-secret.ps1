param(
    [Parameter(Mandatory = $true)][string]$Repository,
    [switch]$SendTest
)
$ErrorActionPreference = 'Stop'
if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
    throw 'Repository must be owner/name.'
}
Write-Host 'Paste your PushPlus Token below. Input is hidden and is not saved to a file.'
$pushplusInput = Read-Host 'PushPlus Token' -AsSecureString
if ($pushplusInput.Length -eq 0) { throw 'Empty Token; nothing changed.' }
$pushplusPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pushplusInput)
try {
    $secretProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
    $secretProcessInfo.FileName = (Get-Command gh.exe).Source
    $secretProcessInfo.Arguments = "secret set PUSHPLUS_TOKEN --repo $Repository"
    $secretProcessInfo.UseShellExecute = $false
    $secretProcessInfo.CreateNoWindow = $true
    $secretProcessInfo.RedirectStandardInput = $true
    $secretProcess = [System.Diagnostics.Process]::Start($secretProcessInfo)
    $secretProcess.StandardInput.WriteLine([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pushplusPointer))
    $secretProcess.StandardInput.Close()
    $secretProcess.WaitForExit()
    if ($secretProcess.ExitCode -ne 0) { throw 'GitHub Secret upload failed.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pushplusPointer)
    $pushplusInput.Dispose()
}
Write-Host 'PushPlus Token is stored in the GitHub repository Secret.'
if ($SendTest) {
    & gh.exe workflow run pushplus-test.yml --repo $Repository
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the connection-test workflow.' }
    Write-Host 'One labeled WeChat connection test has been queued. Check WeChat.'
}
Write-Host 'The recurring monitor is still disabled until WeChat delivery is checked.'
