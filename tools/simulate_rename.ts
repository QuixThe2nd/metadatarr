import Naming from '../src/jobs/Naming'
import Qbittorrent from '../src/classes/qBittorrent'

// console.log(Naming.test('Mad Men S03 br avc-pir8', true));
// process.exit()

const filter = '';
const verbose = false;

const qB = await Qbittorrent.connect()

const torrents = await qB.torrents();
const tests = torrents.map(t => t.name).filter(t => t.includes(filter));

const fails: Record<string, { originalName: string, name: string, count: number }> = {}
for (const test of tests.sort(() => Math.random() > 0.5 ? 1 : -1)) {
  const { other, ...result } = Naming.test(test, verbose);
  if (other.includes(filter)) {
    fails[other] ??= { originalName: test, count: 0, ...result};
    fails[other].count++;
  }
}

const failCount = Object.values(fails).reduce((a, b) => a + b.count, 0);
for (const fail of Object.entries(fails).sort((a, b) => a[1].count - b[1].count)) console.log(JSON.stringify(fail, null, 2))
console.log('Failures:', failCount)
console.log('Successes:', tests.length - failCount)
console.log('Fail Rate:', `${Math.round(10_000*failCount/tests.length)/100  }%`)
