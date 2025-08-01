const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: false
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Using in-memory storage for sessions
console.log('Using in-memory storage for sessions');

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Store active sessions
const activeSessions = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle screen sharing start with validation
  socket.on('start-sharing', async (data) => {
    const sessionId = data.sessionId;
    
    // Validate session ID
    if (!sessionId || !/^[A-Z0-9]{8,12}$/.test(sessionId)) {
      socket.emit('error', { message: 'Invalid session ID' });
      return;
    }
    
    // Check if session already exists
    if (activeSessions.has(sessionId)) {
      socket.emit('error', { message: 'Session already exists' });
      return;
    }
    
    activeSessions.set(sessionId, {
      hostId: socket.id,
      viewers: new Set(),
      startTime: new Date(),
      maxViewers: 10 // Limit viewers for security
    });

    console.log(`Session created: ${sessionId}`);

    socket.join(sessionId);
    socket.emit('sharing-started', { sessionId });
    console.log(`Screen sharing started: ${sessionId}`);
  });

  // Handle viewer joining with security checks
  socket.on('join-session', async (data) => {
    const sessionId = data.sessionId;
    
    if (!sessionId || !/^[A-Z0-9]{8,12}$/.test(sessionId)) {
      socket.emit('error', { message: 'Invalid session ID format' });
      return;
    }
    
    const session = activeSessions.get(sessionId);

    if (session) {
      if (session.viewers.size >= session.maxViewers) {
        socket.emit('error', { message: 'Session is full' });
        return;
      }
      
      if (session.hostId === socket.id) {
        socket.emit('error', { message: 'Host cannot join as viewer' });
        return;
      }
      
      session.viewers.add(socket.id);
      socket.join(sessionId);
      socket.emit('joined-session', { sessionId });
      
      console.log(`Viewer joined session: ${sessionId}`);
      
      socket.to(sessionId).emit('viewer-joined', {
        viewerId: socket.id,
        viewerCount: session.viewers.size
      });
      io.to(sessionId).emit('viewer-count', session.viewers.size);
    } else {
      socket.emit('session-not-found');
    }
  });

  // Handle WebRTC signaling
  socket.on('offer', (data) => {
    socket.to(data.sessionId).emit('offer', data);
  });

  socket.on('answer', (data) => {
    socket.to(data.sessionId).emit('answer', data);
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.sessionId).emit('ice-candidate', data);
  });

  // Handle chat messages with validation
  socket.on('chat-message', (data) => {
    const { sessionId, message } = data;
    
    if (!sessionId || !activeSessions.has(sessionId)) {
      return;
    }
    
    if (!message || message.length > 500) {
      return;
    }
    
    socket.to(sessionId).emit('chat-message', {
      ...data,
      timestamp: Date.now()
    });
  });

  // Handle quality changes
  socket.on('quality-change', (data) => {
    socket.to(data.sessionId).emit('quality-change', data);
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    
    // Clean up sessions
    for (const [sessionId, session] of activeSessions.entries()) {
      if (session.hostId === socket.id) {
        // Host disconnected, end session
        activeSessions.delete(sessionId);
        console.log(`Session ended: ${sessionId}`);
        io.to(sessionId).emit('session-ended');
      } else if (session.viewers.has(socket.id)) {
        // Viewer disconnected
        session.viewers.delete(socket.id);
        console.log(`Viewer disconnected from: ${sessionId}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});