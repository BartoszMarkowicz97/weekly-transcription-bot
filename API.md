# API Documentation

## Overview

The bot now runs both a Discord client and an Express API server. The API server allows external applications to control the bot programmatically.

## Server Configuration

- **Default Port:** 3000
- **Environment Variable:** `API_PORT`

Example:
```bash
API_PORT=3000 npm start
```

## Authentication

All endpoints accept optional `userRoles` in the request body to check permissions against configured allowed roles in `config/default.json`.

```json
{
  "userRoles": ["admin", "moderator"]
}
```

## API Endpoints

### Health Check

**GET** `/api/health`

Returns server status.

**Response:**
```json
{
  "status": "ok"
}
```

---

### Start Meeting

**POST** `/api/meeting/start`

Starts a new recording session.

**Request Body:**
```json
{
  "name": "Weekly Sync",
  "guildId": "123456789",
  "channelId": "987654321",
  "userRoles": ["admin"]
}
```

**Parameters:**
- `name` (required): Name of the meeting
- `guildId` (required): Discord guild ID
- `channelId` (required): Discord voice channel ID to join
- `userRoles` (optional): User's Discord roles for permission checking

**Response (Success):**
```json
{
  "success": true,
  "message": "Recording started for meeting: Weekly Sync",
  "meetingName": "Weekly Sync"
}
```

**Error Responses:**
- `400`: Missing required fields
- `403`: Insufficient permissions
- `409`: Meeting already exists or recording already active
- `500`: Failed to join voice channel

---

### Stop Meeting

**POST** `/api/meeting/stop`

Stops the current recording and starts background processing (transcription, summarization).

**Request Body:**
```json
{
  "userRoles": ["admin"]
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Recording stopped for meeting: Weekly Sync. Processing started in background.",
  "meetingName": "Weekly Sync"
}
```

**Error Responses:**
- `400`: No active recording
- `403`: Insufficient permissions
- `500`: Error during processing

---

### List Meetings

**GET** `/api/meeting/list`

Returns all recorded meetings with their status.

**Request Body:**
```json
{
  "userRoles": ["admin"]
}
```

**Response (Success):**
```json
{
  "success": true,
  "meetings": [
    {
      "name": "Weekly Sync",
      "recorded": true,
      "transcribed": true,
      "summarized": true
    },
    {
      "name": "Team Standup",
      "recorded": true,
      "transcribed": false,
      "summarized": false
    }
  ],
  "count": 2
}
```

**Error Responses:**
- `403`: Insufficient permissions
- `404`: No meetings found

---

### Get Meeting Content

**GET** `/api/meeting/:name/send`

Download or retrieve meeting files.

**Query Parameters:**
- `type` (optional): Type of file to retrieve
  - `recording` (default): Audio file (.mp3 or .ogg)
  - `transcription`: Transcription text file
  - `summary`: Summary markdown file

**Request Body:**
```json
{
  "userRoles": ["admin"]
}
```

**Examples:**

Get recording:
```
GET /api/meeting/Weekly%20Sync/send?type=recording
```

Get transcription:
```
GET /api/meeting/Weekly%20Sync/send?type=transcription
```

Get summary:
```
GET /api/meeting/Weekly%20Sync/send?type=summary
```

**Response:**
- Returns file as download with appropriate filename
- Or JSON with content for text-based files

**Error Responses:**
- `400`: Invalid file type
- `403`: Insufficient permissions
- `404`: Meeting or file not found

---

### Delete Meeting

**DELETE** `/api/meeting/:name`

Delete a meeting or specific files from a meeting.

**Query Parameters:**
- `type` (optional): What to delete
  - `meeting` (default): Delete entire meeting folder
  - `recording`: Delete only audio files

**Request Body:**
```json
{
  "userRoles": ["admin"]
}
```

**Examples:**

Delete entire meeting:
```
DELETE /api/meeting/Weekly%20Sync
```

Delete only recording:
```
DELETE /api/meeting/Weekly%20Sync?type=recording
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Meeting deleted"
}
```

**Error Responses:**
- `403`: Insufficient permissions
- `404`: Meeting not found

---

## Example Usage

### Using cURL

Start a meeting:
```bash
curl -X POST http://localhost:3000/api/meeting/start \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly Sync",
    "guildId": "123456789",
    "channelId": "987654321",
    "userRoles": ["admin"]
  }'
```

List meetings:
```bash
curl -X GET http://localhost:3000/api/meeting/list \
  -H "Content-Type: application/json" \
  -d '{"userRoles": ["admin"]}'
```

Get transcription:
```bash
curl -X GET 'http://localhost:3000/api/meeting/Weekly%20Sync/send?type=transcription' \
  -H "Content-Type: application/json" \
  -d '{"userRoles": ["admin"]}' \
  > transcription.txt
```

Stop recording:
```bash
curl -X POST http://localhost:3000/api/meeting/stop \
  -H "Content-Type: application/json" \
  -d '{"userRoles": ["admin"]}'
```

### Using JavaScript/Node.js

```javascript
const axios = require('axios');

const API_URL = 'http://localhost:3000';

// Start meeting
async function startMeeting(name, guildId, channelId) {
  const response = await axios.post(`${API_URL}/api/meeting/start`, {
    name,
    guildId,
    channelId,
    userRoles: ['admin']
  });
  return response.data;
}

// List meetings
async function listMeetings() {
  const response = await axios.get(`${API_URL}/api/meeting/list`, {
    data: { userRoles: ['admin'] }
  });
  return response.data;
}

// Stop meeting
async function stopMeeting() {
  const response = await axios.post(`${API_URL}/api/meeting/stop`, {
    userRoles: ['admin']
  });
  return response.data;
}

// Get meeting content
async function getMeetingContent(name, type = 'recording') {
  const response = await axios.get(
    `${API_URL}/api/meeting/${encodeURIComponent(name)}/send?type=${type}`,
    { 
      data: { userRoles: ['admin'] },
      responseType: type === 'recording' ? 'stream' : 'json'
    }
  );
  return response.data;
}

// Delete meeting
async function deleteMeeting(name, type = 'meeting') {
  const response = await axios.delete(
    `${API_URL}/api/meeting/${encodeURIComponent(name)}?type=${type}`,
    { data: { userRoles: ['admin'] } }
  );
  return response.data;
}
```

### Using Python

```python
import requests

API_URL = 'http://localhost:3000'

def start_meeting(name, guild_id, channel_id):
    response = requests.post(
        f'{API_URL}/api/meeting/start',
        json={
            'name': name,
            'guildId': guild_id,
            'channelId': channel_id,
            'userRoles': ['admin']
        }
    )
    return response.json()

def list_meetings():
    response = requests.get(
        f'{API_URL}/api/meeting/list',
        json={'userRoles': ['admin']}
    )
    return response.json()

def stop_meeting():
    response = requests.post(
        f'{API_URL}/api/meeting/stop',
        json={'userRoles': ['admin']}
    )
    return response.json()

def get_meeting_content(name, file_type='recording'):
    response = requests.get(
        f'{API_URL}/api/meeting/{name}/send',
        params={'type': file_type},
        json={'userRoles': ['admin']}
    )
    return response.json() if file_type in ['transcription', 'summary'] else response.content

def delete_meeting(name, delete_type='meeting'):
    response = requests.delete(
        f'{API_URL}/api/meeting/{name}',
        params={'type': delete_type},
        json={'userRoles': ['admin']}
    )
    return response.json()
```

## Migration from Slash Commands

The old slash command interface (`/meeting start`, `/meeting stop`, etc.) is still available through Discord. However, you can now:

1. **Remove the Discord commands** by deleting `src/commands/` folder and related handlers from `src/index.js`
2. **Use the API** for all meeting management
3. **Integrate with other systems** - web apps, mobile apps, automation tools, etc.

To completely remove Discord commands, you would:
- Remove the command handler setup from `src/index.js`
- Delete the `src/commands/` folder
- The bot will still work with the API server running

## Running the Bot

```bash
# Install dependencies
npm install

# Start bot with API server
npm start
```

The bot will:
- Start Discord client and connect to Discord
- Start Express API server on port 3000 (or configured `API_PORT`)
- Load existing meetings on startup
- Accept API requests alongside Discord interactions
