import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { NIGHT_RE } from './digest/types.js';
import { readNight } from './digest/read-night.js';
import { DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const id = c.req.param('night');
    const night = NIGHT_RE.test(id) ? readNight(config.runsDir, id) : null;
    if (!night) {
      return c.html(
        <Layout title="digest" lane={lane()}>
          <p class="mute">no run log for {id}</p>
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest ${id}`} lane={lane()}>
        <DigestPage night={night} />
      </Layout>,
    );
  });

  app.get('/api/digest/:night', (c) => {
    const param = c.req.param('night');
    const night = NIGHT_RE.test(param) ? readNight(config.runsDir, param) : null;
    if (night === null) return c.json({ error: 'no run log', night: param }, 404);
    return c.json(night);
  });

  return app;
}
