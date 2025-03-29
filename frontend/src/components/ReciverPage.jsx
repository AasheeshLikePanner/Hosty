import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { FileText, Image, Video, FileCode, Download, Check, File } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

const WebRTCReceiver = () => {
  const [fileMetadata, setFileMetadata] = useState(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [fileData, setFileData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingData, setStreamingData] = useState(null);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [debugInfo, setDebugInfo] = useState({
    chunkCount: 0,
    lastChunkSize: 0,
    totalCalculatedSize: 0,
    progressCalculation: "0%"
  });

  // Refs for elements to animate
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const progressRef = useRef(null);
  const previewRef = useRef(null);

  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const receivedChunksRef = useRef([]);
  const mediaElementRef = useRef(null);
  const totalBytesRef = useRef(0);
  const fileMetadataRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const mediaQueueRef = useRef([]);

  const SIGNALING_SERVER = 'http://localhost:3000';

  const FILE_ICONS = {
    'application/pdf': FileText,
    'text/plain': FileCode,
    'text/html': FileCode,
    'application/json': FileCode,
    'image/': Image,
    'video/': Video,
    'audio/': Video,
    'application/vnd.openxmlformats-officedocument': FileText,
    'application/msword': FileText
  };

  // Initialize GSAP animations
  useEffect(() => {
    if (containerRef.current) {
      // Fade in the container
      gsap.from(containerRef.current, {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: "power2.out"
      });

      // Create scroll animations
      ScrollTrigger.batch(".animate-on-scroll", {
        onEnter: batch => gsap.to(batch, {
          opacity: 1,
          y: 0,
          stagger: 0.15,
          duration: 0.8,
          ease: "power2.out"
        }),
        start: "top 85%",
        once: true
      });
    }
  }, []);

  // Animate elements when file metadata changes
  useEffect(() => {
    if (fileMetadata && headerRef.current) {
      gsap.from(headerRef.current, {
        y: -20,
        opacity: 0,
        duration: 0.5,
        ease: "back.out(1.7)"
      });
    }
  }, [fileMetadata]);

  // Animation for progress updates
  useEffect(() => {
    if (progressRef.current && transferProgress > 0) {
      gsap.to(progressRef.current.querySelector(".progress-bar"), {
        width: `${transferProgress}%`,
        duration: 0.3,
        ease: "power1.out"
      });
      
      gsap.from(progressRef.current.querySelector(".progress-text"), {
        scale: 1.1,
        duration: 0.2,
        ease: "power1.out"
      });
    }
  }, [transferProgress]);

  useEffect(() => {
    if (fileMetadata && fileMetadata.size > 0 && receivedBytes > 0) {
      const calculatedProgress = Math.min(100, Math.round((receivedBytes / fileMetadata.size) * 100));
      console.log(`Effect triggered: Recalculating progress - ${calculatedProgress}%`);
      setTransferProgress(calculatedProgress);
      fileMetadataRef.current = fileMetadata;
      setDebugInfo(prev => ({
        ...prev,
        totalCalculatedSize: receivedBytes,
        progressCalculation: `${receivedBytes} / ${fileMetadata.size} = ${calculatedProgress}%`
      }));
    }
  }, [receivedBytes, fileMetadata]);

  useEffect(() => {
    setupWebRTCConnection();

    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (streamingData) {
        URL.revokeObjectURL(streamingData);
      }
      if (fileData) {
        URL.revokeObjectURL(fileData);
      }
      // Cleanup Media Source if it exists
      if (mediaSourceRef.current && sourceBufferRef.current) {
        try {
          if (sourceBufferRef.current.updating) {
            sourceBufferRef.current.abort();
          }
          if (mediaSourceRef.current.readyState === 'open') {
            mediaSourceRef.current.endOfStream();
          }
        } catch (e) {
          console.error('Error during MSE cleanup:', e);
        }
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (streamingData) {
        URL.revokeObjectURL(streamingData);
      }
    };
  }, [streamingData]);

  // Initialize MediaSource for streaming video
  const setupMediaSourceExtensions = (fileType) => {
    if ('MediaSource' in window) {
      try {
        // Common video codecs
        const mimeCodecs = {
          'video/mp4': 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
          'video/webm': 'video/webm; codecs="vp8, vorbis"',
          'video/x-matroska': 'video/webm; codecs="vp8, vorbis"', // For MKV files, try webm codec
        };
        
        const mimeType = mimeCodecs[fileType] || fileType;
        
        if (!MediaSource.isTypeSupported(mimeType)) {
          console.warn(`Media type ${mimeType} is not supported for MSE streaming`);
          return false;
        }
        
        const mediaSource = new MediaSource();
        mediaSourceRef.current = mediaSource;
        
        mediaSource.addEventListener('sourceopen', () => {
          console.log('MediaSource opened');
          try {
            sourceBufferRef.current = mediaSource.addSourceBuffer(mimeType);
            sourceBufferRef.current.mode = 'segments';
            sourceBufferRef.current.addEventListener('updateend', processMediaQueue);
            
            // Process any queued media data
            processMediaQueue();
          } catch (e) {
            console.error('Error setting up SourceBuffer:', e);
            return false;
          }
        });
        
        return URL.createObjectURL(mediaSource);
      } catch (e) {
        console.error('Error setting up MediaSource:', e);
        return false;
      }
    }
    
    console.warn('MediaSource Extensions not supported in this browser');
    return false;
  };

  const processMediaQueue = () => {
    if (mediaQueueRef.current.length > 0 && 
        sourceBufferRef.current && 
        !sourceBufferRef.current.updating) {
      const chunk = mediaQueueRef.current.shift();
      try {
        sourceBufferRef.current.appendBuffer(chunk);
      } catch (e) {
        console.error('Error appending buffer:', e);
      }
    }
  };

  const setupWebRTCConnection = () => {
    const socket = io(SIGNALING_SERVER);
    socketRef.current = socket;

    const sessionId = window.location.pathname.split('/').pop() || '';

    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(configuration);
    peerConnectionRef.current = peerConnection;

    const dataChannel = peerConnection.createDataChannel('fileTransfer', {
      negotiated: true,
      id: 0
    });
    
    dataChannelRef.current = dataChannel;

    dataChannel.onopen = () => {
      console.log('Data channel opened on receiver');
      setConnectionStatus('connected');
      
      // Animate connection status change
      gsap.to('.connection-status', {
        backgroundColor: '#22c55e',
        scale: 1.1,
        duration: 0.5,
        yoyo: true,
        repeat: 1
      });
    };

    dataChannel.onclose = () => {
      console.log('Data channel closed on receiver');
      setConnectionStatus('disconnected');
    };

    dataChannel.onerror = (error) => {
      console.error('Data channel error on receiver:', error);
    };

    dataChannel.onmessage = (event) => {
      handleReceivedMessage(event);
    };

    socket.emit('join-session', sessionId);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('New ICE candidate:', event.candidate);
        socket.emit('candidate', { 
          candidate: event.candidate, 
          sessionId 
        });
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState);
    };

    socket.on('offer', async ({ offer }) => {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log('Answer created and set as local description');
        
        socket.emit('answer', { 
          answer, 
          sessionId 
        });
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    });

    socket.on('candidate', async ({ candidate }) => {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('ICE candidate added');
        
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    });
  };

  const handleReceivedMessage = (event) => {
    console.log('DataChannel message received, data type:', typeof event.data);

    try {
      const message = JSON.parse(event.data);
      console.log('Parsed message:', message);
      
      switch (message.type) {
        case 'metadata':
          handleMetadata(message.data);
          break;
        case 'chunk':
          handleFileChunk(message.data);
          break;
        case 'end':
          console.log('End message received with complete chunk count:', debugInfo.chunkCount);
          finalizeFileTransfer();
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  };

  const handleMetadata = (metadata) => {
    console.log('Received metadata:', metadata);
    setFileMetadata(metadata);
    fileMetadataRef.current = metadata;
    receivedChunksRef.current = [];
    setTransferProgress(0);
    setReceivedBytes(0);
    totalBytesRef.current = metadata.size;
    
    setDebugInfo({
      chunkCount: 0,
      lastChunkSize: 0,
      totalCalculatedSize: 0,
      progressCalculation: "0%"
    });
    
    // Special handling for video streaming
    if (metadata.type.startsWith('video/') || metadata.type === 'video/x-matroska') {
      setIsStreaming(true);
      
      // Set up MediaSource for video streaming
      const mseUrl = setupMediaSourceExtensions(metadata.type);
      if (mseUrl) {
        setStreamingData(mseUrl);
      } else {
        // Fallback to normal streaming if MSE setup fails
        setIsStreaming(true);
      }
    }
    else if (isStreamableType(metadata.type)) {
      setIsStreaming(true);
    } else {
      setIsStreaming(false);
    }
    
    // Animate the appearance of file info
    gsap.from(".file-info", {
      opacity: 0,
      x: -20,
      stagger: 0.1,
      delay: 0.3,
      duration: 0.6,
      ease: "power2.out"
    });
  };

  const isStreamableType = (fileType) => {
    return fileType.startsWith('image/') || 
           fileType.startsWith('video/') || 
           fileType.startsWith('audio/') ||
           fileType === 'application/pdf' ||
           fileType === 'video/x-matroska';
  };

  const handleFileChunk = (chunkData) => {
    if (!Array.isArray(chunkData)) {
      console.error('Expected chunk data to be an array, received:', typeof chunkData);
      return;
    }

    const chunk = new Uint8Array(chunkData);
    receivedChunksRef.current.push(chunk);

    const newChunkCount = debugInfo.chunkCount + 1;
    
    setDebugInfo(prev => ({
      ...prev,
      chunkCount: receivedChunksRef.current.length,
      lastChunkSize: chunk.length
    }));

    let totalReceivedBytes = 0;
    for (const chunk of receivedChunksRef.current) {
      totalReceivedBytes += chunk.length;
    }
    
    console.log(`Chunk #${newChunkCount} received, size: ${chunk.length}, total received: ${totalReceivedBytes} bytes`);
    
    setReceivedBytes(totalReceivedBytes);
    
    if (fileMetadata && fileMetadata.size > 0) {
      const progress = Math.min(100, Math.round((totalReceivedBytes / fileMetadata.size) * 100));
      console.log(`Calculated progress: ${progress}%, Received: ${totalReceivedBytes}/${fileMetadata.size} bytes`);
      
      setTransferProgress(progress);
    }

    // Handle MediaSource streaming for video files
    if (isStreaming && fileMetadata && sourceBufferRef.current) {
      if (fileMetadata.type.startsWith('video/') || fileMetadata.type === 'video/x-matroska') {
        try {
          // Queue this chunk for MediaSource processing
          mediaQueueRef.current.push(chunk.buffer);
          
          // Process the queue if sourceBuffer is not currently updating
          if (!sourceBufferRef.current.updating) {
            processMediaQueue();
          }
          
          // Try to start playing as soon as we have some data
          if (mediaElementRef.current && receivedChunksRef.current.length >= 3) {
            mediaElementRef.current.play().catch(e => console.warn('Auto-play prevented:', e));
          }
          
          return; // Skip regular streaming updates for video when using MSE
        } catch (e) {
          console.error('Error in MSE handling:', e);
          // Fall back to regular streaming if MSE fails
        }
      }
      
      // For non-video or fallback handling
      if (isStreaming && fileMetadata) {
        // For audio/video, update preview more frequently
        if (fileMetadata.type.startsWith('audio/') || 
            fileMetadata.type.startsWith('video/') || 
            fileMetadata.type === 'video/x-matroska') {
          // Update every 500KB or on first chunk
          if (totalReceivedBytes % 500000 < chunk.length || totalReceivedBytes === chunk.length) {
            updateStreamPreview();
          }
        } 
        // For images, wait until we have a bit more data
        else if (fileMetadata.type.startsWith('image/')) {
          const minBytesForPreview = Math.min(fileMetadata.size * 0.1, 50000);
          if (totalReceivedBytes >= minBytesForPreview) {
            updateStreamPreview();
          }
        }
        // For PDFs, update frequently
        else if (fileMetadata.type === 'application/pdf') {
          const updateInterval = Math.min(fileMetadata.size * 0.05, 100000);
          if (totalReceivedBytes % updateInterval < chunk.length || totalReceivedBytes === chunk.length) {
            updateStreamPreview();
          }
        }
      }
    }
  };

  const updateStreamPreview = () => {
    console.log('Updating stream preview');
    
    try {
      const blob = new Blob(receivedChunksRef.current, { type: fileMetadata.type });
      
      if (streamingData) {
        URL.revokeObjectURL(streamingData);
      }
      
      const url = URL.createObjectURL(blob);
      setStreamingData(url);
      
      // Pulse animation on preview update
      if (previewRef.current) {
        gsap.to(previewRef.current, {
          boxShadow: "0 0 15px rgba(59, 130, 246, 0.5)",
          duration: 0.3,
          yoyo: true,
          repeat: 1
        });
      }
      
      console.log('Stream preview updated, blob size:', blob.size, 'Current progress:', transferProgress);
    } catch (error) {
      console.error('Error updating stream preview:', error);
    }
  };

  const finalizeFileTransfer = () => {
    console.log('Finalizing file transfer');
    if (!fileMetadataRef.current) {
      console.error('No file metadata available for finalization'); 
      return;
    }
    
    try {
      console.log('Received chunks:', receivedChunksRef.current.length);
      
      let totalSize = 0;
      for (const chunk of receivedChunksRef.current) {
        totalSize += chunk.length;
      }
      console.log(`Total calculated size: ${totalSize}, Expected file size: ${fileMetadataRef.current.size}`);
      
      const receivedBlob = new Blob(receivedChunksRef.current, { type: fileMetadataRef.current.type });
      console.log('Created final blob, actual size:', receivedBlob.size, 'Expected:', fileMetadataRef.current.size);
      
      setReceivedBytes(receivedBlob.size);
      setTransferProgress(100);
      
      console.log('Current state before finalizing:', {
        transferProgress,
        receivedBytes,
        fileMetadataSize: fileMetadataRef.current.size
      });
      
      // If using MediaSource, we need to indicate we're done
      if (mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
        try {
          mediaSourceRef.current.endOfStream();
        } catch (e) {
          console.error('Error ending media stream:', e);
        }
      }
      
      const dataUrl = URL.createObjectURL(receivedBlob);
      setFileData(dataUrl);
      setIsStreaming(false);
      
      // Celebration animation
      gsap.to(containerRef.current, {
        keyframes: [
          { scale: 1.02, duration: 0.2 },
          { scale: 1, duration: 0.2 }
        ]
      });
      
      gsap.from(".download-button", {
        opacity: 0,
        y: 20,
        duration: 0.6,
        ease: "back.out(1.7)"
      });
      
      setTimeout(() => {
        console.log('Verifying progress after finalization');
        setTransferProgress(100);
      }, 100);
    } catch (error) {
      console.error('Error finalizing file transfer:', error);
    }
  };

  const downloadFile = () => {
    if (!fileData || !fileMetadata) return;

    const link = document.createElement('a');
    link.href = fileData;
    link.download = fileMetadata.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Download animation
    gsap.to(".download-button", {
      scale: 0.95,
      duration: 0.1,
      yoyo: true,
      repeat: 1
    });
  };

  const getFileIcon = () => {
    if (!fileMetadata) return File;

    const fileType = fileMetadata.type;
    for (const [type, Icon] of Object.entries(FILE_ICONS)) {
      if (fileType.startsWith(type)) return Icon;
    }
    return File;
  };

  const renderFilePreview = () => {
    if (!fileMetadata) return null;

    const FileIcon = getFileIcon();
    const fileType = fileMetadata.type;
    const previewUrl = fileData || streamingData;

    return (
      <div className="mt-8 space-y-4 animate-on-scroll" ref={previewRef}>
        <div className="flex items-center space-x-4 file-info">
          <FileIcon className="w-12 h-12 text-gray-700" />
          <div>
            <p className="text-xl font-light">{fileMetadata.name}</p>
            <p className="text-gray-500">
              {(fileMetadata.size / 1024 / 1024).toFixed(2)} MB
              {receivedBytes > 0 && ` • ${(receivedBytes / 1024 / 1024).toFixed(2)} MB received`}
            </p>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2" ref={progressRef}>
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 progress-bar" 
            style={{ width: `${transferProgress}%` }}
          ></div>
          <p className="text-center text-sm text-gray-600 mt-1 progress-text">
            {transferProgress}% {isStreaming && transferProgress < 100 ? "(Streaming)" : ""}
          </p>
        </div>

        {/* Collapsible debug section */}
        <div className="bg-gray-100 p-4 my-2 rounded text-xs font-mono">
          <p>Debug Info:</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <ul>
                <li>Chunks Received: {debugInfo.chunkCount}</li>
                <li>Last Chunk Size: {debugInfo.lastChunkSize} bytes</li>
                <li>Total Calculated: {debugInfo.totalCalculatedSize} bytes</li>
              </ul>
            </div>
            <div>
              <ul>
                <li>Progress: {debugInfo.progressCalculation}</li>
                <li>Current Progress: {transferProgress}%</li>
                <li>Expected Size: {fileMetadata.size} bytes</li>
              </ul>
            </div>
          </div>
        </div>

        {previewUrl && renderContentByType(fileType, previewUrl)}

        {fileData && (
          <button 
            onClick={downloadFile} 
            className="download-button w-full bg-black text-white py-4 rounded-xl flex items-center justify-center space-x-2 transition-all hover:bg-gray-800"
          >
            <Download className="w-6 h-6" />
            <span>Download File</span>
          </button>
        )}
      </div>
    );
  };

  const renderContentByType = (fileType, url) => {
    if (!url) return null;
    
    // Special handling for video files to enable better streaming
    if (fileType.startsWith('video/') || fileType === 'video/x-matroska') {
      return (
        <div className="w-full aspect-video bg-black rounded-lg overflow-hidden shadow-lg">
          <video 
            ref={mediaElementRef}
            controls 
            autoPlay
            playsInline
            src={url} 
            className="w-full h-full"
            onLoadedData={() => {
              console.log('Video data loaded');
              // Attempt to play early for better streaming experience
              mediaElementRef.current.play().catch(e => console.warn('Auto-play prevented:', e));
            }}
            onError={(e) => console.error('Video load error:', e)}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }
    
    // Image types
    if (fileType.startsWith('image/')) {
      return (
        <div className="flex justify-center">
          <img 
            ref={mediaElementRef} 
            src={url} 
            alt={fileMetadata?.name || 'Image preview'} 
            className="max-w-full h-auto rounded-lg shadow-md max-h-[70vh] object-contain" 
            onLoad={() => {
              console.log('Image loaded successfully');
              // Animation when image loads
              gsap.from(mediaElementRef.current, {
                opacity: 0,
                scale: 0.9,
                duration: 0.5,
                ease: "power2.out"
              });
            }}
            onError={(e) => console.error('Image load error:', e)}
          />
        </div>
      );
    }
    
    // Audio types
    if (fileType.startsWith('audio/')) {
      return (
        <div className="w-full p-4 bg-gray-100 rounded-lg shadow-md">
          <div className="flex items-center gap-4">
            <audio 
              ref={mediaElementRef}
              controls 
              autoPlay
              src={url} 
              className="flex-1"
              onLoadedData={() => console.log('Audio data loaded')}
              onError={(e) => console.error('Audio load error:', e)}
            />
            <div className="text-sm text-gray-600">
              {fileMetadata?.name || 'Audio file'}
            </div>
          </div>
        </div>
      );
    }
    
    // PDF files
    if (fileType === 'application/pdf') {
      return (
        <div className="w-full h-96 border rounded-lg overflow-hidden shadow-md">
          <object 
            data={url} 
            type="application/pdf"
            width="100%"
            height="100%"
            className="w-full h-full"
          >
            <div className="p-4 text-center">
              <p>Your browser doesn't support embedded PDFs.</p>
              <button 
                onClick={downloadFile}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Download PDF
              </button>
            </div>
          </object>
        </div>
      );
    }
    
    // Text and code files
    if (fileType.startsWith('text/') || 
        fileType === 'application/json') {
      return (
        <div className="w-full max-h-96 border rounded-lg overflow-auto bg-gray-50 shadow-md">
          <iframe 
            src={url} 
            title={fileMetadata?.name || 'Text preview'} 
            className="w-full h-96 border-0"
          />
        </div>
      );
    }
    
    // Office documents
    if (fileType.includes('office') || 
        fileType.startsWith('application/vnd.openxmlformats') || 
        fileType === 'application/msword') {
      return (
        <div className="p-6 border rounded-lg bg-gray-50 text-center shadow-md">
          <p className="text-lg">{fileMetadata?.name || 'Office Document'}</p>
          <p className="text-sm text-gray-500 mt-2">
            {(fileMetadata?.size / 1024 / 1024).toFixed(2)} MB
          </p>
          <button 
            onClick={downloadFile}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Download Document
          </button>
        </div>
      );
    }
    
    // Binary files or unknown types
    return (
      <div className="p-6 border rounded-lg bg-gray-50 text-center shadow-md">
        <div className="flex flex-col items-center">
          <File className="w-12 h-12 text-gray-400 mb-2" />
          <p className="font-medium">{fileMetadata?.name || 'File received'}</p>
          <p className="text-sm text-gray-500 mt-1">
            {(fileMetadata?.size / 1024 / 1024).toFixed(2)} MB
          </p>
          <button 
            onClick={downloadFile}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Download File
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-6 py-16 relative" ref={containerRef}>
      {/* HOSTY branding with more padding and black color */}
      <div className="absolute top-8 left-8 font-bold text-black text-xl z-10">
        HOSTY
      </div>
      
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow-xl rounded-xl p-8 backdrop-blur-sm">
          <div className="text-center mb-8" ref={headerRef}>
            <h2 className="text-4xl font-extralight tracking-tight">
              {connectionStatus === 'disconnected' 
                ? 'Waiting for Connection...' 
                : 'File Transfer'}
            </h2>
            <p className="text-gray-500 mt-2">
              {connectionStatus === 'connected' && !fileMetadata 
                ? 'Ready to receive files' 
                : connectionStatus === 'connected' && isStreaming && transferProgress < 100
                ? `Streaming file... (${transferProgress}%)`
                : ''}
            </p>
            
            {/* Connection status indicator */}
            <div className="mt-4 flex justify-center">
            <div className="connection-status inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mr-2">
  <div className={`h-2 w-2 rounded-full mr-2 ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
  <span>{connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}</span>
</div>
            </div>
          </div>

          {connectionStatus === 'connected' && !fileMetadata && (
            <div className="text-center py-10 animate-on-scroll">
              <div className="animate-pulse">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-200 flex items-center justify-center">
                  <Download className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-600">Waiting for sender to select a file...</p>
              </div>
            </div>
          )}

          {renderFilePreview()}
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Files are transferred directly between devices using WebRTC.</p>
          <p>No data is stored on any server.</p>
        </div>
      </div>
    </div>
  );
};

export default WebRTCReceiver;