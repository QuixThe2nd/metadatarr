import { ConfigSchema, test } from '../plugins/Naming'
import Client from '../src/clients/client'
import { parseConfigFile } from '../src/config';

// Test a single name instead of all in qBittorrent - Leave empty to disable
const name = '';
// Test all strings in qBittorrent containing a string - Leave empty to disable
const filter = '';

const config = parseConfigFile('plugins/naming.ts', ConfigSchema);

if (name.length) {
  console.log(await test(name, config));
  process.exit()
}

const client = await Client.connect()

const torrents = await client.torrents();
const names = torrents.map(t => t.get().name).filter(t => t.includes(filter));
// const names = [...new Set(torrents.map(t => t.name).filter(t => t.includes(filter)))];

const fails: Record<string, { originalName: string, name: string, count: number }> = {}
for (const name of names.sort(() => Math.random() > 0.5 ? 1 : -1)) {
  const { other, ...result } = await test(name, config);
  if (other.length !== 0 && other.includes(filter)) {
    fails[other] ??= { originalName: name, count: 0, ...result};
    fails[other].count++;
  }
}

const failCount = Object.values(fails).reduce((a, b) => a + b.count, 0);
for (const fail of Object.entries(fails).sort((a, b) => a[1].count - b[1].count)) console.log(JSON.stringify(fail, null, 2))
console.log('Failures:', failCount)
console.log('Successes:', names.length - failCount)
console.log('Fail Rate:', `${Math.round(10_000*failCount/names.length)/100  }%`)
