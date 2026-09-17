import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Servidor escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
});
