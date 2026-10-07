// voiceChat.js - Peer-to-peer WebRTC Voice Chat for 1v1 Battle Rooms
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class VoiceChatManager {
  constructor() {
    this.localStream = null;
    this.peerConnection = null;
    this.socket = null;
    this.roomCode = null;
    this.inVoice = false;
    this.isMuted = false;
    this.remoteAudioEl = null;
    this.onStatusChange = null;
    this.onRemoteStateChange = null;
    this.isSpeaking = false;
    this.audioContext = null;
    this.analyser = null;
    this.animFrame = null;
  }

  setup(socket, roomCode, callbacks = {}) {
    this.socket = socket;
    this.roomCode = roomCode;
    this.onStatusChange = callbacks.onStatusChange || null;
    this.onRemoteStateChange = callbacks.onRemoteStateChange || null;

    if (typeof document !== 'undefined' && !this.remoteAudioEl) {
      this.remoteAudioEl = document.createElement('audio');
      this.remoteAudioEl.autoplay = true;
      this.remoteAudioEl.style.display = 'none';
      document.body.appendChild(this.remoteAudioEl);
    }

    this.bindSocketEvents();
  }

  bindSocketEvents() {
    if (!this.socket) return;

    this.socket.off('voice:offer');
    this.socket.off('voice:answer');
    this.socket.off('voice:candidate');
    this.socket.off('voice:peer_joined');
    this.socket.off('voice:peer_left');
    this.socket.off('voice:peer_mute');

    this.socket.on('voice:peer_joined', async () => {
      if (this.inVoice && this.localStream) {
        // Initiator creates WebRTC offer
        await this.createOffer();
      }
    });

    this.socket.on('voice:offer', async ({ sdp }) => {
      if (!this.inVoice) return;
      await this.handleOffer(sdp);
    });

    this.socket.on('voice:answer', async ({ sdp }) => {
      if (!this.inVoice || !this.peerConnection) return;
      try {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error('Failed to set remote answer:', err);
      }
    });

    this.socket.on('voice:candidate', async ({ candidate }) => {
      if (!this.inVoice || !this.peerConnection) return;
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Failed to add ICE candidate:', err);
      }
    });

    this.socket.on('voice:peer_left', () => {
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }
      if (this.remoteAudioEl) {
        this.remoteAudioEl.srcObject = null;
      }
      this.onRemoteStateChange?.({ inVoice: false, muted: false });
    });

    this.socket.on('voice:peer_mute', ({ muted }) => {
      this.onRemoteStateChange?.({ inVoice: true, muted });
    });
  }

  async joinVoice() {
    if (this.inVoice) return { success: true };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.localStream = stream;
      this.inVoice = true;
      this.isMuted = false;

      this.startSpeakingDetection(stream);

      this.socket?.emit('voice:join', { roomCode: this.roomCode });
      this.onStatusChange?.({ inVoice: true, isMuted: false, error: null });

      // Signal ready to connect
      await this.createOffer();

      return { success: true };
    } catch (err) {
      console.warn('Microphone permission / access error:', err);
      const message =
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow mic access in your browser settings.'
          : err.name === 'NotFoundError'
          ? 'No microphone found on this device.'
          : 'Could not access microphone: ' + (err.message || 'unknown error');

      this.onStatusChange?.({ inVoice: false, isMuted: false, error: message });
      return { success: false, error: message };
    }
  }

  toggleMute() {
    if (!this.inVoice || !this.localStream) return;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMuted;
    });

    this.socket?.emit('voice:mute', { roomCode: this.roomCode, muted: this.isMuted });
    this.onStatusChange?.({ inVoice: true, isMuted: this.isMuted, error: null });
    return this.isMuted;
  }

  leaveVoice() {
    if (!this.inVoice) return;

    this.stopSpeakingDetection();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.remoteAudioEl) {
      this.remoteAudioEl.srcObject = null;
    }

    this.inVoice = false;
    this.isMuted = false;

    this.socket?.emit('voice:leave', { roomCode: this.roomCode });
    this.onStatusChange?.({ inVoice: false, isMuted: false, error: null });
  }

  createPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('voice:candidate', {
          roomCode: this.roomCode,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (this.remoteAudioEl && event.streams[0]) {
        this.remoteAudioEl.srcObject = event.streams[0];
        this.remoteAudioEl.play().catch(() => {});
        this.onRemoteStateChange?.({ inVoice: true, muted: false });
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  async createOffer() {
    try {
      const pc = this.createPeerConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.socket?.emit('voice:offer', {
        roomCode: this.roomCode,
        sdp: offer,
      });
    } catch (err) {
      console.error('Error creating voice offer:', err);
    }
  }

  async handleOffer(sdp) {
    try {
      const pc = this.createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket?.emit('voice:answer', {
        roomCode: this.roomCode,
        sdp: answer,
      });
    } catch (err) {
      console.error('Error handling voice offer:', err);
    }
  }

  startSpeakingDetection(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const checkAudio = () => {
        if (!this.inVoice) return;
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const nowSpeaking = avg > 18 && !this.isMuted;
        if (nowSpeaking !== this.isSpeaking) {
          this.isSpeaking = nowSpeaking;
          this.onStatusChange?.({ inVoice: true, isMuted: this.isMuted, isSpeaking: nowSpeaking, error: null });
        }
        this.animFrame = requestAnimationFrame(checkAudio);
      };
      this.animFrame = requestAnimationFrame(checkAudio);
    } catch {}
  }

  stopSpeakingDetection() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.isSpeaking = false;
  }

  destroy() {
    this.leaveVoice();
    if (this.remoteAudioEl && this.remoteAudioEl.parentNode) {
      this.remoteAudioEl.parentNode.removeChild(this.remoteAudioEl);
      this.remoteAudioEl = null;
    }
  }
}
