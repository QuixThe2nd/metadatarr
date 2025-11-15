import z from 'zod';
import type { HookInputs } from "../src/plugins";
import type { Instruction } from "../src/schemas";

export const ConfigSchema = z.object({
  ISSUE_TAG: z.string().default('!issue'),
  UNREGISTERED_MESSAGES: z.array(z.string()).default(['unregistered torrent', 'Torrent has been deleted.'])
});

export const hook = async ({ torrents, config }: HookInputs<z.infer<typeof ConfigSchema>>): Promise<Instruction[]> => {
  const instructions: Instruction[] = [];
  for (const torrent of torrents) {
    const trackers = await torrent.trackers();
    if (trackers === null) continue;
    const erroredTrackers = trackers.filter(tracker => tracker.status === 4);
    let trackerIssue = false;
    if (erroredTrackers.length) {
      trackerIssue = true;
      for (const tracker of erroredTrackers) if (config.UNREGISTERED_MESSAGES.includes(tracker.msg)) instructions.push({ hash: torrent.get().hash, then: 'delete', arg: true })
    }
    if (trackerIssue && config.ISSUE_TAG.length) instructions.push({ hash: torrent.get().hash, then: 'addTags', arg: [config.ISSUE_TAG] });
  }
  return [];
};