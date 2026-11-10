# Draws the app icons (no external assets). Usage: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
# "any" icons fill the square; "maskable" icons keep the art inside the central safe zone
# so Android launchers can crop them to circles or squircles without cutting the character.
Add-Type -AssemblyName System.Drawing
$out = Join-Path (Split-Path -Parent $PSScriptRoot) 'www\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function Color($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
function Brush($hex) { New-Object System.Drawing.SolidBrush (Color $hex) }

function Draw([int]$size, [string]$name, [double]$k) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $sky = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, (Color '#1f78ea'), (Color '#bfe8ff'), 90
  $g.FillRectangle($sky, $rect)
  # lava fills the full bottom edge even when the art is shrunk into the safe zone
  $g.FillRectangle((Brush '#ff7a1f'), 0, [int]($size * (0.5 + 0.34 * $k)), $size, $size)
  $g.FillRectangle((Brush '#ffc93c'), 0, [int]($size * (0.5 + 0.4 * $k)), $size, $size)

  $g.TranslateTransform([single]($size * (1 - $k) / 2), [single]($size * (1 - $k) / 2))
  $g.ScaleTransform([single]$k, [single]$k)
  $u = $size / 100.0
  $g.FillRectangle((Brush '#d9c6a5'), [single](36 * $u), [single](-40 * $u), [single](28 * $u), [single](130 * $u))
  $plat = {
    param($x, $y, $w)
    $g.FillRectangle((Brush '#a06f49'), [single]($x * $u), [single](($y + 3) * $u), [single]($w * $u), [single](6 * $u))
    $g.FillRectangle((Brush '#7ed957'), [single]($x * $u), [single]($y * $u), [single]($w * $u), [single](4 * $u))
  }
  & $plat 56 22 34
  & $plat 10 44 34
  & $plat 28 73 44
  $g.FillEllipse((Brush '#ffc93c'), [single](34 * $u), [single](44 * $u), [single](32 * $u), [single](30 * $u))
  $g.FillEllipse((Brush '#fff0b8'), [single](41 * $u), [single](57 * $u), [single](18 * $u), [single](14 * $u))
  $g.FillEllipse((Brush '#1c2033'), [single](42 * $u), [single](50 * $u), [single](5 * $u), [single](7 * $u))
  $g.FillEllipse((Brush '#1c2033'), [single](53 * $u), [single](50 * $u), [single](5 * $u), [single](7 * $u))
  $g.Dispose()
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Draw 96 'icon-96.png' 1
Draw 180 'icon-180.png' 1
Draw 192 'icon-192.png' 1
Draw 512 'icon-512.png' 1
Draw 192 'maskable-192.png' 0.72
Draw 512 'maskable-512.png' 0.72
Write-Host "Wrote icons to $out"
