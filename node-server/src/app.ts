import { WebSocketServer } from "ws";
import { RealtimeAgent, RealtimeSession } from "@openai/agents-realtime";
import dotenv from "dotenv";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.error(
        `Environment variable "OPENAI_API_KEY" is required.\n` +
        `Please set it in your .env file.`
    );
    process.exit(1);
}

const PORT = 3001;
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", async (ws, req) => {
    if (!req.url) {
        console.log("No URL provided, closing connection.");
        ws.close();
        return;
    }

    const url = new URL(req.url, `https://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname !== "/") {
        console.log(`Invalid pathname: "${pathname}"`);
        ws.close();
        return;
    }

    const meetingId = url.searchParams.get("meeting_id");
    if (!meetingId) {
        console.log("No meeting ID provided, closing connection.");
        ws.close();
        return;
    }

    const data = await fetch(`https://jarvis-eight-tan.vercel.app/api/meetings/${meetingId}/instructions`)
        .then(res => res.json())
        .catch(err => {
            console.log("Error fetching instructions:", err);
            ws.close();
            return;
        });

    console.log("Instructions:", data.instructions);
    if (!data.instructions) {
        console.log("No instructions provided, closing connection.");
        ws.close();
        return;
    }

    console.log("Browser connected");

    const agent = new RealtimeAgent({
        name: "Atlas",
        instructions: data.instructions,
    });

    // Configure turn detection for interruption support
    const session = new RealtimeSession(agent, {
        config: {
            audio: {
                input: {
                    turnDetection: {
                        type: "server_vad",
                        interrupt_response: true,
                        threshold: 0.5,
                        prefixPaddingMs: 500,
                        silenceDurationMs: 500
                    }
                }
            }
        }
    });

    // Connect to OpenAI Realtime API
    try {
        console.log(`Connecting to OpenAI...`);
        await session.connect({ apiKey: OPENAI_API_KEY });
        console.log(`Connected to OpenAI with turn detection enabled`);
    } catch (e) {
        console.log(`Error connecting to OpenAI: ${e instanceof Error ? e.message : String(e)}`);
        ws.close();
        return;
    }

    // Relay raw audio from browser to OpenAI
    ws.on("message", (data) => {
        if (data instanceof Buffer || data instanceof ArrayBuffer) {
            // Convert Buffer to ArrayBuffer if needed
            const audioData = data instanceof Buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
            session.sendAudio(audioData as ArrayBuffer);
        }
    });

    // Relay audio from OpenAI to browser
    session.transport.on("audio", (event) => {
        // Send raw audio data back to browser
        ws.send(event.data);
    });

    // Handle disconnection
    ws.on("close", () => {
        console.log("Browser disconnected");
        session.close();
    });

    session.transport.on("connection_change", (status) => {
        if (status === "disconnected") {
            console.log("OpenAI session closed");
            ws.close();
        }
    });
});

console.log(`Websocket server listening on port ${PORT}`);