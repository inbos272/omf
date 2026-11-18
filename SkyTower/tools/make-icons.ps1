# Builds the Sky Tower app icons from two in-game renders (tools/icon-src.png, tools/icon-src-maskable.png).
# Usage: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
#
# The renders are real frames from the game engine: a low camera to the lower left of the
# character, looking up the tower (see tools/icon-shot.js for how they were taken). This script
# only grades them (a little more colour and contrast, a soft vignette) and resizes.
# "maskable" uses a wider shot so launchers can crop to a circle without cutting the character.
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'www\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function Grade([string]$src) {
  $img = [System.Drawing.Image]::FromFile($src)
  $n = [Math]::Min($img.Width, $img.Height)
  $bmp = New-Object System.Drawing.Bitmap $n, $n
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  # Saturation ×1.18 and contrast ×1.06 around mid grey.
  $s = 1.18; $c = 1.06; $lr = 0.3086; $lg = 0.6094; $lb = 0.0820
  $o = 0.5 * (1 - $c)
  $m = New-Object System.Drawing.Imaging.ColorMatrix
  $m.Matrix00 = [single](((1 - $s) * $lr + $s) * $c); $m.Matrix01 = [single]((1 - $s) * $lr * $c); $m.Matrix02 = [single]((1 - $s) * $lr * $c)
  $m.Matrix10 = [single]((1 - $s) * $lg * $c); $m.Matrix11 = [single](((1 - $s) * $lg + $s) * $c); $m.Matrix12 = [single]((1 - $s) * $lg * $c)
  $m.Matrix20 = [single]((1 - $s) * $lb * $c); $m.Matrix21 = [single]((1 - $s) * $lb * $c); $m.Matrix22 = [single](((1 - $s) * $lb + $s) * $c)
  $m.Matrix33 = 1; $m.Matrix40 = [single]$o; $m.Matrix41 = [single]$o; $m.Matrix42 = [single]$o; $m.Matrix44 = 1
  $ia = New-Object System.Drawing.Imaging.ImageAttributes
  $ia.SetColorMatrix($m)
  $sx = [int](($img.Width - $n) / 2); $sy = [int](($img.Height - $n) / 2)
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $n, $n), $sx, $sy, $n, $n, [System.Drawing.GraphicsUnit]::Pixel, $ia)
  # Soft vignette pulls the eye to the character in the middle.
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddEllipse([single](-0.22 * $n), [single](-0.22 * $n), [single](1.44 * $n), [single](1.44 * $n))
  $vb = New-Object System.Drawing.Drawing2D.PathGradientBrush $p
  $vb.CenterColor = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
  $vb.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(110, 0, 8, 40))
  $vb.FocusScales = New-Object System.Drawing.PointF 0.6, 0.6
  $g.FillRectangle($vb, 0, 0, $n, $n)
  $vb.Dispose(); $p.Dispose(); $g.Dispose(); $img.Dispose()
  return $bmp
}

function Save($bmp, [int]$size, [string]$name) {
  $o = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($o)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($bmp, 0, 0, $size, $size)
  $g.Dispose()
  $o.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $o.Dispose()
}

$any = Grade (Join-Path $PSScriptRoot 'icon-src.png')
Save $any 96 'icon-96.png'
Save $any 180 'icon-180.png'
Save $any 192 'icon-192.png'
Save $any 512 'icon-512.png'
$any.Dispose()
$mask = Grade (Join-Path $PSScriptRoot 'icon-src-maskable.png')
Save $mask 192 'maskable-192.png'
Save $mask 512 'maskable-512.png'
$mask.Dispose()
Write-Host "Wrote icons to $out"
