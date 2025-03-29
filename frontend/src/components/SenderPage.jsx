import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Upload, FileText, Image, Video, FileCode, Send, Check, X, Copy } from 'lucide-react';

const WebRTCSender = () => {
  const [fileTransfer, setFileTransfer] = useState({
    file: null,
    status: 'idle',
    progress: 0
  });
  const [sessionLink, setSessionLink] = useState('');
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);

  const SIGNALING_SERVER = 'http://localhost:3000'; // Update with your signaling server URL

  const FILE_ICONS = {
    'application/pdf': FileText,
    'text/plain': FileCode,
    'text/html': FileCode,
    'application/json': FileCode,
    'image/': Image,
    'video/': Video,
    'audio/': Video
  };

  
  useEffect(() => {
    try {
      // Initialize socket connection
      socketRef.current = io(SIGNALING_SERVER, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      // Create unique session 
      const sessionId = generateSessionId();
      setSessionLink(`${window.location.origin}/receiver/${sessionId}`);

      // Setup socket event listeners
      setupSocketListeners(sessionId);

      // Add error handling for socket
      socketRef.current.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setError('Failed to connect to signaling server');
      });

      // Cleanup on component unmount
      return () => {
        socketRef.current?.disconnect();
        peerConnectionRef.current?.close();
      };
    } catch (err) {
      console.error('Initialization error:', err);
      setError('Failed to initialize connection');
    }
  }, []);

  const generateSessionId = () => {
    return Math.random().toString(36).substring(2, 10);
  };

  const setupSocketListeners = (sessionId) => {
    const socket = socketRef.current;
    if (!socket) {
      console.error('Socket not initialized');
      return;
    }

    // Create WebRTC session
    socket.emit('create-session', sessionId);

    socket.on('receiver-joined', () => {
      console.log('Receiver joined, creating offer');
      createOffer();
    });

    socket.on('answer', ({ answer }) => {
      console.log('Received answer');
      handleAnswer(answer);
    });

    socket.on('candidate', ({ candidate }) => {
      console.log('Received ICE candidate');
      handleCandidate(candidate);
    });
  };

  const createPeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(configuration);

    // Setup data channel
    const dataChannel = peerConnection.createDataChannel('fileTransfer', {
      negotiated: true,
      id: 0
    });

    dataChannel.onopen = () => {
      console.log('Data channel opened');
      startFileTransfer();
    };

    dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      setError('Data channel error occurred');
    };

    dataChannel.onclose = () => {
      console.log('Data channel closed');
    };

    peerConnection.ondatachannel = (event) => {
      console.log('Data channel received');
      const receivedChannel = event.channel;
      receivedChannel.onopen = () => {
        console.log('Received data channel opened');
      };
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === 'failed') {
        setError('WebRTC connection failed');
      }
    };

    peerConnectionRef.current = peerConnection;
    dataChannelRef.current = dataChannel;

    return peerConnection;
  };

  const createOffer = async () => {
    try {
      // Ensure file is selected
      if (!fileTransfer.file) {
        setError('Please select a file first');
        return;
      }

      const peerConnection = createPeerConnection();

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          const sessionId = sessionLink.split('/').pop();
          console.log('Sending ICE candidate', event.candidate);
          socketRef.current?.emit('candidate', { 
            candidate: event.candidate,
            sessionId 
          });
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sessionId = sessionLink.split('/').pop();
      console.log('Sending offer', offer);
      socketRef.current?.emit('offer', { 
        offer, 
        sessionId 
      });

      // Update status to preparing transfer
      setFileTransfer(prev => ({ ...prev, status: 'preparing' }));
    } catch (error) {
      console.error('Error creating offer:', error);
      setError('Failed to create WebRTC offer');
    }
  };

  const handleAnswer = async (answer) => {
    try {
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) {
        console.error('Peer connection not established');
        return;
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('Remote description set');
    } catch (error) {
      console.error('Error handling answer:', error);
      setError('Failed to process WebRTC answer');
    }
  };

  const handleCandidate = async (candidate) => {
    try {
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) {
        console.error('Peer connection not established');
        return;
      }

      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('ICE candidate added');
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
      setError('Failed to add ICE candidate');
    }
  };

  const startFileTransfer = () => {
    const { file } = fileTransfer;
    const dataChannel = dataChannelRef.current;

    if (!file || !dataChannel) {
      console.error('File or data channel not ready');
      setError('Unable to start file transfer');
      return;
    }

    // Ensure data channel is open
    if (dataChannel.readyState !== 'open') {
      console.error('Data channel is not open. Current state:', dataChannel.readyState);
      setError('Data channel is not ready');
      return;
    }

    setFileTransfer(prev => ({ ...prev, status: 'transferring' }));
    console.log('Starting file transfer:', file.name);
    
    // Prepare file metadata
    const metadata = {
      name: file.name,
      type: file.type,
      size: file.size
    };

    // Send file metadata first
    try {
      console.log('Sending file metadata:', metadata);
      
      dataChannel.send(JSON.stringify({
        type: 'metadata',
        data: metadata
      }));
    } catch (error) {
      console.error('Error sending metadata:', error);
      setError('Failed to send file metadata');
      return;
    }

    // Read and send file in chunks
    const chunkSize = 16 * 1024; // 16KB chunks
    const reader = new FileReader();
    let offset = 0;

    const readNextChunk = () => {
      const slice = file.slice(offset, offset + chunkSize);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (event) => {
      const chunk = event.target?.result;
      if (chunk) {
        try {
          console.log('Sending file chunk:', offset, chunk.byteLength);
          
          dataChannel.send(JSON.stringify({
            type: 'chunk',
            data: Array.from(new Uint8Array(chunk))
          }));

          offset += chunk.byteLength;
          const progress = Math.round((offset / file.size) * 100);
          
          setFileTransfer(prev => ({ ...prev, progress }));

          if (offset < file.size) {
            readNextChunk();
          } else {
            // Transfer complete
            dataChannel.send(JSON.stringify({ type: 'end' }));
            setFileTransfer(prev => ({ ...prev, status: 'complete' }));
          }
        } catch (error) {
          console.error('Error sending file chunk:', error);
          setError('File transfer failed');
        }
      }
    };

    reader.onerror = (error) => {
      console.error('File reader error:', error);
      setError('Error reading file');
    };

    readNextChunk();
  };


  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileTransfer({
        file,
        status: 'idle',
        progress: 0
      });
    }
  };


  const copyToClipboard = () => {
    if (!sessionLink) return;
    navigator.clipboard.writeText(sessionLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFileIcon = (file) => {
    const fileType = file.type;
    for (const [type, Icon] of Object.entries(FILE_ICONS)) {
      if (fileType.startsWith(type)) return Icon;
    }
    return FileText;
  };

  const removeFile = () => {
    setFileTransfer({
      file: null,
      status: 'idle',
      progress: 0
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container mx-auto px-6 py-24">
      <div className="max-w-2xl mx-auto space-y-12">
        <div className="text-center">
          <h2 className="text-6xl font-extralight tracking-tight mb-4">
            Seamless Transfer
          </h2>
        </div>

        <div className="bg-white shadow-lg rounded-xl p-8">
          <input 
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            id="fileInput"
          />
          
          <label 
            htmlFor="fileInput" 
            className="cursor-pointer flex flex-col items-center"
          >
            <div className="mb-8 p-6 rounded-full bg-gray-100">
              <Upload className="w-16 h-16 text-gray-700" />
            </div>

            <h3 className="text-3xl font-light mb-4 text-gray-800">
              {fileTransfer.file ? 'File Ready' : 'Upload File'}
            </h3>
            <p className="text-gray-500 text-lg">
              {fileTransfer.file 
                ? fileTransfer.file.name 
                : 'Drag and drop or click to select'}
            </p>
          </label>

          {fileTransfer.file && (
            <div className="mt-8 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  {React.createElement(getFileIcon(fileTransfer.file), {
                    className: "w-12 h-12 text-gray-700"
                  })}
                  <div>
                    <p className="text-xl font-light">{fileTransfer.file.name}</p>
                    <p className="text-gray-500">
                      {(fileTransfer.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button 
                  onClick={removeFile}
                  className="text-gray-500 hover:text-black"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>
            </div>
          )}

          {fileTransfer.file && (
            <button
              onClick={createOffer}
              disabled={fileTransfer.status !== 'idle'}
              className={`w-full py-5 rounded-xl text-xl font-light tracking-wide mt-6
                ${fileTransfer.status === 'idle' 
                  ? 'bg-black text-white' 
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
            >
              {fileTransfer.status === 'idle' && (
                <div className="z-20 flex items-center justify-center" onClick={() => console.log('button pres')
                }>
                  <Send className="mr-4 w-6 h-6" />
                  Transfer File
                </div>
              )}
              {fileTransfer.status === 'transferring' && (
                <div className="flex items-center justify-center">
                  Transferring... {fileTransfer.progress}%
                </div>
              )}
              {fileTransfer.status === 'complete' && (
                <div className="flex items-center justify-center text-green-600">
                  <Check className="mr-4 w-6 h-6" />
                  Transfer Complete
                </div>
              )}
            </button>
          )}

          {sessionLink && (
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="overflow-hidden">
                  <p className="text-sm text-gray-500 mb-1">Share this link:</p>
                  <p className="text-lg font-medium truncate">{sessionLink}</p>
                </div>
                <button
                  onClick={copyToClipboard}
                  className="ml-4 p-2 rounded-lg bg-black text-white"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              <p className="mt-3 text-sm text-gray-500">
                Send this link to the receiver to start the transfer
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebRTCSender;