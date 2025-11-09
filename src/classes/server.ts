import express from 'express';
import { runPlugins, type PluginEndpoints } from '../plugins';

export const startServer = (plugins: PluginEndpoints): Promise<void> => new Promise(resolve => {
  const app = express();
  app.use(express.json());

  for (const [name, endpoint] of plugins) app.post(`/plugins/${name}`, endpoint);

  app.post('/api/run-jobs', (_, res) => {
    console.log('Job run manually requested')
    runPlugins().catch(console.error);
    res.status(200).send();
  });

  // app.use((_, res) => res.type('html').send(fs.readFileSync('./web/index.html', 'utf8')));

  app.listen(9191, () => {
    console.log('Server started at http://localhost:9191');
    resolve();
  })
});
