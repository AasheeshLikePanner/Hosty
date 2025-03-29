import React, { createContext, useState, useContext, useEffect } from 'react';
import io from 'socket.io-client';

const WebRTCContext = createContext({
  peerConnection: null,
  socketConnection: null,
  connectionStatus: 'disconnected',
  sessionLink: '',
  initializeConnection: async () => {},
  closeConnection: () => {},
  sendFile: async (file) => {},
  waitForReceiverConnection: async () => {},
});

const Host = ({ children, receiver = false }) => {
  console.log(receiver);
  
  const [peerConnection, setPeerConnection] = useState(null);
  const [socketConnection, setSocketConnection] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [sessionLink, setSessionLink] = useState('');
  const [dataChannel, setDataChannel] = useState(null);
  const [receiverConnected, setReceiverConnected] = useState(false);

  useEffect(() => {
    const socket = io('http://localhost:3000');
    if (!socket) {
      console.log('socket is not connected');
      
    }
    setSocketConnection(socket);
    return () => socket.disconnect();
  }, []);

  const initializeConnection = async () => {
    if (receiver) return;

    try {
      console.log('Initializing connection as Host...');
      
      const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
      const peer = new RTCPeerConnection(config);
      setPeerConnection(peer);

      const channel = peer.createDataChannel('fileTransfer');
      setDataChannel(channel);
      
      channel.onopen = () => setReceiverConnected(true);
      channel.onclose = () => setReceiverConnected(false);

      const sessionId = `hosty-${Math.random().toString(36).substring(7)}`;
      const newSessionLink = `http://localhost:3000/receiver/sessionId`;
      setSessionLink(newSessionLink);
      console.log('Generated session link:', newSessionLink);
      if (!socketConnection) {
        console.log('socket connection is not present');
        
      }
      socketConnection.emit('create-session', sessionId);

      socketConnection.on('receiver-joined', () => {
        console.log('Receiver has joined the session');
      });

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socketConnection.emit('candidate', { candidate: event.candidate, sessionId });
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketConnection.emit('offer', { offer, sessionId });

      socketConnection.on('answer', async ({ answer }) => {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socketConnection.on('candidate', async ({ candidate }) => {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      });

      setConnectionStatus('initialized');
    } catch (error) {
      console.error('Error initializing connection:', error);
      setConnectionStatus('error');
    }
  };

  const closeConnection = () => {
    peerConnection?.close();
    socketConnection?.disconnect();
    setConnectionStatus('disconnected');
    setReceiverConnected(false);
  };

  return (
    <WebRTCContext.Provider value={{
      peerConnection,
      socketConnection,
      connectionStatus,
      sessionLink,
      initializeConnection,
      closeConnection,
      sendFile: async () => {},
      waitForReceiverConnection: async () => {}
    }}>
      {children}
    </WebRTCContext.Provider>
  );
};

export const useWebRTCContext = () => useContext(WebRTCContext);
export default Host;
