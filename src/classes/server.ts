import fs from 'fs';
import express from 'express';
import z from 'zod';
import Qbittorrent from './qBittorrent';
import { PartialTorrent } from './Torrent';

const UncrossSeedRequestSchema = z.object({
  extra: z.object({
    result: z.enum(['INJECTED', 'FAILURE'], "Unexpected result type"),
    searchee: z.object({
      infoHash: z.string().min(1, 'InfoHash is required')
    }),
    infoHashes: z.array(z.string()).min(1, 'At least one infoHash is required')
  })
});

export const startServer = (qB: Qbittorrent) => new Promise(resolve => {
  const app = express();
  app.use(express.json());

  app.post('/api/uncross-seed', async (req, res) => {
    const validatedData = UncrossSeedRequestSchema.parse(req.body);
    const payload = validatedData.extra;
    if (payload.result === 'INJECTED') {
      const oldTorrent = (await qB.torrents()).find(torrent => torrent.hash === payload.searchee.infoHash);
      const newTorrent = (await qB.torrents()).find(torrent => torrent.hash === payload.infoHashes[0])!;
      if (oldTorrent && !oldTorrent.private) {
        console.log("\x1b[32m[Cross-Seed]\x1b[0m Replacing public torrent");
        await oldTorrent.delete();
        if (oldTorrent.category && payload.infoHashes[0]) await newTorrent.setCategory(oldTorrent.category);
        await newTorrent.addTags('uncross-seed');
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