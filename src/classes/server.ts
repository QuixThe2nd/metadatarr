import express from 'express';
import { runHooks, type Hooks, type PluginEndpoints } from '../plugins';
import { logContext } from '../log';

export const startServer = (hooks: Hooks, endpoints: PluginEndpoints): Promise<void> => logContext('server', () => new Promise(resolve => {
  const app = express();
  app.use(express.json());

  for (const [name, endpoint] of endpoints) app.post(`/plugins/${name}`, endpoint);

  app.post('/api/run-jobs', (_, res) => {
    console.log('Job run manually requested')
    runHooks(hooks).catch(console.error);
    res.status(200).send();
  });

  // app.use((_, res) => res.type('html').send(fs.readFileSync('./web/index.html', 'utf8')));

  app.listen(9191, () => {
    console.log('Server started at http://localhost:9191');
    resolve();
  })
}));
