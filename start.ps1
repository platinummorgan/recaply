# Recaply - Quick Start Script
# Run this to start both backend and mobile app

Write-Host "🚀 Starting Recaply..." -ForegroundColor Green

# Check if PostgreSQL is running
Write-Host "`n📊 Checking PostgreSQL..." -ForegroundColor Cyan
$pgRunning = Get-Process postgres -ErrorAction SilentlyContinue
if (!$pgRunning) {
    Write-Host "⚠️  PostgreSQL not running. Please start it first." -ForegroundColor Yellow
    Write-Host "   Windows: Start PostgreSQL service" -ForegroundColor Gray
    Write-Host "   Mac: brew services start postgresql" -ForegroundColor Gray
    exit 1
}
Write-Host "✅ PostgreSQL is running" -ForegroundColor Green

# Start backend
Write-Host "`n🔧 Starting backend server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; npm run dev" -WindowStyle Normal

# Wait a bit for backend to start
Start-Sleep -Seconds 3

# Start mobile app
Write-Host "`n📱 Starting mobile app..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm start" -WindowStyle Normal

Write-Host "`n✅ Recaply is starting!" -ForegroundColor Green
Write-Host "`nBackend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Mobile: Running in Metro bundler" -ForegroundColor Cyan
Write-Host "`nPress Ctrl+C in each window to stop" -ForegroundColor Yellow
