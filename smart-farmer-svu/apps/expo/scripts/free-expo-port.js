const net = require("node:net");

const port = 8081;
const server = net.createServer();

server.once("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use.`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.once("listening", () => {
  server.close(() => {
    console.log(`Port ${port} is available.`);
  });
});

server.listen(port, "0.0.0.0");
