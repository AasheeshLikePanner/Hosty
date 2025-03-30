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
  const [debugMode, setDebugMode] = useState(false);
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
  const playTriedRef = useRef(false);
  const mediaBufferingRef = useRef(false);

  const SIGNALING_SERVER = 'https://hosty-backend.vercel.app';

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
        // Common video codecs with broader support
        const mimeCodecs = {
          'video/mp4': 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
          'video/webm': 'video/webm; codecs="vp8, vorbis"',
          'video/x-matroska': 'video/webm; codecs="vp8, vorbis"', // For MKV files, try webm codec
          'audio/mp3': 'audio/mpeg',
          'audio/mpeg': 'audio/mpeg',
          'audio/ogg': 'audio/ogg; codecs="vorbis"',
          'audio/wav': 'audio/wav'
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
            
            // Add more listeners for better error handling
            sourceBufferRef.current.addEventListener('updateend', () => {
              mediaBufferingRef.current = false;
              processMediaQueue();
              
              // Try to play the video as soon as we have some data in the buffer
              if (mediaElementRef.current && !playTriedRef.current && receivedChunksRef.current.length >= 2) {
                console.log('Attempting to play media after buffer update');
                mediaElementRef.current.play()
                  .then(() => {
                    playTriedRef.current = true;
                    console.log('Media playback started successfully');
                  })
                  .catch(e => {
                    console.warn('Auto-play prevented, will retry later:', e);
                    // Will try again on next updateend
                  });
              }
            });
            
            sourceBufferRef.current.addEventListener('error', (e) => {
              console.error('SourceBuffer error:', e);
              mediaBufferingRef.current = false;
            });
            
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
        !sourceBufferRef.current.updating && 
        !mediaBufferingRef.current) {
      
      mediaBufferingRef.current = true;
      const chunk = mediaQueueRef.current.shift();
      
      try {
        sourceBufferRef.current.appendBuffer(chunk);
      } catch (e) {
        console.error('Error appending buffer:', e);
        mediaBufferingRef.current = false;
        
        // Try to recover by clearing the buffer and starting fresh
        if (e.name === 'QuotaExceededError') {
          try {
            // If we get a quota error, try to remove some of the old data
            const currentTime = mediaElementRef.current ? mediaElementRef.current.currentTime : 0;
            if (currentTime > 10 && sourceBufferRef.current.buffered.length > 0) {
              const start = sourceBufferRef.current.buffered.start(0);
              const removeEnd = Math.max(start, currentTime - 10); // Keep 10 seconds before current time
              sourceBufferRef.current.remove(start, removeEnd);
            }
          } catch (removeError) {
            console.error('Error recovering from quota exceeded:', removeError);
          }
        }
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
      id: 0,
      ordered: true  // Ensure ordered delivery for better media streaming
    });
    
    dataChannelRef.current = dataChannel;

    dataChannel.onopen = () => {
      console.log('Data channel opened on receiver');
      setConnectionStatus('connected');
      
      // Animate connection status change
      gsap.to('.connection-status', {
        backgroundColor: '#000000',
        scale: 1.05,
        duration: 0.3,
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
      
      // Add visual feedback for connection state changes
      if (peerConnection.iceConnectionState === 'connected' || 
          peerConnection.iceConnectionState === 'completed') {
        gsap.to('.connection-indicator', {
          backgroundColor: '#000000',
          duration: 0.3
        });
      } else if (peerConnection.iceConnectionState === 'failed' || 
                peerConnection.iceConnectionState === 'disconnected') {
        gsap.to('.connection-indicator', {
          backgroundColor: '#888888',
          duration: 0.3
        });
        
        // Reset if disconnected
        if (peerConnection.iceConnectionState === 'disconnected') {
          setConnectionStatus('disconnected');
        }
      }
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
    playTriedRef.current = false;
    
    setDebugInfo({
      chunkCount: 0,
      lastChunkSize: 0,
      totalCalculatedSize: 0,
      progressCalculation: "0%"
    });
    
    // Reset previous media elements
    if (streamingData) {
      URL.revokeObjectURL(streamingData);
      setStreamingData(null);
    }
    
    if (mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
      try {
        mediaSourceRef.current.endOfStream();
      } catch (e) {
        console.error('Error ending previous media stream:', e);
      }
    }
    
    // Special handling for video streaming
    if (metadata.type.startsWith('video/') || metadata.type === 'video/x-matroska' || metadata.type.startsWith('audio/')) {
      setIsStreaming(true);
      mediaQueueRef.current = []; // Clear the queue
      
      // Set up MediaSource for video/audio streaming
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
      x: -10,
      stagger: 0.1,
      delay: 0.2,
      duration: 0.5,
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

    // Handle MediaSource streaming for video/audio files
    if (isStreaming && fileMetadata) {
      if ((fileMetadata.type.startsWith('video/') || 
          fileMetadata.type === 'video/x-matroska' || 
          fileMetadata.type.startsWith('audio/')) && 
          sourceBufferRef.current) {
        try {
          // Queue this chunk for MediaSource processing
          mediaQueueRef.current.push(chunk.buffer);
          
          // Process the queue if sourceBuffer is not currently updating
          if (!sourceBufferRef.current.updating && !mediaBufferingRef.current) {
            processMediaQueue();
          }
          
          // Only update streaming preview if we have enough chunks or for regular updates
          if (receivedChunksRef.current.length % 5 === 0 || receivedChunksRef.current.length < 5) {
            updateStreamPreview();
          }
          
          return; // Skip regular streaming updates for media when using MSE
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
          // Update every 250KB or on first chunk
          if (totalReceivedBytes % 250000 < chunk.length || totalReceivedBytes === chunk.length) {
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
      
      // Subtle pulse animation on preview update
      if (previewRef.current) {
        gsap.to(previewRef.current, {
          boxShadow: "0 0 10px rgba(0, 0, 0, 0.2)",
          duration: 0.2,
          yoyo: true,
          repeat: 1
        });
      }
      
      // For non-MSE media, try to play if not already playing
      if ((fileMetadata.type.startsWith('video/') || fileMetadata.type.startsWith('audio/')) && 
          mediaElementRef.current && !playTriedRef.current) {
        mediaElementRef.current.play()
          .then(() => {
            playTriedRef.current = true;
            console.log('Media playback started successfully');
          })
          .catch(e => console.warn('Auto-play prevented:', e));
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
          // Process any remaining chunks in the queue first
          while (mediaQueueRef.current.length > 0 && !sourceBufferRef.current.updating) {
            const finalChunk = mediaQueueRef.current.shift();
            sourceBufferRef.current.appendBuffer(finalChunk);
          }
          
          // Set a timeout to ensure all buffers are processed before ending the stream
          setTimeout(() => {
            if (mediaSourceRef.current.readyState === 'open') {
              mediaSourceRef.current.endOfStream();
              console.log('Media stream successfully ended');
            }
          }, 200);
        } catch (e) {
          console.error('Error ending media stream:', e);
        }
      }
      
      const dataUrl = URL.createObjectURL(receivedBlob);
      setFileData(dataUrl);
      
      // We keep streaming flag true for video/audio to allow playback
      if (!fileMetadataRef.current.type.startsWith('video/') && 
          !fileMetadataRef.current.type.startsWith('audio/')) {
        setIsStreaming(false);
      }
      
      // Subtle completion animation
      gsap.to(containerRef.current, {
        keyframes: [
          { scale: 1.01, duration: 0.2 },
          { scale: 1, duration: 0.2 }
        ]
      });
      
      gsap.from(".download-button", {
        opacity: 0,
        y: 10,
        duration: 0.5,
        ease: "power2.out"
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
      scale: 0.97,
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

  const toggleDebugMode = () => {
    setDebugMode(!debugMode);
  };

  const renderFilePreview = () => {
    if (!fileMetadata) return null;

    const FileIcon = getFileIcon();
    const fileType = fileMetadata.type;
    const previewUrl = fileData || streamingData;

    return (
      <div className="mt-6 space-y-4 animate-on-scroll" ref={previewRef}>
        <div className="flex items-center space-x-3 file-info">
          <FileIcon className="w-8 h-8 text-black" />
          <div>
            <p className="text-base font-light truncate">{fileMetadata.name}</p>
            <p className="text-gray-500 text-sm">
              {(fileMetadata.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>

        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2" ref={progressRef}>
          <div 
            className="bg-black h-1.5 rounded-full transition-all duration-300 progress-bar" 
            style={{ width: `${transferProgress}%` }}
          ></div>
          <p className="text-center text-xs text-gray-500 mt-1 progress-text">
            {transferProgress}% {isStreaming && transferProgress < 100 ? "(Streaming)" : ""}
          </p>
        </div>

        {/* Debug toggle button */}
        <div className="flex justify-end">
          <button 
            onClick={toggleDebugMode} 
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            {debugMode ? "Hide Debug Info" : "Show Debug Info"}
          </button>
        </div>

        {/* Collapsible debug section */}
        {debugMode && (
          <div className="bg-gray-50 p-3 my-1 rounded text-xs font-mono border border-gray-100">
            <p className="font-semibold mb-1">Debug Info:</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <ul>
                  <li>Chunks: {debugInfo.chunkCount}</li>
                  <li>Last Chunk: {debugInfo.lastChunkSize} bytes</li>
                  <li>Total: {debugInfo.totalCalculatedSize} bytes</li>
                </ul>
              </div>
              <div>
                <ul>
                  <li>Progress: {debugInfo.progressCalculation}</li>
                  <li>Current: {transferProgress}%</li>
                  <li>Expected: {fileMetadata.size} bytes</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {previewUrl && renderContentByType(fileType, previewUrl)}

        {fileData && (
          <button 
            onClick={downloadFile} 
            className="download-button w-full bg-black text-white py-3 rounded-md flex items-center justify-center space-x-2 transition-all hover:bg-gray-800"
          >
            <Download className="w-5 h-5" />
            <span className="font-light">Download</span>
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
        <div className="w-full aspect-video bg-black rounded-md overflow-hidden shadow-sm">
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
            onCanPlay={() => {
              console.log('Video can play now');
              if (!playTriedRef.current) {
                mediaElementRef.current.play()
                  .then(() => {
                    playTriedRef.current = true;
                    console.log('Video playback started on canplay event');
                  })
                  .catch(e => console.warn('Auto-play prevented on canplay:', e));
              }
            }}
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
          <img src={url}
          alt={fileMetadata.name}
          className="max-h-96 rounded-md shadow-sm"
          onLoad={() => console.log('Image loaded successfully')}
          onError={() => console.error('Error loading image')}
        />
        </div>
      );
    }
    
    // Audio files
    if (fileType.startsWith('audio/')) {
      return (
        <div className="w-full bg-gray-50 p-4 rounded-md">
          <audio 
            ref={mediaElementRef}
            controls 
            className="w-full" 
            src={url}
            autoPlay
            onCanPlay={() => {
              console.log('Audio can play now');
              mediaElementRef.current.play()
                .catch(e => console.warn('Audio autoplay prevented:', e));
            }}
          >
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    }
    
    // PDF files
    if (fileType === 'application/pdf') {
      return (
        <div className="w-full aspect-[4/3] bg-gray-50 rounded-md overflow-hidden shadow-sm">
          <iframe 
            src={url} 
            className="w-full h-full" 
            title={fileMetadata ? fileMetadata.name : 'PDF Preview'}
          ></iframe>
        </div>
      );
    }
    
    // Text files and code
    if (fileType.startsWith('text/') || fileType === 'application/json') {
      return (
        <div className="w-full h-48 overflow-auto bg-gray-50 p-4 rounded-md font-mono text-sm">
          <p>Text preview loading...</p>
          {/* Text content would need to be read and displayed using fetch or FileReader */}
        </div>
      );
    }
    
    // Default - just show an icon 
    return (
      <div className="w-full p-10 flex justify-center items-center">
        <div className="text-center">
          <FileIcon className="mx-auto w-16 h-16 text-gray-400" />
          <p className="mt-2 text-gray-500">Preview not available</p>
        </div>
      </div>
    );
  };

  return (
    <div 
      ref={containerRef} 
      className="container mx-auto max-w-xl p-4 md:p-6 bg-white rounded-lg shadow-sm"
    >
      <div ref={headerRef}>
        <h1 className="text-2xl font-light mb-4">File Receiver</h1>
        <div className="flex items-center space-x-2">
          <div 
            className={`w-3 h-3 rounded-full connection-indicator ${
              connectionStatus === 'connected' ? 'bg-black' : 'bg-gray-300'
            }`}
          ></div>
          <p className="text-sm text-gray-500 connection-status">
            {connectionStatus === 'connected' ? 'Connected' : 'Waiting for connection...'}
          </p>
        </div>
      </div>
      
      {renderFilePreview()}
      
      {!fileMetadata && (
        <div className="my-10 text-center text-gray-500 animate-on-scroll">
          <p>Waiting for file transfer to begin...</p>
        </div>
      )}
    </div>
  );
};

export default WebRTCReceiver;