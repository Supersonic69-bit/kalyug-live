
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
 const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "https://kalyug-live.vercel.app",
  "https://kalyugliveby.free-aibybhavnani.com"
];

app.use(cors({ origin: allowedOrigins }));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

const waitingUsers = new Set();
const partners = new Map();

app.get("/", (req, res) => {
  res.json({
    app: "KALYUG LIVE",
    status: "online"
  });
});

function removeFromQueue(id) {
  waitingUsers.delete(id);
}

function disconnectPartner(id, notify = true) {
  const partnerId = partners.get(id);

  if (!partnerId) return;

  partners.delete(id);
  partners.delete(partnerId);

  if (notify && io.sockets.sockets.has(partnerId)) {
    io.to(partnerId).emit("partner_disconnected");
  }
}

function findPartner(socket) {
  removeFromQueue(socket.id);
  disconnectPartner(socket.id);

  for (const candidateId of waitingUsers) {
    if (
      candidateId !== socket.id &&
      io.sockets.sockets.has(candidateId) &&
      !partners.has(candidateId)
    ) {
      waitingUsers.delete(candidateId);

      partners.set(socket.id, candidateId);
      partners.set(candidateId, socket.id);

      socket.emit("matched", { partnerId: candidateId });

      io.to(candidateId).emit("matched", {
        partnerId: socket.id
      });

      return;
    }
  }

  waitingUsers.add(socket.id);
  socket.emit("waiting");
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("find_partner", () => {
    findPartner(socket);
  });

  socket.on("next_partner", () => {
    findPartner(socket);
  });

  socket.on("webrtc_offer", (data) => {
    const partnerId = partners.get(socket.id);

    if (
      partnerId &&
      data &&
      data.offer
    ) {
      io.to(partnerId).emit("webrtc_offer", {
        offer: data.offer,
        from: socket.id
      });
    }
  });

  socket.on("webrtc_answer", (data) => {
    const partnerId = partners.get(socket.id);

    if (
      partnerId &&
      data &&
      data.answer
    ) {
      io.to(partnerId).emit("webrtc_answer", {
        answer: data.answer,
        from: socket.id
      });
    }
  });

  socket.on("webrtc_ice_candidate", (data) => {
    const partnerId = partners.get(socket.id);

    if (
      partnerId &&
      data &&
      data.candidate
    ) {
      io.to(partnerId).emit(
        "webrtc_ice_candidate",
        {
          candidate: data.candidate,
          from: socket.id
        }
      );
    }
  });

  socket.on("report_user", () => {
    const partnerId = partners.get(socket.id);

    if (partnerId) {
      console.log("User report received:", {
        reporter: socket.id,
        reportedUser: partnerId,
        time: new Date().toISOString()
      });
    }

    socket.emit("report_received");
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    disconnectPartner(socket.id);
    console.log("Disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`KALYUG LIVE backend running on ${PORT}`);
});
