import fs from 'fs';
import express from 'express';
import z from 'zod';
import { runJobs } from '..';
import type Client from '../clients/client';
import { CONFIG } from '../config';
import { selectorEngine } from './SelectorEngine';

const UncrossSeedRequestSchema = z.object({
  extra: z.object({
    result: z.enum(['INJECTED', 'FAILURE'], "Unexpected result type"),
    searchee: z.object({ infoHash: z.string().min(1, 'InfoHash is required') }),
    infoHashes: z.array(z.string()).min(1, 'At least one infoHash is required')
  })
});

export const startServer = (qB: Client): Promise<void> => new Promise(resolve => {
  const app = express();
  app.use(express.json());

  app.post('/api/uncross-seed', async (req, res) => {
    const validatedData = UncrossSeedRequestSchema.parse(req.body);
    const payload = validatedData.extra;
    if (payload.result === 'INJECTED') {
      const torrents = await qB.torrents();
      const oldTorrent = torrents.find(t => t.hash === payload.searchee.infoHash);
      if (oldTorrent && CONFIG.UNCROSS_SEED().FILTERS.some(f => selectorEngine.execute([oldTorrent], f, true).length !== 0)) {
        console.log("\x1b[32m[Cross-Seed]\x1b[0m Uncross-Seeding torrent");
        await oldTorrent.delete();
        const newTorrent = torrents.find(t => t.hash === payload.infoHashes[0]);
        if (oldTorrent.category !== null && payload.infoHashes.length !== 0) await newTorrent?.setCategory(oldTorrent.category);
        await newTorrent?.addTags('uncross-seed');
      }
    }
    res.status(200).send();
  });
  
  app.post('/api/run-jobs', (_, res) => {
    console.log('Job run manually requested')
    runJobs().catch(console.error);
    res.status(200).send();
  });

  app.use((_, res) => res.type('html').send(fs.readFileSync('./web/index.html', 'utf8')));

  app.listen(9191, () => {
    console.log('Server started at http://localhost:9191');
    resolve();
  })
});
