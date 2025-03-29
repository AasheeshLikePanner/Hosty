import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Upload, FileText, Image, Video, FileCode, Send, Check, X, Copy, ChevronRight } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

const WebRTCSender = () => {
  const [fileTransfer, setFileTransfer] = useState({
    file: null,
    status: 'idle',
    progress: 0
  });
  const [sessionLink, setSessionLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  // Refs for animations
  const containerRef = useRef(null);
  const logoRef = useRef(null);
  const headerRef = useRef(null);
  const uploadRef = useRef(null);
  const fileDetailsRef = useRef(null);
  const buttonRef = useRef(null);
  const linkRef = useRef(null);
  const progressRef = useRef(null);

  const fileInputRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const sessionIdRef = useRef(null);

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

  // Initialize connection
  useEffect(() => {
    initializeConnection();
    return () => {
      cleanupConnection();
    };
  }, []);

  const initializeConnection = () => {
    try {
      // Initialize socket connection
      socketRef.current = io(SIGNALING_SERVER, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      // Create unique session 
      sessionIdRef.current = generateSessionId();
      setSessionLink(`${window.location.origin}/receiver/${sessionIdRef.current}`);

      // Setup socket event listeners
      setupSocketListeners(sessionIdRef.current);

      // Add error handling for socket
      socketRef.current.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setError('Failed to connect to signaling server');
      });
    } catch (err) {
      console.error('Initialization error:', err);
      setError('Failed to initialize connection');
    }
  };

  const cleanupConnection = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
  };

  const resetConnection = () => {
    cleanupConnection();
    
    // Reset file transfer state
    setFileTransfer(prev => ({
      ...prev,
      status: 'idle',
      progress: 0
    }));
    
    // Animate button back to idle state
    if (buttonRef.current) {
      gsap.to(buttonRef.current, {
        backgroundColor: "#000000",
        color: "#FFFFFF",
        scale: 1,
        duration: 0.4,
        ease: "power2.out"
      });
    }
    
    // Initialize new connection
    initializeConnection();
  };

  // Initialize GSAP animations
  useEffect(() => {
    // Initial animations on page load
    const tl = gsap.timeline();
    
    tl.from(logoRef.current, {
      x: -20,
      opacity: 0,
      duration: 0.6,
      ease: "power3.out"
    });
    
    tl.from(headerRef.current, {
      y: 20,
      opacity: 0,
      duration: 0.6,
      ease: "power3.out"
    }, "-=0.3");
    
    tl.from(uploadRef.current, {
      y: 30,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out"
    }, "-=0.4");
    
    // Initialize scroll animations
    gsap.from(".section-fade-in", {
      scrollTrigger: {
        trigger: ".section-fade-in",
        start: "top 85%",
        toggleActions: "play none none none"
      },
      y: 30,
      opacity: 0,
      duration: 0.6,
      stagger: 0.15,
      ease: "power3.out"
    });
    
    // Animation for logo hover
    const logo = logoRef.current;
    if (logo) {
      logo.addEventListener("mouseenter", () => {
        gsap.to(logo, { scale: 1.05, duration: 0.2, ease: "power1.out" });
      });
      
      logo.addEventListener("mouseleave", () => {
        gsap.to(logo, { scale: 1, duration: 0.2, ease: "power1.out" });
      });
    }
    
    return () => {
      // Cleanup
      if (logo) {
        logo.removeEventListener("mouseenter", () => {});
        logo.removeEventListener("mouseleave", () => {});
      }
      
      ScrollTrigger.getAll().forEach(trigger => trigger.kill());
    };
  }, []);

  // Animation for progress update
  useEffect(() => {
    if (fileTransfer.status === 'transferring' && progressRef.current) {
      gsap.to(progressRef.current, {
        width: `${fileTransfer.progress}%`,
        duration: 0.3,
        ease: "power1.out"
      });
    }
  }, [fileTransfer.progress, fileTransfer.status]);

  // Animation for completed transfer
  useEffect(() => {
    if (fileTransfer.status === 'complete' && buttonRef.current) {
      gsap.to(
        buttonRef.current,
        { 
          backgroundColor: "#10B981", 
          duration: 0.5,
          ease: "power2.out"
        }
      );
      
      gsap.to(buttonRef.current, {
        scale: 1.03,
        duration: 0.2,
        yoyo: true,
        repeat: 1,
        ease: "back.out(1.5)"
      });
    }
  }, [fileTransfer.status]);

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
      
      // Animate when receiver joins
      gsap.to(linkRef.current, {
        backgroundColor: "#F0FDF4",
        borderColor: "#86EFAC",
        boxShadow: "0 0 10px rgba(134, 239, 172, 0.2)",
        duration: 0.4,
        ease: "power2.out"
      });
      
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

      // Reset connection if transfer was previously completed
      if (fileTransfer.status === 'complete') {
        resetConnection();
        return;
      }

      const peerConnection = createPeerConnection();

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          const sessionId = sessionIdRef.current;
          console.log('Sending ICE candidate', event.candidate);
          socketRef.current.emit('candidate', { 
            candidate: event.candidate,
            sessionId 
          });
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sessionId = sessionIdRef.current;
      console.log('Sending offer', offer);
      if (socketRef.current) {
        socketRef.current.emit('offer', { 
          offer, 
          sessionId 
        });
      }

      // Update status to preparing transfer
      setFileTransfer(prev => ({ ...prev, status: 'preparing' }));
      
      // Animate button during preparation
      if (buttonRef.current) {
        gsap.to(buttonRef.current, {
          y: [-2, 2, -2],
          duration: 0.8,
          repeat: -1,
          ease: "sine.inOut"
        });
      }
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
      
      // Stop button animation when answer received
      if (buttonRef.current) {
        gsap.killTweensOf(buttonRef.current);
        gsap.to(buttonRef.current, {
          y: 0,
          duration: 0.2,
          ease: "power2.out"
        });
      }
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
    
    // Animate the transition to transfer state
    if (buttonRef.current) {
      gsap.to(buttonRef.current, {
        backgroundColor: "#EAB308", // Yellow for in-progress
        color: "#000000",
        duration: 0.3,
        ease: "power2.out"
      });
    }
    
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
      // If a file transfer was previously completed, reset the connection
      if (fileTransfer.status === 'complete') {
        resetConnection();
      }
      
      setFileTransfer({
        file,
        status: 'idle',
        progress: 0
      });
      
      // Animate file details appearing
      if (fileDetailsRef.current) {
        gsap.fromTo(
          fileDetailsRef.current,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.5)" }
        );
      }
    }
  };

  const copyToClipboard = () => {
    if (!sessionLink) return;
    navigator.clipboard.writeText(sessionLink);
    setCopied(true);
    
    // Animate the copy button
    const copyButton = document.querySelector('.copy-button');
    if (copyButton) {
      gsap.to(copyButton, {
        scale: 1.1,
        duration: 0.15,
        yoyo: true,
        repeat: 1,
        ease: "power1.out"
      });
    }
    
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
    // Animate file removal
    if (fileDetailsRef.current) {
      gsap.to(fileDetailsRef.current, {
        opacity: 0, 
        y: 12, 
        duration: 0.3,
        ease: "power2.in",
        onComplete: () => {
          setFileTransfer({
            file: null,
            status: 'idle',
            progress: 0
          });
          
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      });
    } else {
      setFileTransfer({
        file: null,
        status: 'idle',
        progress: 0
      });
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="min-h-screen bg-white" ref={containerRef}>
      {/* Logo in corner */}
      <div 
        ref={logoRef}
        className="fixed top-6 left-6 z-50 cursor-pointer"
      >
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-full bg-black flex items-center justify-center">
            <Send className="w-3.5 h-3.5 text-white transform -rotate-45" />
          </div>
          <span className="text-lg font-light tracking-wide">hosty</span>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-24">
        <div className="max-w-md mx-auto space-y-12">
          <div className="text-center" ref={headerRef}>
            <h2 className="text-4xl font-extralight tracking-tight mb-3">
              Seamless Transfer
            </h2>
            <p className="text-sm text-gray-500 font-light max-w-xs mx-auto">
              Share files instantly with anyone, anywhere.
            </p>
          </div>

          <div className="bg-white shadow-lg rounded-xl p-8 transition-all duration-300 hover:shadow-xl section-fade-in">
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              id="fileInput"
            />
            
            <div ref={uploadRef}>
              <label 
                htmlFor="fileInput" 
                className="cursor-pointer flex flex-col items-center group"
              >
                <div className="mb-6 p-5 rounded-full bg-gray-50 group-hover:bg-gray-100 transition-all duration-200 transform group-hover:scale-102">
                  <Upload className="w-10 h-10 text-gray-700" />
                </div>

                <h3 className="text-lg font-light mb-2 text-gray-800">
                  {fileTransfer.file ? 'File Ready' : 'Upload File'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {fileTransfer.file 
                    ? fileTransfer.file.name 
                    : 'Drag and drop or click to select'}
                </p>
              </label>
            </div>

            {fileTransfer.file && (
              <div 
                className="mt-8 pt-5 border-t border-gray-100" 
                ref={fileDetailsRef}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 overflow-hidden">
                    {React.createElement(getFileIcon(fileTransfer.file), {
                      className: "w-8 h-8 text-gray-700 flex-shrink-0"
                    })}
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium truncate">{fileTransfer.file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(fileTransfer.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={removeFile}
                    className="text-gray-400 hover:text-black transition-colors duration-200 rounded-full p-1.5 hover:bg-gray-100 flex-shrink-0 ml-2"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {fileTransfer.file && (
              <div ref={buttonRef} className="mt-8">
                <button
                  onClick={createOffer}
                  disabled={fileTransfer.status === 'preparing' || fileTransfer.status === 'transferring'}
                  className={`w-full py-3 rounded-lg text-sm font-medium tracking-wide
                    ${(fileTransfer.status === 'idle' || fileTransfer.status === 'complete') 
                      ? 'bg-black text-white hover:opacity-90 transform transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md' 
                      : fileTransfer.status === 'transferring'
                        ? 'bg-yellow-500 text-black cursor-not-allowed'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                >
                  {fileTransfer.status === 'idle' && (
                    <div className="z-20 flex items-center justify-center">
                      <Send className="mr-2 w-4 h-4" />
                      Transfer File
                    </div>
                  )}
                  {fileTransfer.status === 'preparing' && (
                    <div className="flex items-center justify-center">
                      Preparing Connection...
                    </div>
                  )}
                  {fileTransfer.status === 'transferring' && (
                    <div className="relative w-full h-full overflow-hidden">
                      <div className="flex items-center justify-center relative z-10">
                        Transferring... {fileTransfer.progress}%
                      </div>
                      <div 
                        ref={progressRef}
                        className="absolute top-0 left-0 bottom-0 bg-black bg-opacity-10" 
                        style={{ width: `${fileTransfer.progress}%` }}
                      ></div>
                    </div>
                  )}
                  {fileTransfer.status === 'complete' && (
                    <div className="flex items-center justify-center text-white">
                      <Check className="mr-2 w-4 h-4" />
                      Transfer Again
                    </div>
                  )}
                </button>
              </div>
            )}

            {sessionLink && (
              <div 
                ref={linkRef}
                className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-100 transition-all duration-200 section-fade-in"
              >
                <div className="flex items-center justify-between">
                  <div className="overflow-hidden flex-1">
                    <p className="text-xs text-gray-500 mb-1">Share this link:</p>
                    <p className="text-xs font-medium truncate">{sessionLink}</p>
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className="ml-3 p-2 rounded-md bg-black text-white hover:opacity-90 transition-all duration-200 copy-button"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 flex items-center">
                  <ChevronRight className="w-3 h-3 mr-1" />
                  Send this link to start the transfer
                </p>
              </div>
            )}
            
            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-md text-xs">
                {error}
              </div>
            )}
          </div>
          
          <div className="text-center text-gray-400 text-xs font-light section-fade-in">
            Files are transferred directly between devices.
            <br />No data is stored on our servers.
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebRTCSender;