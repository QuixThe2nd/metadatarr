import './log';
import { CONFIG, testConfig } from './config';
import { startServer } from './classes/server';
import { properties } from './classes/Torrent';
import { booleanActions, stringActions, arrayStringActions, filteredActions } from './schemas';
import { importPlugins, runHooks } from './plugins';
import { CacheEngine } from './classes/CacheEngine';

export const cacheEngine = new CacheEngine();

await testConfig();

if (CONFIG.CORE().DRY_RUN) {
  console.log("======== PROPERTIES ========")
  Object.entries(properties).forEach(type => {
    console.log(`|\n| ${type[0]}:`)
    Object.keys(type[1]).forEach(property => {
      console.log(`| - ${property}`)
    })
  })
  console.log("|\n======== PROPERTIES ========\n")
  console.log("======== ACTIONS ========")
  console.log('|\n| Actions:')
  console.log(`| - ${filteredActions.join("()\n| - ")}()`)
  console.log(`| - ${booleanActions.join("(bool)\n| - ")}(bool)`)
  console.log(`| - ${stringActions.join("(string)\n| - ")}(string)`)
  console.log(`| - ${arrayStringActions.join("(string[])\n| - ")}(string[])`)
  console.log("|\n======== ACTIONS ========")
}

const plugins = await importPlugins();
await startServer(plugins.hooks, plugins.endpoints);

for (;;) {
  const changes = await runHooks(plugins.hooks);
  await new Promise(res => setTimeout(res, CONFIG.CORE()[changes === 0 ? 'NO_JOB_WAIT' : 'JOB_WAIT']));
}
