# OpenJarvis startup script
# Run from C:\Users\Rober\OpenJarvis:
#   .\start-jarvis.ps1

# Required for Rust/PyO3 extension compatibility
$env:PYO3_USE_ABI3_FORWARD_COMPATIBILITY = "1"

# Anthropic API key — get yours from https://console.anthropic.com
$env:ANTHROPIC_API_KEY = "YOUR_ANTHROPIC_API_KEY_HERE"

# Tavily is stored in credentials.toml and auto-loaded at startup
# No action needed here

# Fish Audio TTS — get your key from https://fish.audio
$env:FISH_AUDIO_API_KEY = "YOUR_FISH_AUDIO_API_KEY_HERE"

# Fish Audio voice — find a voice on https://fish.audio/discovery
# Copy the ID from the URL: fish.audio/m/<THIS_PART>
# Leave blank to use the default voice
$env:FISH_AUDIO_REFERENCE_ID = "YOUR_FISH_AUDIO_REFERENCE_ID_HERE"

Write-Host "Starting OpenJarvis..." -ForegroundColor Cyan
Write-Host "  Engine : Claude (Anthropic API)" -ForegroundColor Green
Write-Host "  Search : Tavily" -ForegroundColor Green
Write-Host "  Voice  : Fish Audio TTS" -ForegroundColor Green
Write-Host "  UI     : http://localhost:5173" -ForegroundColor Green
Write-Host ""

Set-Location "C:\Users\Rober\OpenJarvis"

# Kill anything holding port 5173 or 8000 so we always get the same address
foreach ($port in @(5173, 8000)) {
    $pids = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique
    foreach ($p in $pids) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Milliseconds 500

# Start frontend in a new visible window
Start-Process powershell -ArgumentList "-NoExit -NoProfile -Command `"Set-Location 'C:\Users\Rober\OpenJarvis\frontend'; npm run dev`""

Write-Host "Frontend starting at http://localhost:5173..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

# Start backend (blocking — keep this terminal open)
uv run jarvis serve --port 8000
