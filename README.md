# Screen Share Application

A real-time screen sharing application with Firebase database integration.

## Features

- Real-time screen sharing using WebRTC and Socket.IO
- Firebase Firestore for session management
- Simple web interface for sharing and viewing
- Session-based access control

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Firebase:**
   - Create a Firebase project at https://console.firebase.google.com
   - Generate a service account key
   - Replace the content in `firebase-config.json` with your actual credentials
   - Update the database URL in `server.js`

3. **Run the application:**
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

4. **Access the application:**
   Open http://localhost:3000 in your browser

## Usage

### To Share Screen:
1. Click "Start Sharing"
2. Select the screen/window to share
3. Share the generated Session ID with viewers

### To View Shared Screen:
1. Enter the Session ID provided by the sharer
2. Click "Join Session"
3. View the live screen share

## Firebase Database Structure

```
sessions/
  {sessionId}/
    - hostId: string
    - startTime: timestamp
    - endTime: timestamp (optional)
    - status: 'active' | 'ended'
    - viewerCount: number
```

## Security Notes

- Replace placeholder values in `firebase-config.json`
- Consider implementing authentication for production use
- Add rate limiting and session validation as needed