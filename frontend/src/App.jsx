import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Host from './components/Host'
import SenderPage from './components/SenderPage'
import BottomSection from './components/BottomSection'
import { useLocation } from "react-router";
import ReciverPage from './components/ReciverPage'

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
    if (isReceiverPage) {
      setIsReceiver(true);
    } else {
      setIsReceiver(false);
    }
    setSessionId(newSessionId);
  }, [location]); 

  return (
    <>
      {/* <Host receiver={isReceiver}> */}
        {!isReceiver ? <SenderPage/> : <ReciverPage/>}
        <BottomSection />
      {/* </Host> */}
    </>
  )
}

export default App
