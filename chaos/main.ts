import { createChaosServer } from "./app";

const port = Number(process.env.CHAOS_PORT || 4000);
const { server } = createChaosServer();

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`chaos site → http://127.0.0.1:${port}  (control panel: /control)\n`);
});
