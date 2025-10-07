import Naming from '../src/jobs/Naming'
import Qbittorrent from '../src/services/qBittorrent'

const filter = '';

const qB = await Qbittorrent.connect()

const torrents = await qB.torrents();
const tests = torrents.map(t => t.name).filter(t => t.includes(filter));

const fails: Record<string, { originalName: string, name: string, count: number }> = {}
for (const test of tests.sort(() => Math.random() > 0.5 ? 1 : -1)) {
  let { other, ...result } = Naming.test(test);
  if (other && other.includes(filter)) {
    if (!fails[other]) fails[other] = { originalName: test, count: 0, ...result};
    fails[other].count++;
  }
}

const failCount = Object.values(fails).reduce((a, b) => a + b.count, 0);
for (const fail of Object.entries(fails).sort((a, b) => a[1].count - b[1].count)) console.log(JSON.stringify(fail, null, 2))
console.log('Failures:', failCount)
console.log('Successes:', tests.length - failCount)