import {Server} from 'socket.io'
import {createServer} from 'http'
import express from 'express'
import cors from 'cors'

class WebRTCSignalingServer {
  constructor(port = 3000) {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new Server(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.sessions = {};

    this.configureMiddleware();
    this.setupSocketEvents();
    this.startServer(port);
  }

  configureMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  setupSocketEvents() {
    this.io.on('connection', (socket) => {
      console.log(`New client connected: ${socket.id}`);

      socket.on('create-session', (sessionId) => this.handleCreateSession(socket, sessionId));
      socket.on('join-session', (sessionId) => this.handleJoinSession(socket, sessionId));
      socket.on('offer', (data) => this.handleOffer(socket, data));
      socket.on('answer', (data) => this.handleAnswer(socket, data));
      socket.on('candidate', (data) => this.handleCandidate(socket, data));
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  handleCreateSession(socket, sessionId) {
    if (this.sessions[sessionId]) {
      socket.emit('session-error', 'Session already exists');
      return;
    }

    this.sessions[sessionId] = { host: socket.id, peer: null };
    socket.join(sessionId);
    console.log(`Session created: ${sessionId}`);
  }

  handleJoinSession(socket, sessionId) {
    const session = this.sessions[sessionId];
    if (!session) {
      socket.emit('session-error', 'Session not found');
      return;
    }

    if (session.peer) {
      socket.emit('session-error', 'Session is full');
      return;
    }

    session.peer = socket.id;
    socket.join(sessionId);
    
    // Notify host that receiver joined
    this.io.to(session.host).emit('receiver-joined', sessionId);

    // If host already sent an offer, forward it to the peer
    if (session.hostOffer) {
      socket.emit('offer', { offer: session.hostOffer });
    }
  }

  handleOffer(socket, { offer, sessionId }) {
    const session = this.sessions[sessionId];
    if (!session) {
      socket.emit('session-error', 'Session not found');
      return;
    }

    session.hostOffer = offer;

    // Forward offer to peer if already joined
    if (session.peer) {
      socket.to(session.peer).emit('offer', { offer });
    }
  }

  handleAnswer(socket, { answer, sessionId }) {
    const session = this.sessions[sessionId];
    if (!session) {
      socket.emit('session-error', 'Session not found');
      return;
    }

    // Forward answer to host
    if (session.host) {
      socket.to(session.host).emit('answer', { answer });
    }
  }

  handleCandidate(socket, { candidate, sessionId }) {
    const session = this.sessions[sessionId];
    if (!session) {
      socket.emit('session-error', 'Session not found');
      return;
    }

    // Forward candidate to the other peer
    const targetId = socket.id === session.host ? session.peer : session.host;
    if (targetId) {
      socket.to(targetId).emit('candidate', { candidate });
    }
  }

  handleDisconnect(socket) {
    console.log(`Client disconnected: ${socket.id}`);

    for (const sessionId in this.sessions) {
      const session = this.sessions[sessionId];
      if (session.host === socket.id || session.peer === socket.id) {
        // Notify other peer about session ending
        const otherPeerId = session.host === socket.id ? session.peer : session.host;
        if (otherPeerId) {
          this.io.to(otherPeerId).emit('session-ended');
        }

        // Remove the session
        delete this.sessions[sessionId];
        console.log(`Session ${sessionId} closed.`);
      }
    }
  }

  startServer(port) {
    this.httpServer.listen(port, () => {
      console.log(`Signaling server running on port ${port}`);
    });
  }
}

// Instantiate the server
const server = new WebRTCSignalingServer();
