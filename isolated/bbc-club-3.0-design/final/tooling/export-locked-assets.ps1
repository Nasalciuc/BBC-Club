param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskEntries = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'export-regions.json') | ConvertFrom-Json
$taskManifest = @()
foreach ($taskEntry in $taskEntries) {
 $taskSource = Join-Path $Root $taskEntry.source
 $taskTarget = Join-Path $Root $taskEntry.file
 $taskBitmap = [Drawing.Bitmap]::new($taskSource)
 $taskRect = [Drawing.Rectangle]::new([int]$taskEntry.rect[0],[int]$taskEntry.rect[1],[int]$taskEntry.rect[2],[int]$taskEntry.rect[3])
 if ($taskRect.Right -gt $taskBitmap.Width -or $taskRect.Bottom -gt $taskBitmap.Height) { throw "Out of bounds: $($taskEntry.id)" }
 New-Item -ItemType Directory -Force -Path (Split-Path -Parent $taskTarget) | Out-Null
 $taskCrop = $taskBitmap.Clone($taskRect, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
 $taskCrop.Save($taskTarget, [Drawing.Imaging.ImageFormat]::Png)
 $taskExport = [Drawing.Bitmap]::new($taskTarget)
 foreach ($taskProbe in @(@(0,0),@([int]($taskRect.Width/2),[int]($taskRect.Height/2)),@(($taskRect.Width-1),($taskRect.Height-1)))) {
   if ($taskBitmap.GetPixel($taskRect.X+$taskProbe[0],$taskRect.Y+$taskProbe[1]).ToArgb() -ne $taskExport.GetPixel($taskProbe[0],$taskProbe[1]).ToArgb()) { throw "Pixel copy mismatch: $($taskEntry.id)" }
 }
 $taskManifest += [ordered]@{id=$taskEntry.id;file=$taskEntry.file;source=$taskEntry.source;sourceRectPx=$taskEntry.rect;widthPx=$taskRect.Width;heightPx=$taskRect.Height;kind=$taskEntry.kind;usage=$taskEntry.usage;notes=$taskEntry.notes;method='unscaled-source-pixel-copy';sha256=(Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash.ToLowerInvariant();sourceSha256=(Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.ToLowerInvariant()}
 $taskExport.Dispose()
 $taskCrop.Dispose()
 $taskBitmap.Dispose()
}
$taskJson = $taskManifest | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $Root 'assets/locked/catalog.json'),$taskJson,[Text.UTF8Encoding]::new($false))
Write-Output "Exported $($taskManifest.Count) unscaled source fragments."

