import { useState, useEffect, useRef, useCallback } from "react";
// @ts-expect-error - External library without type definitions
import { WavRecorder, WavStreamPlayer } from "./lib/wavtools/index.js";
import "./App.css";

const wsRef = { current: null as WebSocket | null };
const wavRecorderRef = { current: null as WavRecorder | null };
const wavStreamPlayerRef = { current: null as WavStreamPlayer | null };

export function App() {
  const params = new URLSearchParams(window.location.search);
  const RELAY_SERVER_URL = params.get("wss");
  const MEETING_ID = params.get("meeting_id") || "";
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");

  if (!wavRecorderRef.current) {
    wavRecorderRef.current = new WavRecorder({ sampleRate: 24000 });
  }
  if (!wavStreamPlayerRef.current) {
    wavStreamPlayerRef.current = new WavStreamPlayer({ sampleRate: 24000 });
  }
  const isConnectedRef = useRef(false);

  const connectConversation = useCallback(async () => {
    if (isConnectedRef.current) return;
    isConnectedRef.current = true;
    setConnectionStatus("connecting");
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    if (!wavRecorder || !wavStreamPlayer) return;

    try {
      // Connect to microphone
      await wavRecorder.begin();
      console.log("🎤 Microphone connected");

      // Connect to audio output
      await wavStreamPlayer.connect();
      console.log("🔊 Audio output connected");

      // Connect to backend WebSocket server
      const params = new URLSearchParams({
        meeting_id: MEETING_ID
      });
      const ws = new WebSocket(`${RELAY_SERVER_URL}?${params.toString()}`);

      ws.binaryType = "arraybuffer"; // Receive binary data as ArrayBuffer
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("✅ Connected to server");
        setConnectionStatus("connected");
      };

      ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        setConnectionStatus("disconnected");
      };

      ws.onclose = () => {
        console.log("🔌 Disconnected from server");
        setConnectionStatus("disconnected");
        isConnectedRef.current = false;
      };

      // Receive audio from server and play it
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer && event.data.byteLength > 0) {
          wavStreamPlayer.add16BitPCM(event.data, "server-audio");
        }
      };

      // Start recording and send audio to server
      if (!wavRecorder.recording) {
        await wavRecorder.record((data: { mono: ArrayBuffer; raw: ArrayBuffer }) => {
          if (data.mono && data.mono.byteLength > 0 && ws.readyState === WebSocket.OPEN) {
            // Send raw audio data to server
            ws.send(data.mono);
          }
        });
        console.log("🎙️ Recording started");
      }
    } catch (error) {
      console.error("Connection error:", error);
      setConnectionStatus("disconnected");
      isConnectedRef.current = false;
    }
  }, [RELAY_SERVER_URL]);

  const errorMessage = !RELAY_SERVER_URL
    ? 'Missing required "wss" parameter in URL'
    : (() => {
      try {
        new URL(RELAY_SERVER_URL);
        return null;
      } catch {
        return 'Invalid URL format for "wss" parameter';
      }
    })();

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Only run the effect if there's no error
    if (!errorMessage) {
      connectConversation();

      return () => {
        // Cleanup on unmount
        if (wsRef.current) {
          wsRef.current.close();
        }
        if (wavRecorderRef.current?.recording) {
          wavRecorderRef.current.pause();
        }
      };
    }
  }, [errorMessage, connectConversation]);

  return (
    <div className="app-container">
      <div className="status-indicator">
        <div
          className={`status-dot ${errorMessage ? "disconnected" : connectionStatus
            }`}
        />
        <div className="status-text">
          <div className="status-label">
            {errorMessage
              ? "Error:"
              : connectionStatus === "connecting"
                ? "Connecting to:"
                : connectionStatus === "connected"
                  ? "Connected to:"
                  : "Failed to connect to:"}
          </div>
          <div className="status-url">{errorMessage || RELAY_SERVER_URL}</div>
        </div>
      </div>
    </div>
  );
}

export default App;
