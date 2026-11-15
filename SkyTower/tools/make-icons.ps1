# Draws the Sky Tower app icons (no external assets). Usage: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
# "any" icons fill the square; "maskable" icons keep the art inside the central safe zone
# so Android launchers can crop them to circles or squircles without cutting the character.
Add-Type -AssemblyName System.Drawing
$out = Join-Path (Split-Path -Parent $PSScriptRoot) 'www\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function C([string]$hex, [int]$a = 255) { [System.Drawing.Color]::FromArgb($a, [System.Drawing.ColorTranslator]::FromHtml($hex)) }
function RF([double]$x, [double]$y, [double]$w, [double]$h) {
  New-Object System.Drawing.RectangleF ([single]($x * $script:u)), ([single]($y * $script:u)), ([single]($w * $script:u)), ([single]($h * $script:u))
}
function PF([double]$x, [double]$y) { New-Object System.Drawing.PointF ([single]($x * $script:u)), ([single]($y * $script:u)) }
function Lin($rf, $c1, $c2, [single]$angle) { New-Object System.Drawing.Drawing2D.LinearGradientBrush $rf, $c1, $c2, $angle }
function Blend($brush, [single[]]$pos, [System.Drawing.Color[]]$cols) {
  $cb = New-Object System.Drawing.Drawing2D.ColorBlend $cols.Length
  $cb.Positions = $pos
  $cb.Colors = $cols
  $brush.InterpolationColors = $cb
}
# Radial "glossy" fill: bright at (cx, cy), fading to the rim colour.
function Radial($g, $rf, $center, $rim, [double]$cx, [double]$cy) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddEllipse($rf)
  $b = New-Object System.Drawing.Drawing2D.PathGradientBrush $p
  $b.CenterColor = $center
  $b.SurroundColors = [System.Drawing.Color[]]@($rim)
  $b.CenterPoint = PF $cx $cy
  $g.FillPath($b, $p)
  $b.Dispose(); $p.Dispose()
}
function Ell($g, $c, [double]$x, [double]$y, [double]$w, [double]$h) {
  $b = New-Object System.Drawing.SolidBrush $c
  $g.FillEllipse($b, (RF $x $y $w $h))
  $b.Dispose()
}

# A thick 3D slab: dark drop shadow, brown side with rounded front, glossy grass top.
function Slab($g, [double]$x, [double]$y, [double]$w) {
  Ell $g (C '#06143d' 70) ($x + 2) ($y + 9) ($w - 2) 5
  $side = New-Object System.Drawing.Drawing2D.GraphicsPath
  $side.FillMode = 'Winding'
  $side.AddRectangle((RF $x ($y + 2.6) $w 6))
  $side.AddEllipse((RF $x ($y + 5.4) $w 6.2))
  $sb = Lin (RF $x ($y + 2) $w 10) (C '#b9824f') (C '#5e3a1f') 90
  $g.FillPath($sb, $side)
  $sb.Dispose(); $side.Dispose()
  $tb = Lin (RF $x $y $w 5.6) (C '#c8ff7a') (C '#49b52f') 90
  $g.FillEllipse($tb, (RF $x $y $w 5.6))
  $tb.Dispose()
  Ell $g (C '#ffffff' 120) ($x + $w * 0.14) ($y + 0.7) ($w * 0.45) 1.6
}

function Coin($g, [double]$cx, [double]$cy, [double]$r) {
  Ell $g (C '#ffb300' 70) ($cx - $r * 1.6) ($cy - $r * 1.6) ($r * 3.2) ($r * 3.2)
  Ell $g (C '#b96d00') ($cx - $r) ($cy - $r + 0.6) ($r * 2) ($r * 2)
  Radial $g (RF ($cx - $r) ($cy - $r) ($r * 2) ($r * 2)) (C '#fff6b8') (C '#f0a20c') ($cx - $r * 0.35) ($cy - $r * 0.4)
  Ell $g (C '#c97c00' 150) ($cx - $r * 0.45) ($cy - $r * 0.55) ($r * 0.9) ($r * 1.1)
  Ell $g (C '#ffe27a') ($cx - $r * 0.3) ($cy - $r * 0.42) ($r * 0.6) ($r * 0.84)
  Ell $g (C '#ffffff' 220) ($cx - $r * 0.62) ($cy - $r * 0.66) ($r * 0.42) ($r * 0.3)
}

function Draw([int]$size, [string]$name, [double]$k) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $script:u = $size / 100.0

  # ---- background: deep sky with a warm glow behind the tower top ----
  $sky = Lin (RF 0 0 100 100) (C '#0a2a8a') (C '#9be6ff') 90
  Blend $sky @(0, 0.45, 1) @((C '#0a2a8a'), (C '#2c86ee'), (C '#a8ecff'))
  $g.FillRectangle($sky, (RF 0 0 100 100)); $sky.Dispose()
  Radial $g (RF -10 -30 120 90) (C '#fff4c9' 190) (C '#ffffff' 0) 50 12
  # distant clouds
  foreach ($c in @(@(4, 58, 30, 9), @(70, 50, 34, 10), @(-6, 30, 22, 7), @(80, 22, 26, 7))) {
    Ell $g (C '#ffffff' 70) $c[0] $c[1] $c[2] $c[3]
    Ell $g (C '#ffffff' 55) ($c[0] + $c[2] * 0.25) ($c[1] - $c[3] * 0.45) ($c[2] * 0.5) ($c[3])
  }

  # ---- art (shrunk into the safe zone for maskable icons) ----
  $g.TranslateTransform([single]($size * (1 - $k) / 2), [single]($size * (1 - $k) / 2))
  $g.ScaleTransform([single]$k, [single]$k)

  # tower: a shaded cylinder that narrows with height (looking up), with stone courses
  $tower = New-Object System.Drawing.Drawing2D.GraphicsPath
  $tower.AddPolygon([System.Drawing.PointF[]]@((PF 44.5 -60), (PF 55.5 -60), (PF 63 110), (PF 37 110)))
  $tb = Lin (RF 37 0 26 10) (C '#6d5038') (C '#6d5038') 0
  Blend $tb @(0, 0.3, 0.42, 0.7, 1) @((C '#5f4530'), (C '#e2c99f'), (C '#fff1d2'), (C '#b08d65'), (C '#4e3826'))
  $g.FillPath($tb, $tower); $tb.Dispose()
  $g.SetClip($tower)
  $pen = New-Object System.Drawing.Pen (C '#3b2a1a' 70), ([single](0.9 * $script:u))
  for ($y = -4; $y -lt 100; $y += 8.5) { $g.DrawLine($pen, (PF 30 $y), (PF 70 $y)) }
  $pen.Dispose()
  $g.ResetClip()
  $tower.Dispose()

  Slab $g 58 20 34
  Slab $g 7 43 36
  Slab $g 25 74 50

  # character shadow on the bottom slab
  Ell $g (C '#0b2a10' 90) 40 75.6 22 3.4
  # whoosh arcs either side of the jumping character
  $streak = New-Object System.Drawing.Pen (C '#ffffff' 170), ([single](1.8 * $script:u))
  $streak.StartCap = 'Round'; $streak.EndCap = 'Round'
  $g.DrawArc($streak, (RF 27 52 12 18), 110, 70)
  $g.DrawArc($streak, (RF 61 52 12 18), 0, 70)
  $streak.Dispose()

  # glossy bean character, mid-jump
  Ell $g (C '#9a5600' 120) 34.4 37.6 33 35
  Radial $g (RF 34 36 32 34) (C '#fff7b0') (C '#f29a00') 44 44
  Ell $g (C '#fff3c4' 200) 41 53 18 14
  Ell $g (C '#ffffff' 210) 38.5 39.5 9 6
  Ell $g (C '#ffffff' 140) 39 46.5 3 3
  Ell $g (C '#1a1d33') 42.5 47 5.4 7.6
  Ell $g (C '#1a1d33') 53.5 47 5.4 7.6
  Ell $g (C '#ffffff') 43.6 48 2.1 2.6
  Ell $g (C '#ffffff') 54.6 48 2.1 2.6
  Ell $g (C '#ff6f8f' 150) 38.5 55 6 3.4
  Ell $g (C '#ff6f8f' 150) 56.5 55 6 3.4
  $smile = New-Object System.Drawing.Pen (C '#1a1d33'), ([single](1.4 * $script:u))
  $smile.StartCap = 'Round'; $smile.EndCap = 'Round'
  $g.DrawArc($smile, (RF 46.5 53 7 5), 20, 140)
  $smile.Dispose()

  Coin $g 80 11 4.6
  Coin $g 18 33 3.8
  Coin $g 86 40 3.2

  $g.ResetTransform()

  # ---- rising lava across the full bottom edge ----
  $ly = 50 + 36 * $k
  $glow = Lin (RF 0 ($ly - 12) 100 13) (C '#ff6a00' 0) (C '#ff6a00' 120) 90
  $g.FillRectangle($glow, (RF 0 ($ly - 12) 100 12.6)); $glow.Dispose()
  $lava = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pts = New-Object System.Collections.Generic.List[System.Drawing.PointF]
  for ($x = 0; $x -le 100; $x += 2) { $pts.Add((PF $x ($ly + 1.6 * [Math]::Sin($x / 7.0)))) }
  $pts.Add((PF 100 101)); $pts.Add((PF 0 101))
  $lava.AddPolygon($pts.ToArray())
  $lb = Lin (RF 0 ($ly - 2) 100 (102 - $ly)) (C '#ffd23f') (C '#e83a00') 90
  Blend $lb @(0, 0.25, 1) @((C '#fff07a'), (C '#ff9a1f'), (C '#d42c00'))
  $g.FillPath($lb, $lava); $lb.Dispose(); $lava.Dispose()
  foreach ($bb in @(@(14, 3, 3.2), @(47, 6, 2.4), @(78, 2.5, 3.6), @(30, 9, 1.8), @(63, 10, 2))) {
    Ell $g (C '#fff3a0' 200) ($bb[0] - $bb[2] / 2) ($ly + $bb[1]) $bb[2] ($bb[2] * 0.8)
  }

  # ---- soft vignette for depth ----
  $vp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $vp.AddEllipse((RF -22 -22 144 144))
  $vb = New-Object System.Drawing.Drawing2D.PathGradientBrush $vp
  $vb.CenterColor = C '#000000' 0
  $vb.SurroundColors = [System.Drawing.Color[]]@((C '#000a30' 120))
  $vb.FocusScales = New-Object System.Drawing.PointF 0.55, 0.55
  $g.FillRectangle($vb, (RF 0 0 100 100))
  $vb.Dispose(); $vp.Dispose()

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
