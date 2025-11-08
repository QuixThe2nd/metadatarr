import z from 'zod';
import { QuerySchema, selectorEngine } from "../src/classes/SelectorEngine";
import type Client from '../src/clients/client';
import type { Request, Response } from 'express';

const UncrossSeedRequestSchema = z.object({
  extra: z.object({
    result: z.enum(['INJECTED', 'FAILURE'], "Unexpected result type"),
    searchee: z.object({ infoHash: z.string().min(1, 'InfoHash is required') }),
    infoHashes: z.array(z.string()).min(1, 'At least one infoHash is required')
  })
});

export const ConfigSchema = z.object({
  FILTERS: z.array(QuerySchema).default([
    {"key": "private", "comparator": "!="},
    {"key": "tags", "comparator": "==", "value": ["@FNP", "@MLK", "@RUT"]}
  ])
});

export const endpoint = (client: Client, config: z.infer<typeof ConfigSchema>) => {
  return async (req: Request, res: Response): Promise<void> => {
    const validatedData = UncrossSeedRequestSchema.parse(req.body);
    const payload = validatedData.extra;
    if (payload.result === 'INJECTED') {
      const torrents = await client.torrents();
      const oldTorrent = torrents.find(t => t.get().hash === payload.searchee.infoHash);
      if (oldTorrent && config.FILTERS.some(f => selectorEngine.execute([oldTorrent], f, true).length !== 0)) {
        console.log("\x1b[32m[Cross-Seed]\x1b[0m Uncross-Seeding torrent");
        await oldTorrent.delete();
        const newTorrent = torrents.find(t => t.get().hash === payload.infoHashes[0]);
        if (oldTorrent.get().category !== null && payload.infoHashes.length !== 0) await newTorrent?.setCategory(oldTorrent.get().category ?? '');
        await newTorrent?.addTags('uncross-seed');
      }
    }
    res.status(200).send();
  }
}
