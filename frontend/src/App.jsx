import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import SenderPage from './components/SenderPage'
import BottomSection from './components/BottomSection'
import { useLocation } from "react-router";
import ReciverPage from './components/ReciverPage'
import AnimatedLogo from './components/AnimatedLogo'

function App() {
  const [count, setCount] = useState(0)
  const location = useLocation(); // Get current URL
  const [sessionId, setSessionId] = useState(null);
  const [isReceiver, setIsReceiver] = useState(false);

  useEffect(() => {
    const urlParts = location.pathname.split("/");
    const newSessionId = urlParts[urlParts.length - 1]; // Extract session ID
    console.log("Session ID:", newSessionId);
    if (newSessionId) {
      setSessionId(newSessionId);
    }
    // Check if the URL contains 'receiver'
    const isReceiverPage = location.pathname.includes("receiver");
    console.log("Is Receiver Page:", isReceiverPage);
    setIsReceiver(isReceiverPage);
    setSessionId(newSessionId);
  }, [location]); 

  useEffect(() => {
    const style = document.createElement('style')
    style.innerHTML = `
      /* Animated Gradient Scrollbar for WebKit browsers */
      ::-webkit-scrollbar {
        width: 14px;
        background: linear-gradient(45deg, #f8fafc 0%, #f1f5f9 100%);
      }

      ::-webkit-scrollbar-track {
        border-radius: 8px;
        box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.05);
        border: 2px solid rgba(255, 255, 255, 0.2);
        background: linear-gradient(
          145deg,
          rgba(255, 255, 255, 0.4) 0%,
          rgba(255, 255, 255, 0.1) 100%
        );
      }

      ::-webkit-scrollbar-thumb {
        background: linear-gradient(
          45deg,
          #7c3aed 0%,
          #6366f1 50%,
          #8b5cf6 100%
        );
        border-radius: 8px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        box-shadow: 
          0 2px 8px rgba(0, 0, 0, 0.1),
          inset 0 0 12px rgba(255, 255, 255, 0.2);
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      ::-webkit-scrollbar-thumb:hover {
        transform: scaleX(1.1);
        box-shadow: 
          0 4px 16px rgba(99, 102, 241, 0.2),
          inset 0 0 12px rgba(255, 255, 255, 0.3);
        background: linear-gradient(
          45deg,
          #8b5cf6 0%,
          #7c3aed 50%,
          #6366f1 100%
        );
      }

      ::-webkit-scrollbar-thumb::after {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        right: -50%;
        bottom: -50%;
        background: linear-gradient(
          transparent 0%,
          rgba(255, 255, 255, 0.1) 50%,
          transparent 100%
        );
        transform: rotate(45deg);
        animation: scrollbarGlow 3s infinite linear;
      }

      @keyframes scrollbarGlow {
        0% { transform: rotate(45deg) translateX(-100%); }
        100% { transform: rotate(45deg) translateX(100%); }
      }

      /* Firefox Support */
      @supports (scrollbar-color: auto) {
        * {
          scrollbar-color: #7c3aed #f1f5f9;
          scrollbar-width: thin;
        }
      }

      /* Enable smooth scrolling */
      html {
        scroll-behavior: smooth;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    }
  }, []);

  return (
    <>
      {/* <Host receiver={isReceiver}> */}
        <AnimatedLogo/>
        {!isReceiver ? <SenderPage/> : <ReciverPage/>}
        <BottomSection />
      {/* </Host> */}
    </>
  )
}

export default App;
