<#
.SYNOPSIS
  Nexus Ultra Promax — Safe Local Development Stack Launcher
.DESCRIPTION
  Starts required services in order, polls for readiness, and avoids port collisions.
  Never destroys persistent database or volume data.
#>

param(
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = (Get-Item $PSScriptRoot).Parent.FullName
$PidFile = "$WorkspaceRoot\.nexus_local_pids.json"

function Write-Step($msg) {
    Write-Host "[Nexus Launcher] $msg" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  [!]  $msg" -ForegroundColor Yellow
}

function Write-Failure($msg) {
    Write-Host "  [ERR] $msg" -ForegroundColor Red
}

Write-Step "Inspecting Nexus Local Infrastructure..."

# 1. Check Docker Dependencies
$dockerPs = docker ps --format "{{.Names}}" 2>$null
$containers = @("nexus-timescale", "nexus-redis-1", "nexus-livekit-1")
$dockerAllReady = $true

foreach ($c in $containers) {
    if ($dockerPs -match $c) {
        Write-Success "Docker container '$c' is healthy and running."
    } else {
        $dockerAllReady = $false
        if ($CheckOnly) {
            Write-Failure "Docker container '$c' is NOT running."
        } else {
            Write-Warn "Container '$c' is stopped. Starting via docker compose..."
            Set-Location $WorkspaceRoot
            docker compose up -d nexus-timescale redis livekit
            Start-Sleep -Seconds 3
            break
        }
    }
}

# 2. Check Port Readiness Helper
function Test-HttpEndpoint($url, $expectedStatus = 200) {
    try {
        $res = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        return ($res.StatusCode -eq $expectedStatus)
    } catch {
        return $false
    }
}

# Polling readiness loop
function Wait-ForEndpoint($url, $serviceName, $timeoutSec = 15) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
        if (Test-HttpEndpoint $url) {
            $sw.Stop()
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    $sw.Stop()
    return $false
}

$trackedPids = @{}
if (Test-Path $PidFile) {
    try {
        $existing = Get-Content $PidFile -Raw | ConvertFrom-Json
        foreach ($prop in $existing.PSObject.Properties) {
            $trackedPids[$prop.Name] = $prop.Value
        }
    } catch {
        # Ignore malformed pid cache
    }
}

$overallSuccess = $true

# 3. Check / Start Signaling Server (Port 4000)
$signalingReady = Test-HttpEndpoint "http://localhost:4000/api/health"
if ($signalingReady) {
    Write-Success "Signaling Server is online at http://localhost:4000"
} elseif ($CheckOnly) {
    Write-Failure "Signaling Server is NOT online at http://localhost:4000"
    $overallSuccess = $false
} else {
    Write-Step "Launching Signaling Server on port 4000..."
    $sigProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory "$WorkspaceRoot\signaling-server" -PassThru -WindowStyle Hidden
    $trackedPids["signaling"] = $sigProc.Id
    if (Wait-ForEndpoint "http://localhost:4000/api/health" "Signaling Server" 15) {
        Write-Success "Signaling Server initialized and verified ready (PID: $($sigProc.Id))"
    } else {
        Write-Failure "Signaling Server failed to respond at http://localhost:4000 within 15s"
        $overallSuccess = $false
    }
}

# 4. Check / Start Analysis API (Port 8000)
$analysisReady = Test-HttpEndpoint "http://localhost:8000/api/health"
if ($analysisReady) {
    Write-Success "Analysis API is online at http://localhost:8000"
} elseif ($CheckOnly) {
    Write-Failure "Analysis API is NOT online at http://localhost:8000"
    $overallSuccess = $false
} else {
    Write-Step "Launching Analysis API on port 8000..."
    $uviExe = "$WorkspaceRoot\analysis-api\venv\Scripts\uvicorn.exe"
    $anaProc = Start-Process -FilePath $uviExe -ArgumentList "app.main:app --port 8000 --host 0.0.0.0" -WorkingDirectory "$WorkspaceRoot\analysis-api" -PassThru -WindowStyle Hidden
    $trackedPids["analysis"] = $anaProc.Id
    if (Wait-ForEndpoint "http://localhost:8000/api/health" "Analysis API" 15) {
        Write-Success "Analysis API initialized and verified ready (PID: $($anaProc.Id))"
    } else {
        Write-Failure "Analysis API failed to respond at http://localhost:8000 within 15s"
        $overallSuccess = $false
    }
}

# 5. Check / Start Frontend (Port 3000)
$frontendReady = Test-HttpEndpoint "http://localhost:3000"
if ($frontendReady) {
    Write-Success "Frontend is online at http://localhost:3000"
} elseif ($CheckOnly) {
    Write-Failure "Frontend is NOT online at http://localhost:3000"
    $overallSuccess = $false
} else {
    Write-Step "Launching Frontend on port 3000..."
    $frontProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory "$WorkspaceRoot\frontend" -PassThru -WindowStyle Hidden
    $trackedPids["frontend"] = $frontProc.Id
    if (Wait-ForEndpoint "http://localhost:3000" "Frontend" 15) {
        Write-Success "Frontend initialized and verified ready (PID: $($frontProc.Id))"
    } else {
        Write-Failure "Frontend failed to respond at http://localhost:3000 within 15s"
        $overallSuccess = $false
    }
}

# Save updated PIDs
if (-not $CheckOnly) {
    try {
        $trackedPids | ConvertTo-Json | Set-Content $PidFile -Encoding UTF8
    } catch {
        # Non-fatal PID save
    }
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "NEXUS LOCAL ENVIRONMENT STATUS SUMMARY" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host "Frontend:           http://localhost:3000"
Write-Host "Signaling API:      http://localhost:4000/api"
Write-Host "Analysis API:       http://localhost:8000"
Write-Host "LiveKit WebRTC:     ws://localhost:7880"
Write-Host "Postgres/Timescale: localhost:5432 (DB: nexus)"
Write-Host "Redis:              localhost:6379"
Write-Host "======================================================" -ForegroundColor Green

if ($overallSuccess -and $dockerAllReady) {
    exit 0
} else {
    exit 1
}
