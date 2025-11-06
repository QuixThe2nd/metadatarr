import type Torrent from "../src/classes/Torrent";
import type Client from "../src/clients/client";
import type { Instruction } from "../src/schemas";

const hook = async (torrents: ReturnType<typeof Torrent>[], client: Client): Promise<Instruction[]> => {
  console.log(client)
  for (const torrent of torrents) console.log(torrent.get().tracker)

  await new Promise(res => setTimeout(res, 10_000))
  return [];
}

export default hook;
