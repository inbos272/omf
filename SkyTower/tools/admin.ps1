# Sky Tower server admin. The key is read from $env:SKY_ADMIN_KEY, or from the file
# sky-tower-admin-key.txt two folders up (next to the SkyTower folder, never inside it).
#
#   powershell -ExecutionPolicy Bypass -File tools\admin.ps1 player -Name 하늘왕
#   powershell -ExecutionPolicy Bypass -File tools\admin.ps1 set    -Name 하늘왕 -Rp 1200 -Best 800
#   powershell -ExecutionPolicy Bypass -File tools\admin.ps1 remove -Name 치터 [-Reset]
#   powershell -ExecutionPolicy Bypass -File tools\admin.ps1 rename -Name 옛이름 -NewName 새이름
#   powershell -ExecutionPolicy Bypass -File tools\admin.ps1 reset  -What floor|rp|hof
#   powershell -ExecutionPolicy Bypass -File tools\admin.ps1 export        (backup → server-backup-<date>.json)
param(
  [Parameter(Position = 0, Mandatory = $true)][ValidateSet('player', 'set', 'remove', 'rename', 'reset', 'export')][string]$Action,
  [string]$Name, [string]$PlayerId, [string]$NewName, [string]$What,
  [int]$Rp = -1, [int]$Peak = -1, [int]$Best = -1, [int]$CasualWins = -1, [switch]$Reset
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cfg = Get-Content (Join-Path $root 'www\js\config.js') -Raw -Encoding UTF8
if ($cfg -notmatch "SKY_SERVER_URL\s*=\s*'([^']+)'") { throw 'Server URL not found in www\js\config.js' }
$base = $Matches[1].TrimEnd('/')
$key = $env:SKY_ADMIN_KEY
if (-not $key) {
  $kf = Join-Path (Split-Path -Parent $root) 'sky-tower-admin-key.txt'
  if (-not (Test-Path $kf)) { throw "No admin key: set `$env:SKY_ADMIN_KEY or create $kf" }
  $key = (Get-Content $kf -Raw).Trim()
}
$headers = @{ Authorization = "Bearer $key" }
function Post($path, $obj) {
  $json = $obj | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "$base$path" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json))
}
$who = @{}
if ($Name) { $who.name = $Name }
if ($PlayerId) { $who.pid = $PlayerId }
switch ($Action) {
  'player' { $r = Post '/admin/player' $who }
  'set' {
    $set = @{}
    if ($Rp -ge 0) { $set.rp = $Rp }
    if ($Peak -ge 0) { $set.peak = $Peak }
    if ($Best -ge 0) { $set.best = $Best }
    if ($CasualWins -ge 0) { $set.casualWins = $CasualWins }
    $r = Post '/admin/player' ($who + @{ set = $set })
  }
  'remove' { $r = Post '/admin/remove' ($who + @{ reset = [bool]$Reset }) }
  'rename' { $r = Post '/admin/rename' ($who + @{ newName = $NewName }) }
  'reset' { $r = Post '/admin/reset' @{ what = $What } }
  'export' {
    $r = Invoke-RestMethod -Uri "$base/admin/export" -Headers $headers
    $file = Join-Path (Split-Path -Parent $root) ("server-backup-" + (Get-Date -Format 'yyyyMMdd-HHmm') + '.json')
    $r | ConvertTo-Json -Depth 20 | Out-File $file -Encoding utf8
    "Saved $file"
    return
  }
}
$r | ConvertTo-Json -Depth 10
