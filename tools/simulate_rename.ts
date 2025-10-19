import Naming from '../src/jobs/Naming'
import Qbittorrent from '../src/classes/qBittorrent'

const name = 'Ratatouille (2007) UHD 2160p BluRay DV HDR10+ HEVC Multi DD 5.1-ĶOCHÂ';
const filter = '';

if (name.length) {
  console.log(Naming.test(name));
  process.exit()
}

const qB = await Qbittorrent.connect()

const torrents = await qB.torrents();
const tests = torrents.map(t => t.name).filter(t => t.includes(filter));

const fails: Record<string, { originalName: string, name: string, count: number }> = {}
for (const test of tests.sort(() => Math.random() > 0.5 ? 1 : -1)) {
  const { other, ...result } = Naming.test(test);
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
