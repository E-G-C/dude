#!/usr/bin/env pwsh
# Runs the canonical Clearline validator.

param()

$ErrorActionPreference = 'Stop'

if ($args.Count -ne 0) {
    [Console]::Error.WriteLine('Usage: pwsh style-check.ps1')
    exit 2
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    [Console]::Error.WriteLine('FAIL: Node.js is required to run the Clearline validator.')
    exit 1
}

& node (Join-Path $PSScriptRoot 'validate.mjs')
exit $LASTEXITCODE
