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

const PORT = 3000;
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

    console.log("Browser connected");

    const agent = new RealtimeAgent({
        name: "My Agent",
        instructions: "You are a helpful assistant.",
    });

    const session = new RealtimeSession(agent);

    // Connect to OpenAI Realtime API
    try {
        console.log(`Connecting to OpenAI...`);
        await session.connect({ apiKey: OPENAI_API_KEY });
        console.log(`Connected to OpenAI successfully!`);
    } catch (e) {
        console.log(`Error connecting to OpenAI: ${e.message}`);
        ws.close();
        return;
    }

    // Relay raw audio from browser to OpenAI
    ws.on("message", (data) => {
        if (data instanceof Buffer || data instanceof ArrayBuffer) {
            // Convert Buffer to ArrayBuffer if needed
            const audioData = data instanceof Buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
            session.sendAudio(audioData);
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