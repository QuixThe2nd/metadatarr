import type { HookInputs } from "../src/plugins";
import type { Instruction } from "../src/schemas";

const hook = async ({ torrents, client }: HookInputs): Promise<Instruction[]> => {
  console.log(client)
  for (const torrent of torrents) console.log(torrent.get().tracker)

  await new Promise(res => setTimeout(res, 10_000))
  return [];
}

export default hook;
