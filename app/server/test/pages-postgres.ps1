$ErrorActionPreference = 'Stop'
$containerName = 'strata-pages-test-' + [Guid]::NewGuid().ToString('N')
$previousDatabaseUrl = $env:DATABASE_URL
$previousPostgresPassword = $env:POSTGRES_PASSWORD
$created = $false
Push-Location (Join-Path $PSScriptRoot '../..')
try {
    docker info --format '{{.OSType}}'
    if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop with its Linux engine before running this script.' }
    $env:POSTGRES_PASSWORD = [Guid]::NewGuid().ToString('N')
    docker run --detach --rm --name $containerName --label strata_pages_test=true --publish '127.0.0.1::5432' --env POSTGRES_DB=strata_pages_test --env POSTGRES_USER=strata_pages_test --env POSTGRES_PASSWORD postgres:18-alpine
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the disposable Postgres test container.' }
    $created = $true
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        docker exec $containerName pg_isready -U strata_pages_test -d strata_pages_test *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'The disposable Postgres test database did not become ready.' }
    $publishedPort = docker port $containerName 5432/tcp
    if ($LASTEXITCODE -ne 0 -or $publishedPort -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Unexpected Postgres port binding.' }
    $env:DATABASE_URL = 'postgresql://strata_pages_test:' + $env:POSTGRES_PASSWORD + '@127.0.0.1:' + $Matches[1] + '/strata_pages_test'
    npm run prisma:migrate:deploy
    if ($LASTEXITCODE -ne 0) { throw 'Test schema deployment failed.' }
    npm run test:integration --workspace server -- test/integration/notes.spec.ts test/integration/note-comments.spec.ts test/integration/note-databases.spec.ts test/integration/invitations.spec.ts test/integration/files.spec.ts
    if ($LASTEXITCODE -ne 0) { throw 'Pages Postgres integration tests failed.' }
} finally {
    $env:DATABASE_URL = $previousDatabaseUrl
    $env:POSTGRES_PASSWORD = $previousPostgresPassword
    if ($created) {
        $testLabel = docker inspect --format '{{.Config.Labels.strata_pages_test}}' $containerName
        if ($LASTEXITCODE -ne 0 -or $testLabel -ne 'true' -or -not $containerName.StartsWith('strata-pages-test-')) { throw 'The test container could not be verified for cleanup.' }
        docker stop $containerName
        if ($LASTEXITCODE -ne 0) { throw 'Could not stop the disposable Postgres test container.' }
    }
    Pop-Location
}
