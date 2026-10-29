'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseDockerPs, parsePorts } = require('../lib/discover-docker.js');

const LINE_A = JSON.stringify({
  Names: 'supabase_studio_game_cards',
  Image: 'public.ecr.aws/supabase/studio:2026.06.29',
  Ports: '0.0.0.0:54323->3000/tcp, [::]:54323->3000/tcp',
  State: 'running',
  Status: 'Up 3 hours',
});
const LINE_B = JSON.stringify({
  Names: 'supabase_pg_meta_game_cards',
  Image: 'supabase/postgres-meta:v0.96.6',
  Ports: '',
  State: 'running',
  Status: 'Up 3 hours',
});
const LINE_UDP = JSON.stringify({
  Names: 'dns-sidecar',
  Image: 'coredns/coredns:latest',
  Ports: '0.0.0.0:53->53/udp',
  State: 'running',
  Status: 'Up 1 hour',
});
const LINE_C = JSON.stringify({
  Names: 'old-app',
  Image: 'old/app:1',
  Ports: '127.0.0.1:9000->80/tcp',
  State: 'exited',
  Status: 'Exited (0) 2 days ago',
});

test('parseDockerPs returns one row per published host port', () => {
  const rows = parseDockerPs(`${LINE_A}\n${LINE_B}\n${LINE_C}`);
  const keys = rows.map(r => r.key).sort();
  assert.deepEqual(keys, ['docker/old-app:9000', 'docker/supabase_studio_game_cards:54323']);
  const studio = rows.find(r => r.key === 'docker/supabase_studio_game_cards:54323');
  assert.equal(studio.container, 'supabase_studio_game_cards');
  assert.equal(studio.containerPort, 3000);
  assert.equal(studio.state, 'running');
  assert.equal(studio.image, 'public.ecr.aws/supabase/studio:2026.06.29');
  assert.equal(studio.status, 'Up 3 hours');
  const exited = rows.find(r => r.key === 'docker/old-app:9000');
  assert.equal(exited.state, 'exited');
});

test('parseDockerPs ignores containers without published ports', () => {
  assert.deepEqual(parseDockerPs(LINE_B), []);
  assert.deepEqual(parseDockerPs(LINE_UDP), []);
});

test('parseDockerPs handles malformed and blank input without throwing', () => {
  assert.deepEqual(parseDockerPs(''), []);
  assert.deepEqual(parseDockerPs('not json\n'), []);
  assert.deepEqual(parseDockerPs('{}\n{"Names":"x"}'), []);
});

test('parsePorts understands every published-port format docker prints', () => {
  assert.deepEqual(
    parsePorts('0.0.0.0:3000->8080/tcp, [::]:3000->8080/tcp'),
    [{ host: '127.0.0.1', hostPort: 3000, containerPort: 8080, protocol: 'tcp' }]
  );
  assert.deepEqual(
    parsePorts('127.0.0.1:9000->80/tcp'),
    [{ host: '127.0.0.1', hostPort: 9000, containerPort: 80, protocol: 'tcp' }]
  );
  assert.deepEqual(
    parsePorts('54322->5432/tcp'),
    [{ host: '127.0.0.1', hostPort: 54322, containerPort: 5432, protocol: 'tcp' }]
  );
  assert.deepEqual(parsePorts(''), []);
});
