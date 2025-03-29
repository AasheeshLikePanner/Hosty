import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { FileText, Image, Video, FileCode, Download, Check, File } from 'lucide-react';

const WebRTCReceiver = () => {
  const [fileMetadata, setFileMetadata] = useState(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [fileData, setFileData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingData, setStreamingData] = useState(null);
  const [receivedBytes, setReceivedBytes] = useState(0);
  // Add debug state to track issues
  const [debugInfo, setDebugInfo] = useState({
    chunkCount: 0,
    lastChunkSize: 0,
    totalCalculatedSize: 0,
    progressCalculation: "0%"
  });

  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const receivedChunksRef = useRef([]);
  const mediaElementRef = useRef(null);
  const totalBytesRef = useRef(0);
  const fileMetadataRef = useRef(null);


  const SIGNALING_SERVER = 'http://localhost:3000'; // Update with your signaling server URL

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

  // Important: Add this effect to manually recalculate progress whenever receivedBytes changes
  useEffect(() => {
    if (fileMetadata && fileMetadata.size > 0 && receivedBytes > 0) {
      const calculatedProgress = Math.min(100, Math.round((receivedBytes / fileMetadata.size) * 100));
      console.log(`Effect triggered: Recalculating progress - ${calculatedProgress}%`);
      setTransferProgress(calculatedProgress);
      fileMetadataRef.current = fileMetadata;
      // Update debug info
      setDebugInfo(prev => ({
        ...prev,
        totalCalculatedSize: receivedBytes,
        progressCalculation: `${receivedBytes} / ${fileMetadata.size} = ${calculatedProgress}%`
      }));
    }
  }, [receivedBytes, fileMetadata]);

  useEffect(() => {
    // Initialize connection
    setupWebRTCConnection();

    // Cleanup on unmount
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
    };
  }, []);

  // Clean up URLs when component unmounts or when new files are loaded
  useEffect(() => {
    return () => {
      if (streamingData) {
        URL.revokeObjectURL(streamingData);
      }
    };
  }, [streamingData]);

  const setupWebRTCConnection = () => {
    // Create socket connection
    const socket = io(SIGNALING_SERVER);
    socketRef.current = socket;

    // Get session ID from URL
    const sessionId = window.location.pathname.split('/').pop() || '';

    // WebRTC configuration
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    // Create peer connection
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnectionRef.current = peerConnection;

    // Create the data channel with the same parameters as the sender
    const dataChannel = peerConnection.createDataChannel('fileTransfer', {
      negotiated: true,
      id: 0
    });
    
    dataChannelRef.current = dataChannel;

    dataChannel.onopen = () => {
      console.log('Data channel opened on receiver');
      setConnectionStatus('connected');
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

    // Join session
    socket.emit('join-session', sessionId);

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('New ICE candidate:', event.candidate);
        
        socket.emit('candidate', { 
          candidate: event.candidate, 
          sessionId 
        });
      }
    };

    // Handle connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState);
    };

    // Handle signaling events
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
    
    // Reset debug info
    setDebugInfo({
      chunkCount: 0,
      lastChunkSize: 0,
      totalCalculatedSize: 0,
      progressCalculation: "0%"
    });
    
    // For streamable content, prepare for streaming
    if (isStreamableType(metadata.type)) {
      setIsStreaming(true);
    } else {
      setIsStreaming(false);
    }
  };

  const isStreamableType = (fileType) => {
    return fileType.startsWith('image/') || 
           fileType.startsWith('video/') || 
           fileType.startsWith('audio/');
  };

  const handleFileChunk = (chunkData) => {
    // Ensure chunkData is an array
    if (!Array.isArray(chunkData)) {
      console.error('Expected chunk data to be an array, received:', typeof chunkData);
      return;
    }

    const chunk = new Uint8Array(chunkData);
    receivedChunksRef.current.push(chunk);

    // Update debug info
    const newChunkCount = debugInfo.chunkCount + 1;
    
    // Update debug state
    setDebugInfo(prev => ({
      ...prev,
      chunkCount: receivedChunksRef.current.length, // Use actual count
      lastChunkSize: chunk.length
    }));

    // Calculate total received bytes
    let totalReceivedBytes = 0;
    for (const chunk of receivedChunksRef.current) {
      totalReceivedBytes += chunk.length;
    }
    
    console.log(`Chunk #${newChunkCount} received, size: ${chunk.length}, total received: ${totalReceivedBytes} bytes`);
    
    // Update received bytes state - using the direct calculated value
    setReceivedBytes(totalReceivedBytes);
    
    // Calculate and log progress
    if (fileMetadata && fileMetadata.size > 0) {
      const progress = Math.min(100, Math.round((totalReceivedBytes / fileMetadata.size) * 100));
      console.log(`Calculated progress: ${progress}%, Received: ${totalReceivedBytes}/${fileMetadata.size} bytes`);
      
      // Set progress directly here
      setTransferProgress(progress);
    }

    // If streaming and we have enough data to show a preview
    if (isStreaming && fileMetadata && totalReceivedBytes > 0) {
      // For images, wait until we have at least 10% or 50KB of data to show preview
      const minBytesForPreview = Math.min(fileMetadata.size * 0.1, 50000);
      if (totalReceivedBytes >= minBytesForPreview) {
        updateStreamPreview();
      }
    }
  };

  const updateStreamPreview = () => {
    console.log('Updating stream preview');
    
    try {
      // Create a blob from the chunks we have so far
      const blob = new Blob(receivedChunksRef.current, { type: fileMetadata.type });
      
      // Revoke previous URL if it exists
      if (streamingData) {
        URL.revokeObjectURL(streamingData);
      }
      
      const url = URL.createObjectURL(blob);
      setStreamingData(url);
      console.log('Stream preview updated, blob size:', blob.size, 'Current progress:', transferProgress);
    } catch (error) {
      console.error('Error updating stream preview:', error);
    }
  };

  const finalizeFileTransfer = () => {
    console.log('Finalizing file transfer');
    if (!fileMetadataRef.current) {
      console.error('No file metadata available for finalization'); 
      return;}
    const totalSize = receivedChunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
    console.log('Total size calculated:', totalSize);
    try {
      console.log('Received chunks:', receivedChunksRef.current.length);
      
      // Calculate total size again to verify
      let totalSize = 0;
      for (const chunk of receivedChunksRef.current) {
        totalSize += chunk.length;
      }
      console.log(`Total calculated size: ${totalSize}, Expected file size: ${fileMetadataRef.size}`);
      
      const receivedBlob = new Blob(receivedChunksRef.current, { type: fileMetadataRef.type });
      console.log('Created final blob, actual size:', receivedBlob.size, 'Expected:', fileMetadataRef.size);
      
      // Force update received bytes with the correct blob size
      setReceivedBytes(receivedBlob.size);
      
      // Force 100% progress - important!
      setTransferProgress(100);
      
      // Log the current state for debugging
      console.log('Current state before finalizing:', {
        transferProgress,
        receivedBytes,
        fileMetadataSize: fileMetadataRef.size
      });
      
      // Create the URL for the final file
      const dataUrl = URL.createObjectURL(receivedBlob);
      
      // Set the file data - do this last
      setFileData(dataUrl);
      
      // End streaming mode
      setIsStreaming(false);
      
      // Verify and force 100% again
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
      <div className="mt-8 space-y-4">
        <div className="flex items-center space-x-4">
          <FileIcon className="w-12 h-12 text-gray-700" />
          <div>
            <p className="text-xl font-light">{fileMetadata.name}</p>
            <p className="text-gray-500">
              {(fileMetadata.size / 1024 / 1024).toFixed(2)} MB
              {receivedBytes > 0 && ` • ${(receivedBytes / 1024 / 1024).toFixed(2)} MB received`}
            </p>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
            style={{ width: `${transferProgress}%` }}
          ></div>
          <p className="text-center text-sm text-gray-600 mt-1">
            {transferProgress}% {isStreaming && transferProgress < 100 ? "(Streaming)" : ""}
          </p>
        </div>

        {/* Debug information section for troubleshooting */}
        <div className="bg-gray-100 p-4 my-2 rounded text-xs font-mono">
          <p>Debug Info:</p>
          <ul>
            <li>Chunks Received: {debugInfo.chunkCount}</li>
            <li>Last Chunk Size: {debugInfo.lastChunkSize} bytes</li>
            <li>Total Calculated Size: {debugInfo.totalCalculatedSize} bytes</li>
            <li>Progress Calculation: {debugInfo.progressCalculation}</li>
            <li>Current Progress State: {transferProgress}%</li>
            <li>Received Bytes State: {receivedBytes} bytes</li>
            <li>Expected Size: {fileMetadata.size} bytes</li>
          </ul>
        </div>

        {previewUrl && renderContentByType(fileType, previewUrl)}

        {fileData && (
          <button 
            onClick={downloadFile} 
            className="w-full bg-black text-white py-4 rounded-xl flex items-center justify-center space-x-2"
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
    
    // Image types
    if (fileType.startsWith('image/')) {
      return (
        <div className="flex justify-center">
          <img 
            ref={mediaElementRef} 
            src={url} 
            alt={fileMetadata?.name || 'Image preview'} 
            className="max-w-full h-auto rounded-lg shadow-md max-h-[70vh] object-contain" 
            onLoad={() => console.log('Image loaded successfully')}
            onError={(e) => console.error('Image load error:', e)}
          />
        </div>
      );
    }
    
    // Video types
    if (fileType.startsWith('video/')) {
      return (
        <div className="w-full aspect-video bg-black rounded-lg overflow-hidden">
          <video 
            ref={mediaElementRef}
            controls 
            autoPlay
            src={url} 
            className="w-full h-full"
            onLoadedData={() => console.log('Video data loaded')}
            onError={(e) => console.error('Video load error:', e)}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }
    
    // Audio types
    if (fileType.startsWith('audio/')) {
      return (
        <div className="w-full p-4 bg-gray-100 rounded-lg">
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
          <iframe 
            src={url} 
            title={fileMetadata?.name || 'PDF preview'} 
            className="w-full h-full"
          />
        </div>
      );
    }
    
    // Text and code files
    if (fileType.startsWith('text/') || 
        fileType === 'application/json') {
      return (
        <div className="w-full max-h-96 border rounded-lg overflow-auto bg-gray-50 shadow-md">
          <pre className="p-4 text-sm whitespace-pre-wrap">
            {fileData && (
              <iframe 
                src={url} 
                title={fileMetadata?.name || 'Text preview'} 
                className="w-full h-full"
              />
            )}
          </pre>
        </div>
      );
    }
    
    // Office documents (preview not available, show download prompt)
    if (fileType.includes('office') || 
        fileType.startsWith('application/vnd.openxmlformats') || 
        fileType === 'application/msword') {
      return (
        <div className="p-4 border rounded-lg bg-gray-50 text-center shadow-sm">
          <p className="text-lg">Office Document Received</p>
          <p className="text-sm text-gray-500 mt-2">
            {fileMetadata?.name || 'Document'} - {(fileMetadata?.size / 1024 / 1024).toFixed(2)} MB
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
      <div className="p-4 border rounded-lg bg-gray-50 text-center shadow-sm">
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
    <div className="container mx-auto px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow-lg rounded-xl p-8">
          <div className="text-center mb-8">
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
          </div>

          {connectionStatus === 'disconnected' && (
            <div className="text-center text-gray-500">
              Please wait while we establish a connection...
            </div>
          )}

          {fileMetadata && renderFilePreview()}

          {/* Force refresh button for debugging */}
          {fileMetadata && (
            <button 
              onClick={() => {
                console.log('Manual refresh triggered');
                // Recalculate total size
                let totalSize = 0;
                for (const chunk of receivedChunksRef.current) {
                  totalSize += chunk.length;
                }
                setReceivedBytes(totalSize);
                const progress = Math.min(100, Math.round((totalSize / fileMetadata.size) * 100));
                setTransferProgress(progress);
              }}
              className="mt-4 p-2 bg-gray-200 text-gray-800 text-sm rounded"
            >
              Force Progress Refresh
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebRTCReceiver;