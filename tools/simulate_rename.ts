import Naming from '../src/jobs/Naming'
import Client from '../src/clients/client'

const name = ''; // Top Gun 1986 2160p PMTP WEB-DL DDPA 5 1 DV HDR H 265-PiRaTeS
const filter = '';

if (name.length) {
  console.log(Naming.test(name));
  process.exit()
}

const client = await Client.connect()

const torrents = await client.torrents();
const tests = [...new Set(torrents.map(t => t.name).filter(t => t.includes(filter)))];

const fails: Record<string, { originalName: string, name: string, count: number }> = {}
for (const test of tests.sort(() => Math.random() > 0.5 ? 1 : -1)) {
  const { other, ...result } = Naming.test(test);
  if (other.length !== 0 && other.includes(filter)) {
    fails[other] ??= { originalName: test, count: 0, ...result};
    fails[other].count++;
  }
}

const failCount = Object.values(fails).reduce((a, b) => a + b.count, 0);
for (const fail of Object.entries(fails).sort((a, b) => a[1].count - b[1].count)) console.log(JSON.stringify(fail, null, 2))
console.log('Failures:', failCount)
console.log('Successes:', tests.length - failCount)
console.log('Fail Rate:', `${Math.round(10_000*failCount/tests.length)/100  }%`)
