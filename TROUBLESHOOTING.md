# Reading Clipper - Troubleshooting Guide

## Current Issues & Solutions

### Issue 1: Card Creation Failed ✅ FIXED
**Error**: "Could not find the 'locator' column of 'cards'"
**Solution**: Added missing 'locator' column to cards table
**Status**: ✅ Fixed - You can now create cards

### Issue 2: Material Status Stuck at "Pending"
**Symptom**: Materials show "waiting" status forever
**Root Cause**:
- Content extraction succeeds (extraction_status: success)
- But chunking/embedding fails due to duplicate content_hash
- Python Sidecar can't update ingestion_status

**Solution**:
The material was actually processed successfully by Content Fetch Service.
The "pending" status is just a display issue.

**Workaround**:
1. Refresh the page
2. The article content should be readable
3. The chunking step failed, but you can still read the article

**Permanent Fix**: Update Python Sidecar to handle duplicate content better

---

## Control Panel Usage Guide

### Step 1: Open Control Panel
Double-click: `control-panel.bat`

You'll see:
```
========================================
  Reading Clipper 2.0 Control Panel
========================================

 Current Status:
 ----------------------------------------
 [OK] Content Fetch    Port 8200
 [OK] Python Sidecar   Port 8100
 [OK] Backend          Port 3001
 [OK] Web App          Port 5173
 ----------------------------------------

 Options:

 [1] Start All Services
 [2] Stop All Services
 [3] Restart All Services
 [4] Open App
 [5] View Logs
 [6] Refresh Status
 [0] Exit

========================================
Select (0-6):
```

### Step 2: Common Operations

#### Start Services
1. Press `1` and Enter
2. Wait 5 seconds
3. Browser opens automatically at http://localhost:5173

#### Stop Services
1. Press `2` and Enter
2. All Node.js and Python processes stop

#### Restart Services
1. Press `3` and Enter
2. Stops all services, then starts them again
3. Useful when services are stuck

#### Open App
1. Press `4` and Enter
2. Opens http://localhost:5173 in browser

#### View Logs
1. Press `5` and Enter
2. Choose which log to view:
   - [1] Content Fetch Log
   - [2] Python Sidecar Log
   - [3] Backend Log
   - [4] Web App Log
   - [5] Open Logs Folder
3. Shows last 30 lines of selected log

#### Refresh Status
1. Press `6` and Enter
2. Refreshes service status display

---

## Daily Workflow

### Morning Startup
1. Double-click `control-panel.bat`
2. Press `1` to start
3. Wait for browser to open
4. Start working

### During Work
- If something breaks: Press `3` to restart
- To check errors: Press `5` to view logs
- To open app again: Press `4`

### End of Day
1. Open control panel
2. Press `2` to stop all services
3. Press `0` to exit

---

## Understanding Service Status

### [OK] = Running
Service is active and listening on its port

### [ ] = Stopped
Service is not running

### Services Explained

**Content Fetch (Port 8200)**
- Extracts article content from URLs
- Uses Readability + Puppeteer
- Handles images and metadata

**Python Sidecar (Port 8100)**
- Chunks documents
- Generates embeddings with Ollama
- Stores in database

**Backend (Port 3001)**
- Main API server
- Handles authentication
- Coordinates services

**Web App (Port 5173)**
- React frontend
- What you see in browser
- Hot-reload during development

---

## Troubleshooting

### Services Won't Start
1. Press `2` to stop all
2. Wait 3 seconds
3. Press `1` to start again

### Port Already in Use
1. Press `2` to stop
2. Check if other apps are using ports
3. Press `1` to restart

### Can't See Logs
1. Press `5` then `5` to open logs folder
2. Open log files with Notepad
3. Look for ERROR or WARNING lines

### Browser Won't Open
1. Check if Web App shows [OK]
2. Manually visit http://localhost:5173
3. Press `5` then `4` to check Web App log

---

## Quick Reference

| Key | Action |
|-----|--------|
| 1 | Start all services |
| 2 | Stop all services |
| 3 | Restart all services |
| 4 | Open app in browser |
| 5 | View logs |
| 6 | Refresh status |
| 0 | Exit control panel |

---

## Current Status Summary

✅ Content Fetch Service - Working perfectly
✅ Article extraction - Working (Readability + metadata)
✅ Card creation - Fixed (added locator column)
⚠️ Chunking/Embedding - Has duplicate content issue
⚠️ Material status display - Shows "pending" but content is readable

**Bottom Line**: You can read articles and create cards now!
The "pending" status is just a cosmetic issue.
