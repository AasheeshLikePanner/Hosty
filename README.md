# 📡 Hosty - Real-Time File Transfer (WebRTC)

[Hosty](https://hosty-one.vercel.app/) is a simple and efficient **real-time file transfer** system that allows users to send and receive files directly **peer-to-peer** using **WebRTC DataChannel**. Unlike traditional file-sharing methods, Hosty does not rely on a central server to store or relay data. Instead, files are transferred directly between users, ensuring **fast and secure** transfers. The **speed of transfer depends on your internet connection**, making it an efficient solution for sharing files without uploading or downloading to a server. WebSockets (via Socket.io) handle the initial connection setup, but once the peers are connected, the transfer happens purely via WebRTC.

## ✨ Features

✅ **Real-time peer-to-peer file transfer** (No server required for file relay)  
✅ **No need to upload and download** (Files are not stored on a server, just hosted temporarily for transfer)  
✅ **Progress tracking** while receiving files  
✅ **Supports large files** by sending data in chunks  
✅ **Works over the internet** if WebRTC signaling is established  
✅ **Platform-independent** (Works across different devices and operating systems)

## 🛠️ Future Improvements

- [ ] Add drag & drop support  
- [ ] Show estimated time remaining  
- [X] Improve UI for a smoother experience  

---

Made with ❤️ by **Aasheesh**

