// === server.js (Node.js + Express + Socket.IO backend) ===
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingUser = null;

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  if (waitingUser) {
    // Pair both users
    socket.partner = waitingUser;
    waitingUser.partner = socket;

    socket.emit('partner-found');
    waitingUser.emit('partner-found');

    waitingUser = null;
  } else {
    waitingUser = socket;
  }

  socket.on('signal', data => {
    if (socket.partner) {
      socket.partner.emit('signal', data);
    }
  });

  socket.on('disconnect', () => {
    if (waitingUser === socket) waitingUser = null;
    if (socket.partner) {
      socket.partner.emit('partner-disconnected');
      socket.partner.partner = null;
    }
  });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));


// === public/index.html ===
<!DOCTYPE html>
<html>
<head>
  <title>Video Chat</title>
  <style>
    video { width: 45%; margin: 10px; border: 1px solid #ccc; }
  </style>
</head>
<body>
  <h2>Basic WebRTC Video Chat</h2>
  <video id="localVideo" autoplay muted></video>
  <video id="remoteVideo" autoplay></video>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    let localStream, peerConnection;

    const config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        document.getElementById('localVideo').srcObject = stream;
        localStream = stream;

        socket.on('partner-found', () => {
          peerConnection = new RTCPeerConnection(config);

          localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
          });

          peerConnection.onicecandidate = event => {
            if (event.candidate) {
              socket.emit('signal', { candidate: event.candidate });
            }
          };

          peerConnection.ontrack = event => {
            document.getElementById('remoteVideo').srcObject = event.streams[0];
          };

          peerConnection.onnegotiationneeded = async () => {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('signal', { description: peerConnection.localDescription });
          };
        });

        socket.on('signal', async data => {
          if (data.description) {
            await peerConnection.setRemoteDescription(data.description);
            if (data.description.type === 'offer') {
              const answer = await peerConnection.createAnswer();
              await peerConnection.setLocalDescription(answer);
              socket.emit('signal', { description: peerConnection.localDescription });
            }
          } else if (data.candidate) {
            try {
              await peerConnection.addIceCandidate(data.candidate);
            } catch (err) {
              console.error('Error adding ice candidate', err);
            }
          }
        });

        socket.on('partner-disconnected', () => {
          alert('Partner disconnected');
          window.location.reload();
        });
      });
  </script>
</body>
</html>
