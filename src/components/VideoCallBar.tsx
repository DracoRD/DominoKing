import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Mic, MicOff, Minimize2, PhoneCall, PhoneOff, Video, VideoOff } from 'lucide-react';
import { I18nStrings } from '../lib/i18n';

interface RemotePeer {
  peerId: string;
  uid: string;
  name: string;
  stream: MediaStream | null;
}

interface VideoCallBarProps {
  ws: WebSocket | null;
  roomCode: string | null;
  myUid: string;
  labels: I18nStrings;
  hiddenUi?: boolean;
  onRtcSignalRef: React.MutableRefObject<((msg: Record<string, unknown>) => void) | null>;
  onVideoStreamsChange: (streams: Record<string, MediaStream>) => void;
  onCallStatusChange?: (status: { inCall: boolean; micOn: boolean; camOn: boolean }) => void;
  toggleCallActionRef?: React.MutableRefObject<(() => void) | null>;
}

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export const VideoCallBar: React.FC<VideoCallBarProps> = ({
  ws,
  roomCode,
  myUid,
  labels,
  hiddenUi = false,
  onRtcSignalRef,
  onVideoStreamsChange,
  onCallStatusChange,
  toggleCallActionRef,
}) => {
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [showFloatingVideos, setShowFloatingVideos] = useState(false);
  const [expandedCam, setExpandedCam] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const emitStreamMap = useCallback(
    (peersList: RemotePeer[]) => {
      const map: Record<string, MediaStream> = {};
      if (localStreamRef.current) {
        map[myUid || 'local'] = localStreamRef.current;
      }
      for (const p of peersList) {
        if (p.stream && p.uid) {
          map[p.uid] = p.stream;
        }
      }
      onVideoStreamsChange(map);
    },
    [myUid, onVideoStreamsChange]
  );

  useEffect(() => {
    onCallStatusChange?.({ inCall, micOn, camOn });
  }, [inCall, micOn, camOn, onCallStatusChange]);

  const cleanupCall = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setRemotePeers([]);
    setInCall(false);
    onVideoStreamsChange({});
    if (ws && ws.readyState === WebSocket.OPEN && roomCode) {
      ws.send(JSON.stringify({ type: 'rtc:leave-media' }));
    }
  }, [ws, roomCode, onVideoStreamsChange]);

  useEffect(() => {
    emitStreamMap(remotePeers);
  }, [remotePeers, myUid, emitStreamMap]);

  useEffect(() => {
    const createPeer = (
      targetPeerId: string,
      targetUid: string,
      name: string,
      initiator: boolean
    ) => {
      let pc = peersRef.current.get(targetPeerId);
      if (pc) return pc;

      pc = new RTCPeerConnection(ICE_CONFIG);
      peersRef.current.set(targetPeerId, pc);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc!.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'rtc:ice-candidate',
              targetPeerId,
              candidate: ev.candidate,
            })
          );
        }
      };

      pc.ontrack = (ev) => {
        const stream = ev.streams[0];
        setRemotePeers((prev) => {
          const exists = prev.some((p) => p.peerId === targetPeerId);
          if (exists) {
            return prev.map((p) =>
              p.peerId === targetPeerId ? { ...p, uid: targetUid || p.uid, stream } : p
            );
          }
          return [...prev, { peerId: targetPeerId, uid: targetUid, name, stream }];
        });
      };

      if (initiator) {
        pc.createOffer()
          .then((offer) => pc!.setLocalDescription(offer).then(() => offer))
          .then((offer) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'rtc:offer',
                  targetPeerId,
                  sdp: offer,
                })
              );
            }
          })
          .catch(() => {});
      }

      return pc;
    };

    onRtcSignalRef.current = async (msg) => {
      if (!inCall) return;
      const type = String(msg.type);
      const fromPeerId = String(msg.fromPeerId || msg.peerId || '');
      const fromUid = String(msg.fromUid || msg.uid || '');
      const fromName = String(msg.fromName || msg.displayName || 'Jugador');

      if (type === 'rtc:peer-joined' && fromPeerId) {
        createPeer(fromPeerId, fromUid, fromName, true);
      } else if (type === 'rtc:offer' && fromPeerId && msg.sdp) {
        const pc = createPeer(fromPeerId, fromUid, fromName, false);
        await pc.setRemoteDescription(
          new RTCSessionDescription(msg.sdp as RTCSessionDescriptionInit)
        );
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type: 'rtc:answer', targetPeerId: fromPeerId, sdp: answer })
          );
        }
      } else if (type === 'rtc:answer' && fromPeerId && msg.sdp) {
        const pc = peersRef.current.get(fromPeerId);
        if (pc) {
          await pc.setRemoteDescription(
            new RTCSessionDescription(msg.sdp as RTCSessionDescriptionInit)
          );
        }
      } else if (type === 'rtc:ice-candidate' && fromPeerId && msg.candidate) {
        const pc = peersRef.current.get(fromPeerId);
        if (pc) {
          await pc.addIceCandidate(
            new RTCIceCandidate(msg.candidate as RTCIceCandidateInit)
          );
        }
      } else if (type === 'rtc:peer-left' && fromPeerId) {
        const pc = peersRef.current.get(fromPeerId);
        if (pc) pc.close();
        peersRef.current.delete(fromPeerId);
        setRemotePeers((prev) => prev.filter((p) => p.peerId !== fromPeerId));
      }
    };
  }, [inCall, ws, onRtcSignalRef]);

  useEffect(() => {
    if (!roomCode) {
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      setRemotePeers([]);
    } else if (inCall && ws && ws.readyState === WebSocket.OPEN && localStreamRef.current) {
      ws.send(
        JSON.stringify({
          type: 'rtc:join-media',
          micOn: localStreamRef.current.getAudioTracks().some((t) => t.enabled),
          camOn: localStreamRef.current.getVideoTracks().some((t) => t.enabled),
        })
      );
    }
  }, [roomCode, inCall, ws]);

  useEffect(() => {
    return () => {
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [inCall, camOn, showFloatingVideos]);

  const startCall = useCallback(async () => {
    setMediaError(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        setCamOn(true);
        setMicOn(true);
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          setCamOn(true);
          setMicOn(false);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setCamOn(false);
          setMicOn(true);
        }
      }
      localStreamRef.current = stream;
      setInCall(true);
      if (stream.getVideoTracks().length > 0) {
        setShowFloatingVideos(true);
      }
      emitStreamMap(remotePeers);
      if (ws && ws.readyState === WebSocket.OPEN && roomCode) {
        ws.send(
          JSON.stringify({
            type: 'rtc:join-media',
            micOn: stream.getAudioTracks().length > 0,
            camOn: stream.getVideoTracks().length > 0,
          })
        );
      }
    } catch {
      setMediaError('Permiso de cámara/micrófono requerido');
      setTimeout(() => setMediaError(null), 3200);
    }
  }, [emitStreamMap, remotePeers, roomCode, ws]);

  const toggleMic = useCallback(() => {
    const next = !micOn;
    setMicOn(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    if (ws && ws.readyState === WebSocket.OPEN && roomCode) {
      ws.send(JSON.stringify({ type: 'rtc:media-state', micOn: next, camOn }));
    }
  }, [micOn, camOn, ws, roomCode]);

  const toggleCam = useCallback(() => {
    const next = !camOn;
    setCamOn(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
    emitStreamMap(remotePeers);
    if (ws && ws.readyState === WebSocket.OPEN && roomCode) {
      ws.send(JSON.stringify({ type: 'rtc:media-state', micOn, camOn: next }));
    }
  }, [camOn, micOn, emitStreamMap, remotePeers, ws, roomCode]);

  useEffect(() => {
    if (toggleCallActionRef) {
      toggleCallActionRef.current = () => {
        if (!inCall) {
          startCall();
        } else {
          toggleMic();
        }
      };
    }
  }, [inCall, startCall, toggleMic, toggleCallActionRef]);

  if (hiddenUi) return null;

  return (
    <div className="relative flex flex-col items-end gap-1.5 pointer-events-auto">
      {!inCall ? (
        <button
          type="button"
          onClick={startCall}
          title={labels.voiceVideo}
          aria-label={labels.voiceVideo}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1D1711] hover:bg-[#2A2118] border border-white/12 text-xs font-semibold text-zinc-200 hover:text-[#EAA938] transition-colors min-h-[40px] whitespace-nowrap shadow-md"
        >
          <MicOff className="w-4 h-4 text-zinc-400" />
          <span className="hidden sm:inline">{labels.voiceVideo}</span>
        </button>
      ) : (
        <div className="flex items-center gap-1 bg-[#1D1711] border border-emerald-500/35 rounded-xl p-1 shadow-lg">
          <button
            type="button"
            onClick={toggleMic}
            aria-label={micOn ? labels.micOn : labels.micOff}
            className={`p-2 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center ${
              micOn
                ? 'bg-emerald-700/45 text-emerald-200 hover:bg-emerald-700/65'
                : 'bg-rose-900/65 text-rose-200 hover:bg-rose-800/80'
            }`}
          >
            {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={toggleCam}
            aria-label={camOn ? labels.camOn : labels.camOff}
            className={`p-2 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center ${
              camOn
                ? 'bg-emerald-700/45 text-emerald-200 hover:bg-emerald-700/65'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setShowFloatingVideos((v) => !v)}
            aria-label="Ver cámaras"
            title="Ver cámaras en ventana"
            className={`p-2 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center ${
              showFloatingVideos
                ? 'bg-[#EAA938] text-[#140E08]'
                : 'bg-[#282018] text-amber-200 hover:bg-[#352A20]'
            }`}
          >
            {showFloatingVideos ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={cleanupCall}
            aria-label="Colgar"
            className="p-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Optional expanded floating video strip (all live feeds also render directly inside seat avatars!) */}
      {inCall && showFloatingVideos && (
        <div className="absolute bottom-12 right-0 z-30 flex flex-col items-end gap-2 p-2 rounded-2xl bg-[#16110D]/95 border border-white/15 shadow-2xl">
          <div className="flex items-center justify-between w-full gap-3 px-1">
            <span className="text-[11px] font-bold text-amber-200">
              <PhoneCall className="w-3 h-3 inline mr-1" />
              Cámaras en Vivo ({remotePeers.length + 1})
            </span>
            <button
              type="button"
              onClick={() => setExpandedCam((v) => !v)}
              className="text-[10px] text-zinc-400 hover:text-white underline"
            >
              {expandedCam ? 'Compacto' : 'Grande'}
            </button>
          </div>
          <div className="flex flex-wrap justify-end gap-2.5 max-w-[380px] sm:max-w-[580px]">
            <div
              className={`relative rounded-xl overflow-hidden bg-[#1D1711] border-2 border-[#EAA938]/65 shadow-xl transition-all ${
                expandedCam ? 'w-44 h-32 sm:w-64 sm:h-48' : 'w-32 h-24 sm:w-44 sm:h-32'
              }`}
            >
              {camOn ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-amber-200/80 font-medium">
                  Tú
                </div>
              )}
              <span className="absolute bottom-1.5 left-2 text-[11px] font-semibold text-white bg-black/70 px-2 py-0.5 rounded">
                Tú
              </span>
            </div>

            {remotePeers.map((peer) => (
              <RemotePeerTile key={peer.peerId} peer={peer} expanded={expandedCam} />
            ))}
          </div>
        </div>
      )}

      {mediaError && (
        <span className="absolute bottom-12 right-0 text-[11px] text-rose-200 bg-[#231414] border border-rose-500/40 px-2.5 py-1 rounded-lg whitespace-nowrap shadow-xl">
          {mediaError}
        </span>
      )}
    </div>
  );
};

const RemotePeerTile: React.FC<{ peer: RemotePeer; expanded: boolean }> = ({
  peer,
  expanded,
}) => {
  const vidRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (vidRef.current && peer.stream) {
      vidRef.current.srcObject = peer.stream;
    }
  }, [peer.stream]);

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-[#1D1711] border-2 border-emerald-500/55 shadow-xl transition-all ${
        expanded ? 'w-44 h-32 sm:w-64 sm:h-48' : 'w-32 h-24 sm:w-44 sm:h-32'
      }`}
    >
      {peer.stream ? (
        <video
          ref={vidRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-emerald-200">
          {peer.name.slice(0, 8)}
        </div>
      )}
      <span className="absolute bottom-1 left-1.5 text-[10px] font-semibold text-white bg-black/65 px-1.5 py-0.5 rounded truncate max-w-[100px]">
        {peer.name}
      </span>
    </div>
  );
};
