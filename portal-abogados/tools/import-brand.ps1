param([Parameter(Mandatory=$true)][string]$SourceZip)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$brandProject = Split-Path $PSScriptRoot -Parent
$brandPublic = Join-Path $brandProject 'public'
$brandTargets = [ordered]@{
  'entrega/web/logo-principal-firma.svg' = 'brand/logo-principal-firma.svg'
  'entrega/web/logo-principal-horizontal.svg' = 'brand/logo-principal-horizontal.svg'
  'entrega/web/logo-principal-vertical.svg' = 'brand/logo-principal-vertical.svg'
  'entrega/web/logo-principal-horizontal.png' = 'brand/logo-principal-horizontal.png'
  'entrega/web/favicon.svg' = 'favicon.svg'
  'entrega/web/favicon.ico' = 'favicon.ico'
  'entrega/web/favicon-32.png' = 'favicon-32.png'
  'entrega/web/favicon-48.png' = 'favicon-48.png'
  'entrega/web/favicon-180.png' = 'apple-touch-icon.png'
  'entrega/web/favicon-192.png' = 'icon-192.png'
  'entrega/web/favicon-512.png' = 'icon-512.png'
}
$brandArchive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $SourceZip).Path)
try {
  foreach ($brandSource in $brandTargets.Keys) {
    $brandEntry = $brandArchive.GetEntry($brandSource)
    if (!$brandEntry -or $brandEntry.Length -gt 400000) { throw "Missing or oversized official asset: $brandSource" }
    $brandTarget = [System.IO.Path]::GetFullPath((Join-Path $brandPublic $brandTargets[$brandSource]))
    if (!$brandTarget.StartsWith($brandPublic + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Asset outside public directory' }
    if ($brandSource.EndsWith('.svg')) {
      $brandReader = [System.IO.StreamReader]::new($brandEntry.Open())
      try { $brandSvg = $brandReader.ReadToEnd() } finally { $brandReader.Dispose() }
      if ($brandSvg -match '(?i)<(?:script|foreignObject|image|iframe|style)\b|\son\w+\s*=|(?:href|src)\s*=\s*["''][^#]|<!DOCTYPE|<!ENTITY') { throw "Unsafe SVG content: $brandSource" }
    }
    New-Item -ItemType Directory -Path (Split-Path $brandTarget -Parent) -Force | Out-Null
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($brandEntry,$brandTarget,$true)
    Write-Output ('Imported ' + $brandTargets[$brandSource])
  }
} finally { $brandArchive.Dispose() }
