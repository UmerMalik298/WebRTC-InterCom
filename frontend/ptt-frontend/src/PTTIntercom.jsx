import React, { useState, useEffect, useRef } from "react";
import { Room, RoomEvent, createLocalAudioTrack } from "livekit-client";

const BACKEND_URL = "https://web-production-e7803.up.railway.app";

export default function PTTIntercom() {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [status, setStatus] = useState("disconnected");
  const [isTalking, setIsTalking] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isEmergency, setIsEmergency] = useState(false);
  const [error, setError] = useState(null);

  const roomRef = useRef(null);
  const audioTrackRef = useRef(null);
  const broadcastRoomsRef = useRef([]); // holds all room connections during broadcast
  const isConnectingRef = useRef(false);

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

  const handleRoomSelect = async (room) => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
      audioTrackRef.current = null;
      setStatus("disconnected");
      setIsTalking(false);
    }
    setSelectedRoom(room);
    setError(null);
    await connectToRoom(room.name);
  };

  const connectToRoom = async (roomName) => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    setStatus("connecting");

    try {
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

      room.on(RoomEvent.Connected, () => { setStatus("connected"); setError(null); });
      room.on(RoomEvent.Disconnected, () => {
        setStatus("disconnected");
        setIsTalking(false);
        isConnectingRef.current = false;
      });

      // Listen for broadcast / emergency data messages from backend
      room.on(RoomEvent.DataReceived, (payload) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload));
          if (msg.type === "broadcast") setIsBroadcasting(true);
          if (msg.type === "emergency_override") setIsEmergency(true);
        } catch {}
      });

      await room.connect(livekit_url, token, { autoSubscribe: true });

      const audioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      audioTrackRef.current = audioTrack;
      await room.localParticipant.publishTrack(audioTrack);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await audioTrack.mute();

    } catch (err) {
      setError("Connection failed: " + err.message);
      setStatus("disconnected");
      isConnectingRef.current = false;
    }
  };

  // ── PTT (single room) ─────────────────────────────────────────────
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

  // ── Broadcast (connect to ALL rooms simultaneously) ───────────────
  const startBroadcast = async () => {
    if (isBroadcasting) return;
    setIsBroadcasting(true);
    setError(null);

    try {
      // Notify backend to send data message to all rooms
      await fetch(`${BACKEND_URL}/api/rooms/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      // Connect to every room and publish same audio track
      const connections = [];
      for (const room of rooms) {
        const res = await fetch(`${BACKEND_URL}/api/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_name: room.name,
            participant_name: "technician-broadcast",
            is_technician: true,
          }),
        });
        const { token, livekit_url } = await res.json();

        const lkRoom = new Room({ adaptiveStream: true, dynacast: true });
        await lkRoom.connect(livekit_url, token, { autoSubscribe: false });

        const audioTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        await lkRoom.localParticipant.publishTrack(audioTrack);
        // unmute immediately — broadcast is always live
        await audioTrack.unmute();
        connections.push({ room: lkRoom, track: audioTrack });
      }

      broadcastRoomsRef.current = connections;

    } catch (err) {
      setError("Broadcast failed: " + err.message);
      setIsBroadcasting(false);
    }
  };

  const stopBroadcast = async () => {
    for (const { room, track } of broadcastRoomsRef.current) {
      await track.mute();
      await room.disconnect();
    }
    broadcastRoomsRef.current = [];
    setIsBroadcasting(false);
  };

  // ── Emergency Override ────────────────────────────────────────────
  const triggerEmergency = async () => {
    if (isEmergency) {
      // Cancel emergency
      setIsEmergency(false);
      await stopBroadcast();
      return;
    }

    setIsEmergency(true);
    setError(null);

    try {
      // Notify backend — mutes all patients, sends emergency signal
      await fetch(`${BACKEND_URL}/api/rooms/emergency-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      // Also start broadcasting audio to all rooms
      await startBroadcast();

    } catch (err) {
      setError("Emergency override failed: " + err.message);
      setIsEmergency(false);
    }
  };

  const handlePress = (e) => { e.preventDefault(); startTalking(); };
  const handleRelease = (e) => { e.preventDefault(); stopTalking(); };

  // ── UI ────────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>

      {/* Emergency Banner */}
      {isEmergency && (
        <div style={styles.emergencyBanner}>
          🚨 EMERGENCY OVERRIDE ACTIVE — All rooms notified
          <button style={styles.cancelBtn} onClick={triggerEmergency}>Cancel</button>
        </div>
      )}

      {/* Broadcast Banner */}
      {isBroadcasting && !isEmergency && (
        <div style={styles.broadcastBanner}>
          📢 BROADCASTING TO ALL ROOMS
          <button style={styles.cancelBtn} onClick={stopBroadcast}>Stop</button>
        </div>
      )}

      <h2 style={styles.title}>🏥 MRI Intercom — Technician Panel</h2>

      {/* Global Controls — always visible */}
      <div style={styles.globalControls}>
        <button
          style={{
            ...styles.broadcastBtn,
            backgroundColor: isBroadcasting ? "#d97706" : "#1d4ed8",
            opacity: isEmergency ? 0.5 : 1,
          }}
          onClick={isBroadcasting ? stopBroadcast : startBroadcast}
          disabled={isEmergency}
        >
          {isBroadcasting ? "⏹ Stop Broadcast" : "📢 Broadcast All"}
        </button>

        <button
          style={{
            ...styles.emergencyBtn,
            backgroundColor: isEmergency ? "#7f1d1d" : "#dc2626",
            animation: isEmergency ? "pulse 1s infinite" : "none",
          }}
          onClick={triggerEmergency}
        >
          {isEmergency ? "🚨 CANCEL EMERGENCY" : "🚨 Emergency Override"}
        </button>
      </div>

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
        <div style={styles.pttPanel}>
          <button style={styles.backBtn} onClick={() => {
            if (roomRef.current) roomRef.current.disconnect();
            setSelectedRoom(null);
            setStatus("disconnected");
            isConnectingRef.current = false;
          }}>
            ← Back to rooms
          </button>

          <p style={styles.subtitle}>
            Room: <strong style={{ color: "#f1f5f9" }}>{selectedRoom.label}</strong>
          </p>

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
                isEmergency ? "#7f1d1d" :
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
            disabled={status !== "connected" || isEmergency || isBroadcasting}
          >
            {isEmergency ? "🚨 EMERGENCY" :
             isBroadcasting ? "📢 BROADCASTING" :
             status === "connecting" ? "⏳ Connecting..." :
             status === "disconnected" ? "❌ Offline" :
             isTalking ? "🔴 TALKING..." : "🎙️ HOLD TO TALK"}
          </button>

          <p style={styles.hint}>
            {isEmergency ? "Emergency active — PTT disabled" :
             isBroadcasting ? "Broadcasting to all rooms" :
             status !== "connected" ? "Waiting for connection..." :
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
  globalControls: {
    display: "flex", gap: "12px", marginBottom: "8px", flexWrap: "wrap",
    justifyContent: "center",
  },
  broadcastBtn: {
    padding: "10px 20px", borderRadius: "8px",
    border: "none", color: "white", fontWeight: "bold",
    fontSize: "14px", cursor: "pointer",
  },
  emergencyBtn: {
    padding: "10px 20px", borderRadius: "8px",
    border: "none", color: "white", fontWeight: "bold",
    fontSize: "14px", cursor: "pointer",
  },
  emergencyBanner: {
    width: "100%", maxWidth: "500px",
    backgroundColor: "#7f1d1d", color: "white",
    padding: "12px 20px", borderRadius: "8px",
    fontWeight: "bold", fontSize: "14px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  broadcastBanner: {
    width: "100%", maxWidth: "500px",
    backgroundColor: "#1e40af", color: "white",
    padding: "12px 20px", borderRadius: "8px",
    fontWeight: "bold", fontSize: "14px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "rgba(255,255,255,0.2)", color: "white",
    border: "none", borderRadius: "6px",
    padding: "4px 12px", cursor: "pointer", fontSize: "12px",
  },
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