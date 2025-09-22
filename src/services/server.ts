import fs from 'fs';
import express from 'express';
import z from 'zod';
import Qbittorrent from './qBittorrent';

const UncrossSeedRequestSchema = z.object({
  extra: z.object({
    result: z.enum(['INJECTED', 'FAILURE'], "Unexpected result type"),
    searchee: z.object({
      infoHash: z.string().min(1, 'InfoHash is required')
    }),
    infoHashes: z.array(z.string()).min(1, 'At least one infoHash is required')
  })
});

export const startServer = (api: Qbittorrent) => new Promise(resolve => {
  const app = express();
  app.use(express.json());

  app.post('/api/uncross-seed', async (req, res) => {
    const validatedData = UncrossSeedRequestSchema.parse(req.body);
    const payload = validatedData.extra;
    if (payload.result === 'INJECTED') {
      const old_infohash = payload.searchee.infoHash;
      const old_torrent = (await api.torrents()).find(torrent => torrent.hash === old_infohash);
      if (old_torrent && !old_torrent.private) {
        console.log("\x1b[32m[Cross-Seed]\x1b[0m Replacing public torrent");
        await api.delete([old_infohash]);
        if (old_torrent.category && payload.infoHashes[0]) await api.setCategory([payload.infoHashes[0]], old_torrent.category);
      }
    }
    res.status(200).send();
  });

  app.use((req, res) => res.type('html').send(fs.readFileSync('./web/index.html', 'utf8')));

  const server = app.listen(9090, () => {
    console.log('Server started at http://localhost:9090');
    resolve(server);
  });
});