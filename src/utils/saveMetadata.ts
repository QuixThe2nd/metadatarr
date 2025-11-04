import type { Instance } from "webtorrent";
import parseTorrent from 'parse-torrent';
import type Client from "../clients/client";

export const saveMetadata = async (webtorrent: Instance, client: Client, metadata: Buffer): Promise<void> => {
  // eslint-disable-next-line
  const hash = (await parseTorrent(metadata)).infoHash!;
  await client.add(metadata);
  if (await webtorrent.get(hash)) {
    await webtorrent.remove(hash);
    console.log(hash, '\x1b[34m[WebTorrent]\x1b[0m Killed');
  }
}