import React, { useState, useEffect, useRef } from "react";
import { Room, RoomEvent, createLocalAudioTrack } from "livekit-client";

// const BACKEND_URL = "http://localhost:8000";
//const BACKEND_URL = "http://192.168.1.5:8000";

const BACKEND_URL = `http://${window.location.hostname}:8000`;
export default function PTTIntercom() {
  const [rooms, setRooms] = useState([]);           // rooms from backend
  const [selectedRoom, setSelectedRoom] = useState(null); // room technician clicked
  const [status, setStatus] = useState("disconnected");
  const [isTalking, setIsTalking] = useState(false);
  const [error, setError] = useState(null);

  const roomRef = useRef(null);
  const audioTrackRef = useRef(null);
  const isConnectingRef = useRef(false);

  // ── On mount: fetch available rooms ──────────────────────────────
  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms`);
      const data = await res.json();
      setRooms(data.rooms);
    } catch (err) {
      console.error("Failed to fetch rooms:", err);
    }
  };

  // ── When technician clicks a room ─────────────────────────────────
  const handleRoomSelect = async (room) => {
    // If already connected to a room, disconnect first
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
      audioTrackRef.current = null;
      setStatus("disconnected");
      setIsTalking(false);
    }

    setSelectedRoom(room);
    setError(null);
    await connectToRoom(room.name);  // connect to the clicked room
  };

  // ── Connect to LiveKit room ───────────────────────────────────────
  const connectToRoom = async (roomName) => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    setStatus("connecting");

    try {
      // 1. Get token for this specific room
      const res = await fetch(`${BACKEND_URL}/api/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_name: roomName,
          participant_name: "technician-1",
          is_technician: true,
        }),
      });

      if (!res.ok) throw new Error("Token request failed");
      const { token, livekit_url } = await res.json();

      // 2. Create LiveKit Room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      roomRef.current = room;

      // 3. Events
      room.on(RoomEvent.Connected, () => {
        setStatus("connected");
        setError(null);
      });

      room.on(RoomEvent.Disconnected, () => {
        setStatus("disconnected");
        setIsTalking(false);
        isConnectingRef.current = false;
      });

      // 4. Connect
      await room.connect(livekit_url, token, { autoSubscribe: true });

      // 5. Publish muted audio track
      const audioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      audioTrackRef.current = audioTrack;
      await room.localParticipant.publishTrack(audioTrack);
      await audioTrack.mute();

    } catch (err) {
      setError("Connection failed: " + err.message);
      setStatus("disconnected");
      isConnectingRef.current = false;
    }
  };

  // ── PTT ───────────────────────────────────────────────────────────
  const startTalking = async () => {
    if (!audioTrackRef.current || status !== "connected") return;
    await audioTrackRef.current.unmute();
    setIsTalking(true);
  };

  const stopTalking = async () => {
    if (!audioTrackRef.current) return;
    await audioTrackRef.current.mute();
    setIsTalking(false);
  };

  const handlePress = (e) => { e.preventDefault(); startTalking(); };
  const handleRelease = (e) => { e.preventDefault(); stopTalking(); };

  // ── UI ────────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🏥 MRI Intercom — Technician Panel</h2>

      {/* Room List */}
      {!selectedRoom ? (
        <div style={styles.roomList}>
          <p style={styles.subtitle}>Select a room to connect:</p>
          {rooms.length === 0 && (
            <p style={styles.hint}>No rooms available. Ask admin to create rooms.</p>
          )}
          {rooms.map((room) => (
            <button
              key={room.name}
              style={styles.roomButton}
              onClick={() => handleRoomSelect(room)}
            >
              🚪 {room.label}
            </button>
          ))}
          <button style={styles.refreshBtn} onClick={fetchRooms}>🔄 Refresh</button>
        </div>
      ) : (
        /* PTT Panel — shown after room selected */
        <div style={styles.pttPanel}>
          {/* Back button */}
          <button style={styles.backBtn} onClick={() => {
            if (roomRef.current) roomRef.current.disconnect();
            setSelectedRoom(null);
            setStatus("disconnected");
            isConnectingRef.current = false;
          }}>
            ← Back to rooms
          </button>

          <p style={styles.subtitle}>Room: <strong style={{color:"#f1f5f9"}}>{selectedRoom.label}</strong></p>

          {/* Connection Status */}
          <div style={styles.statusRow}>
            <div style={{
              ...styles.dot,
              backgroundColor:
                status === "connected" ? "#22c55e" :
                status === "connecting" ? "#f59e0b" : "#ef4444"
            }} />
            <span style={styles.statusText}>
              {status === "connected" ? "Connected" :
               status === "connecting" ? "Connecting..." : "Disconnected"}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={styles.errorBox}>
              ⚠️ {error}
              <button style={styles.retryBtn} onClick={() => connectToRoom(selectedRoom.name)}>
                Retry
              </button>
            </div>
          )}

          {/* PTT Button */}
          <button
            style={{
              ...styles.pttButton,
              backgroundColor:
                status !== "connected" ? "#334155" :
                isTalking ? "#ef4444" : "#2563eb",
              transform: isTalking ? "scale(0.93)" : "scale(1)",
              boxShadow: isTalking
                ? "0 0 0 12px rgba(239,68,68,0.25)"
                : "0 4px 24px rgba(37,99,235,0.5)",
              cursor: status !== "connected" ? "not-allowed" : "pointer",
            }}
            onMouseDown={handlePress}
            onMouseUp={handleRelease}
            onMouseLeave={handleRelease}
            onTouchStart={handlePress}
            onTouchEnd={handleRelease}
            disabled={status !== "connected"}
          >
            {status === "connecting" ? "⏳ Connecting..." :
             status === "disconnected" ? "❌ Offline" :
             isTalking ? "🔴 TALKING..." : "🎙️ HOLD TO TALK"}
          </button>

          <p style={styles.hint}>
            {status !== "connected" ? "Waiting for connection..." :
             isTalking ? "🔊 Patient can hear you now" :
             "Hold the button and speak"}
          </p>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", minHeight: "100vh",
    backgroundColor: "#0f172a", fontFamily: "sans-serif",
    gap: "16px", padding: "20px",
  },
  title: { color: "#f1f5f9", fontSize: "20px", marginBottom: "6px" },
  subtitle: { color: "#94a3b8", fontSize: "15px", marginBottom: "8px" },
  roomList: { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" },
  roomButton: {
    width: "240px", padding: "14px 20px",
    backgroundColor: "#1e293b", color: "#f1f5f9",
    border: "1px solid #334155", borderRadius: "10px",
    fontSize: "15px", cursor: "pointer",
  },
  refreshBtn: {
    marginTop: "8px", padding: "8px 20px",
    backgroundColor: "#334155", color: "#94a3b8",
    border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px"
  },
  pttPanel: { display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" },
  backBtn: {
    alignSelf: "flex-start", padding: "6px 14px",
    backgroundColor: "transparent", color: "#64748b",
    border: "1px solid #334155", borderRadius: "6px",
    cursor: "pointer", fontSize: "13px"
  },
  statusRow: { display: "flex", alignItems: "center", gap: "8px" },
  dot: { width: "10px", height: "10px", borderRadius: "50%" },
  statusText: { color: "#94a3b8", fontSize: "14px" },
  pttButton: {
    width: "200px", height: "200px", borderRadius: "50%",
    border: "none", color: "white", fontSize: "16px",
    fontWeight: "bold", transition: "all 0.15s ease",
    userSelect: "none", marginTop: "10px",
  },
  hint: { color: "#64748b", fontSize: "14px" },
  errorBox: {
    backgroundColor: "#1e1e2e", color: "#f87171",
    padding: "10px 16px", borderRadius: "8px",
    fontSize: "13px", display: "flex", alignItems: "center", gap: "12px"
  },
  retryBtn: {
    backgroundColor: "#334155", color: "white",
    border: "none", borderRadius: "6px",
    padding: "4px 12px", cursor: "pointer", fontSize: "12px"
  },
};